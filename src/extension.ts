import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// UTILITY FUNCTION TO RUN GIT COMMANDS
const runCommand = (cmd: string): Promise<string> =>
    new Promise((resolve, reject) => {
        exec(cmd, (error, stdout, stderr) => {
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
