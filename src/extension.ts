import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { showNotification, withProgress } from './utils/notifications';
import { runCommand } from './utils/git';
import { resetHistory } from './services/resetHistory';
import { setupGitHook } from './services/gitHooks';

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

                const response = await showNotification(
                    'warning',
                    'Warning: This operation can be risky!',
                    `This will:
• Reset all DONT COMMIT JUST SAVE commits
• Attempt to preserve other commits through cherry-pick
• Stage all changes from reset commits

Potential risks:
• Merge conflicts during cherry-pick
• Loss of commit history
• Possible staging conflicts

While you can undo this operation using the Reset History button, the undo process itself might also cause conflicts.

Are you sure you want to proceed?`
                );

                // CHECK IF USER WANTS TO PROCEED
                if (!response || (typeof response === 'object' && response.title !== 'Proceed')) {
                    return;
                }

                await withProgress('Resetting DONT COMMIT JUST SAVE commits...', async (progress) => {
                    // GET CURRENT BRANCH NAME
                    progress.report({ message: 'Analyzing current branch...' });
                    const currentBranch = await runCommand('git rev-parse --abbrev-ref HEAD', repoPath);

                    // GET THE LAST PUSHED COMMIT HASH
                    progress.report({ message: 'Finding last pushed commit...', increment: 10 });
                    let lastPushedCommit;
                    try {
                        lastPushedCommit = await runCommand(`git rev-parse origin/${currentBranch}`, repoPath);
                    } catch (e) {
                        lastPushedCommit = await runCommand('git rev-list --max-parents=0 HEAD', repoPath);
                    }

                    // ANALYZE COMMITS
                    progress.report({ message: 'Analyzing commits...', increment: 20 });
                    const allCommits = await runCommand(`git rev-list HEAD ${lastPushedCommit ? `^${lastPushedCommit}` : ''}`, repoPath);
                    const allCommitsList = allCommits.split('\n').filter(c => c);

                    // READ COMMIT MESSAGES
                    if (allCommitsList.length > 0) {
                        progress.report({ message: 'Reading commit messages...', increment: 30 });
                        const commitMessages = await Promise.all(
                            allCommitsList.map(hash =>
                                runCommand(`git log -1 --format=%B ${hash}`, repoPath)
                            )
                        );

                        // GET DONT COMMIT JUST SAVE COMMITS
                        const dontCommitHashes = allCommitsList.filter((hash, index) =>
                            commitMessages[index].includes('DONT COMMIT JUST SAVE')
                        );

                        // GET NORMAL COMMITS
                        if (dontCommitHashes.length > 0) {
                            const normalCommits = allCommitsList.filter(hash => !dontCommitHashes.includes(hash));

                            // RESET TO LAST PUSHED COMMIT
                            progress.report({ message: 'Resetting to last pushed commit...', increment: 40 });
                            await runCommand(`git reset --hard ${lastPushedCommit}`, repoPath);

                            // CHERRY-PICK NORMAL COMMITS
                            if (normalCommits.length > 0) {
                                for (let i = 0; i < normalCommits.length; i++) {
                                    const commit = normalCommits[i];
                                    progress.report({
                                        message: `Cherry-picking normal commits (${i + 1}/${normalCommits.length})...`,
                                        increment: Math.floor(40 + (20 * (i / normalCommits.length)))
                                    });
                                    await runCommand(`git cherry-pick ${commit}`, repoPath);
                                }
                            }

                            // APPLY DONT COMMIT JUST SAVE CHANGES
                            progress.report({ message: 'Applying DONT COMMIT JUST SAVE changes...', increment: 80 });
                            for (let i = 0; i < dontCommitHashes.length; i++) {
                                const commit = dontCommitHashes[i];
                                progress.report({
                                    message: `Applying changes from DONT COMMIT JUST SAVE commit (${i + 1}/${dontCommitHashes.length})...`,
                                    increment: Math.floor(80 + (15 * (i / dontCommitHashes.length)))
                                });
                                await runCommand(`git diff ${commit}^ ${commit} | git apply --index --cached`, repoPath);
                            }

                            // FINALIZE CHANGES
                            progress.report({ message: 'Finalizing changes...', increment: 95 });
                            await runCommand('git checkout .', repoPath);

                            resetHistory.addReset(repoPath, dontCommitHashes, normalCommits, currentBranch); // ADD RESET TO HISTORY

                            // SHOW SUCCESS NOTIFICATION
                            await showNotification(
                                'info',
                                `Successfully reset ${dontCommitHashes.length} local DONT COMMIT JUST SAVE commits`,
                                `Operation Summary:
• Branch: ${currentBranch}
• DONT COMMIT JUST SAVE commits reset: ${dontCommitHashes.length}
• Normal commits preserved: ${normalCommits.length}
• Changes from DONT COMMIT JUST SAVE commits are staged
• Use 'Reset History' to undo if needed`,
                                true // Show Details button for reset operation
                            );
                        } else {
                            await showNotification('info', 'No local DONT COMMIT JUST SAVE commits found');
                        }
                    } else {
                        await showNotification('info', 'No local commits found');
                    }
                });
            } catch (error: any) {
                await showNotification(
                    'error',
                    'Failed to reset commits',
                    `Error details:\n${error.message || error}`
                );
            }
        }
    });
    context.subscriptions.push(resetDisposable);

    // REGISTER COMMAND TO SHOW RESET HISTORY
    let historyDisposable = vscode.commands.registerCommand('extension.showResetHistory', () => {
        resetHistory.showHistory();
    });
    context.subscriptions.push(historyDisposable);

    // WATCH FOR NEW WORKSPACES
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(event => {
            event.added.forEach(folder => {
                setupGitHook(folder.uri.fsPath);
            });
        })
    );

    let isShowingError = false; // CHECK IF ERROR IS BEING SHOWN

    // MONITOR FOR BLOCKED PUSHES
    const interval = setInterval(async () => {
        if (isShowingError) return; // RETURN IF ERROR IS BEING SHOWN

        // CHECK FOR BLOCKED PUSHES
        for (const folder of vscode.workspace.workspaceFolders || []) {
            const blockFile = path.join(folder.uri.fsPath, '.git', 'PUSH_BLOCKED');
            if (fs.existsSync(blockFile)) {
                try {
                    isShowingError = true;
                    await showNotification(
                        'error',
                        "Push blocked: Found commit with 'DONT COMMIT JUST SAVE' message",
                        "Please remove or amend the commit before pushing."
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

    context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

export function deactivate() { }
