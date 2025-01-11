import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// UTILITY FUNCTION TO RUN GIT COMMANDS
const runCommand = (cmd: string, cwd?: string): Promise<string> =>
    new Promise((resolve, reject) => {
        exec(cmd, { cwd }, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(stderr || error.message));
                return;
            }
            resolve(stdout.trim());
        });
    });

// SETUP GIT PRE-PUSH HOOK
const setupGitHook = async (workspaceRoot: string) => {
    const gitHookPath = path.join(workspaceRoot, '.git', 'hooks', 'pre-push');
    const hookContent = `#!/bin/sh

# CHECK FOR DONT COMMIT JUST SAVE
commits=\`git log @{u}..HEAD --pretty=%B\`
if echo "$commits" | grep -q "DONT COMMIT JUST SAVE"; then
    # NOTIFY VS CODE AND WAIT
    touch "${workspaceRoot}/.git/PUSH_BLOCKED"
    sleep 2

    # SHOW TERMINAL MESSAGE
    echo ""
    echo "\\033[1;31m╔═══════════════════════════════════════════════╗"
    echo "║                   PUSH BLOCKED                    ║"
    echo "║                                                  ║"
    echo "║  Found commit with 'DONT COMMIT JUST SAVE'       ║"
    echo "║  Please remove or amend the commit before push   ║"
    echo "║                                                  ║"
    echo "╚═══════════════════════════════════════════════╝\\033[0m"
    echo ""
    exit 1
fi
exit 0
`;

    try {
        fs.writeFileSync(gitHookPath, hookContent, { mode: 0o755 });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to setup git hook: ${error}`);
    }
};

export async function activate(context: vscode.ExtensionContext) {
    // SETUP HOOKS FOR EXISTING WORKSPACES
    vscode.workspace.workspaceFolders?.forEach(folder => {
        setupGitHook(folder.uri.fsPath);
    });

    // REGISTER COMMAND TO INSERT "DONT COMMIT JUST SAVE"
    let disposable = vscode.commands.registerCommand('extension.insertDontCommit', () => {
        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        const git = gitExtension.getAPI(1);

        if (git.repositories.length > 0) {
            const repo = git.repositories[0];
            repo.inputBox.value = "DONT COMMIT JUST SAVE";
        }
    });
    context.subscriptions.push(disposable);

    // REGISTER COMMAND TO RESET "DONT COMMIT JUST SAVE" COMMITS
    let resetDisposable = vscode.commands.registerCommand('extension.resetDontCommit', async () => {
        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        const git = gitExtension.getAPI(1);

        if (git.repositories.length > 0) {
            try {
                const repo = git.repositories[0];
                const repoPath = repo.rootUri.fsPath;

                // GET CURRENT BRANCH NAME
                const currentBranch = await runCommand('git rev-parse --abbrev-ref HEAD', repoPath);

                // GET THE LAST PUSHED COMMIT HASH
                let lastPushedCommit;
                try {
                    lastPushedCommit = await runCommand(`git rev-parse origin/${currentBranch}`, repoPath);
                } catch (e) {
                    // IF NO REMOTE TRACKING, GET THE FIRST COMMIT
                    lastPushedCommit = await runCommand('git rev-list --max-parents=0 HEAD', repoPath);
                }

                // GET ALL COMMITS BETWEEN LAST PUSHED AND HEAD
                const allCommits = await runCommand(`git rev-list HEAD ${lastPushedCommit ? `^${lastPushedCommit}` : ''}`, repoPath);
                const allCommitsList = allCommits.split('\n').filter(c => c);

                if (allCommitsList.length > 0) {
                    // GET COMMIT MESSAGES FOR EACH COMMIT
                    const commitMessages = await Promise.all(
                        allCommitsList.map(hash =>
                            runCommand(`git log -1 --format=%B ${hash}`, repoPath)
                        )
                    );

                    // FIND COMMITS WITH DONT COMMIT JUST SAVE MESSAGE
                    const dontCommitHashes = allCommitsList.filter((hash, index) =>
                        commitMessages[index].includes('DONT COMMIT JUST SAVE')
                    );

                    if (dontCommitHashes.length > 0) {
                        // GET ALL COMMITS THAT ARE NOT DONT COMMIT JUST SAVE
                        const normalCommits = allCommitsList.filter(hash => !dontCommitHashes.includes(hash));

                        // RESET TO THE LAST PUSHED COMMIT
                        await runCommand(`git reset --hard ${lastPushedCommit}`, repoPath);

                        // CHERRY PICK ALL NORMAL COMMITS
                        if (normalCommits.length > 0) {
                            for (const commit of normalCommits.reverse()) {
                                await runCommand(`git cherry-pick ${commit}`, repoPath);
                            }
                        }

                        // STAGE ALL THE CHANGES FROM DONT COMMIT JUST SAVE COMMITS
                        for (const commit of dontCommitHashes) {
                            // GET THE CHANGES AND APPLY THEM DIRECTLY TO INDEX
                            await runCommand(`git diff ${commit}^ ${commit} | git apply --index --cached`, repoPath);
                        }

                        // RESET THE WORKING DIRECTORY TO MATCH INDEX
                        await runCommand('git checkout .', repoPath);

                        vscode.window.showInformationMessage(`Successfully reset ${dontCommitHashes.length} local DONT COMMIT JUST SAVE commits while preserving other commits`);
                    } else {
                        vscode.window.showInformationMessage('No local DONT COMMIT JUST SAVE commits found');
                    }
                } else {
                    vscode.window.showInformationMessage('No local commits found');
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`Failed to reset commits: ${error}`);
            }
        }
    });
    context.subscriptions.push(resetDisposable);

    // WATCH FOR NEW WORKSPACES
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(event => {
            event.added.forEach(folder => {
                setupGitHook(folder.uri.fsPath);
            });
        })
    );

    let isShowingError = false;

    // MONITOR FOR BLOCKED PUSHES
    const interval = setInterval(async () => {
        if (isShowingError) return; // IF ALREADY SHOWING ERROR, RETURN

        // CHECK FOR BLOCKED PUSHES
        for (const folder of vscode.workspace.workspaceFolders || []) {
            const blockFile = path.join(folder.uri.fsPath, '.git', 'PUSH_BLOCKED');
            if (fs.existsSync(blockFile)) {
                try {
                    isShowingError = true;
                    await vscode.window.showErrorMessage(
                        "Push blocked: Found commit with 'DONT COMMIT JUST SAVE' message",
                        {
                            modal: true,
                            detail: "Please remove or amend the commit before pushing."
                        },
                        { title: "OK", isCloseAffordance: true }
                    );

                    if (fs.existsSync(blockFile)) {
                        fs.unlinkSync(blockFile);
                    }
                } finally {
                    isShowingError = false;
                }
            }
        }
    }, 100);

    context.subscriptions.push({ dispose: () => clearInterval(interval) }); // CLEAR INTERVAL ON DISPOSE
}

export function deactivate() { }
