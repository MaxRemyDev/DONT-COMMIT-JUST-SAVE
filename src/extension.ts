import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// LOGGING UTILITIES
const LOG_FILE = path.join(os.tmpdir(), 'dont-commit-just-save.md');

interface LogEntry {
    timestamp: string;
    type: 'success' | 'warning' | 'error';
    message: string;
    details?: string;
    command?: string;
    duration?: number;
}

const logToFile = async (entry: LogEntry) => {
    const icon = {
        success: '✅',
        warning: '⚠️',
        error: '❌'
    }[entry.type];

    // CREATE OR CLEAR LOG FILE AT START OF OPERATION
    if (entry.message.includes('Warning: This operation can be risky!')) {
        fs.writeFileSync(LOG_FILE, `# DONT COMMIT JUST SAVE - Operation Log\n\n`);
    }

    let logLine = ''; // INITIALIZE

    // LOG COMMANDS
    if (entry.command?.includes('git')) {
        logLine = `${icon} ${entry.timestamp} - ${entry.command} (${entry.duration}ms)\n`;
    } else {
        const status = entry.type.toUpperCase();
        logLine = `${icon} ${status} - ${entry.message} - ${entry.timestamp}\n`;
    }

    // APPEND LOG LINE TO FILE
    try {
        fs.appendFileSync(LOG_FILE, logLine);
    } catch (error) {
        console.error('Failed to write to log file:', error);
    }
};

// SHOW NOTIFICATION PUSH BLOCKED
const showNotification = async (type: 'info' | 'warning' | 'error', message: string, details?: string, showDetailsButton: boolean = false): Promise<{ title: string } | undefined> => {
    // LOG ENTRY IN NOW DATE
    const now = new Date().toLocaleString();
    const logEntry: LogEntry = {
        timestamp: now,
        type: type === 'info' ? 'success' : type === 'warning' ? 'warning' : 'error',
        message,
        details
    };

    await logToFile(logEntry); // LOG TO FILE

    // SHOW DETAILS BUTTON IF REQUESTED
    const showDetails = async (): Promise<void> => {
        const doc = await vscode.workspace.openTextDocument({
            content: fs.readFileSync(LOG_FILE, 'utf8'),
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, { preview: true });
    };

    // SHOW INFO OR WARNING MESSAGE
    if (type === 'info') {
        const buttons = showDetailsButton ? [{ title: 'Show Details' }] : [];
        return vscode.window.showInformationMessage(
            message,
            { detail: details, modal: false },
            ...buttons
        ).then(selection => {
            if (selection?.title === 'Show Details') {
                showDetails();
            }
            return selection as { title: string } | undefined;
        });
    } else if (type === 'warning') {
        // SHOW WARNING MESSAGE
        return vscode.window.showWarningMessage(
            message,
            { detail: details, modal: true },
            { title: 'Proceed' }
        );
    } else {
        // SHOW ERROR MESSAGE
        return vscode.window.showErrorMessage(
            message,
            { detail: details, modal: false }
        ).then(selection => selection as { title: string } | undefined);
    }
};

// NOTIFICATION WITH PROGRESS BAR
const withProgress = async <T>(title: string, task: (progress: vscode.Progress<{ increment?: number; message?: string }>) => Promise<T>): Promise<T> => {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `$(sync~spin) ${title}`,
        cancellable: false
    }, async (progress) => {
        const startTime = Date.now();
        let lastIncrement = 0;

        // UPDATE PROGRESS BAR
        const updateProgress = (increment?: number, message?: string) => {
            const currentIncrement = increment ?? lastIncrement;
            lastIncrement = currentIncrement;

            progress.report({
                increment: currentIncrement,
                message: message ? `[${currentIncrement}%] ${message}` : undefined
            });
        };

        updateProgress(0, 'Starting...'); // STARTING

        try {
            const result = await task({
                report: ({ increment, message }) => updateProgress(increment, message)
            });
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            updateProgress(100, `Completed in ${duration}s`); // COMPLETED
            return result;
        } catch (error) {
            updateProgress(100, '$(error) Failed'); // FAILED
            throw error;
        }
    });
};

// RESET HISTORY CLASS TO TRACK RECENT RESETS
class ResetHistory {
    private static readonly MAX_HISTORY = 10; // MAX HISTORY
    private history: Array<{
        timestamp: number;
        commits: string[];
        branch: string;
        repoPath: string;
        normalCommits: string[];
    }> = [];

    // ADD RESET TO HISTORY
    addReset(repoPath: string, dontCommitHashes: string[], normalCommits: string[], branch: string) {
        this.history.unshift({
            timestamp: Date.now(),
            commits: dontCommitHashes,
            branch,
            repoPath,
            normalCommits
        });

        // KEEP ONLY LAST MAX_HISTORY ITEMS
        if (this.history.length > ResetHistory.MAX_HISTORY) {
            this.history.pop();
        }
    }

    // SHOW HISTORY QUICK PICK
    async showHistory() {
        if (this.history.length === 0) {
            vscode.window.showInformationMessage('No reset history available');
            return;
        }

        // CREATE HISTORY ITEMS
        const items = this.history.map((item, index) => {
            const date = new Date(item.timestamp).toLocaleString();
            return {
                label: `$(history) Reset on ${date}`,
                description: `${item.commits.length} commits on ${item.branch}`,
                detail: `Click to undo this reset`,
                index
            };
        });

        // SHOW HISTORY QUICK PICK
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a reset to undo',
            title: 'Reset History'
        });

        // UNDO SELECTED RESET
        if (selected) {
            this.undoReset(selected.index);
        }
    }

    // UNDO SELECTED RESET
    private async undoReset(index: number) {
        const item = this.history[index];
        if (!item) return;

        try {
            // FIRST STASH ANY CURRENT CHANGES
            await logToFile({
                timestamp: new Date().toLocaleString(),
                type: 'warning',
                message: 'Warning: This operation can be risky!',
            });

            await runCommand('git stash', item.repoPath); // STASH ANY CURRENT CHANGES

            // RESET TO BEFORE THE NORMAL COMMITS
            await runCommand(`git reset --hard HEAD~${item.normalCommits.length}`, item.repoPath);

            // APPLY ALL COMMITS IN ORDER
            for (const commit of [...item.normalCommits, ...item.commits]) {
                await runCommand(`git cherry-pick ${commit}`, item.repoPath);
            }

            // POP THE STASH IF WE CREATED ONE
            const stashList = await runCommand('git stash list', item.repoPath);
            if (stashList) {
                await runCommand('git stash pop', item.repoPath);
            }

            await showNotification(
                'info',
                `Successfully restored reset from ${new Date(item.timestamp).toLocaleString()}`,
                `Operation Summary:
• Branch: ${item.branch}
• DONT COMMIT JUST SAVE commits restored: ${item.commits.length}
• Normal commits preserved: ${item.normalCommits.length}`,
                true // Show Details button for restore operation
            );

            // REMOVE THIS ITEM FROM HISTORY
            this.history.splice(index, 1);
        } catch (error) {
            await showNotification(
                'error',
                `Failed to undo reset: ${error}`,
                undefined,
                true // Show Details button for failed operations too
            );
        }
    }
}

// CREATE A SINGLETON INSTANCE
const resetHistory = new ResetHistory();

// UTILITY FUNCTION TO RUN GIT COMMANDS
const runCommand = async (cmd: string, cwd?: string): Promise<string> => {
    const startTime = Date.now();
    try {
        const result = await new Promise<string>((resolve, reject) => {
            exec(cmd, { cwd }, (error, stdout, stderr) => {
                // CHECK FOR PATCH AND MERGE FAILURES
                if (stderr && (
                    stderr.includes('patch failed:') ||
                    stderr.includes('patch does not apply') ||
                    stderr.includes('Merge conflict marker encountered') ||
                    stderr.includes('CONFLICT')
                )) {
                    reject(new Error(`CONFLICT_ERROR: ${stderr}`));
                    return;
                }
                if (error) {
                    reject(new Error(stderr || error.message));
                    return;
                }
                resolve(stdout.trim());
            });
        });

        // LOG ONLY IMPORTANT COMMANDS
        if (cmd.includes('reset') || cmd.includes('cherry-pick')) {
            await logToFile({
                timestamp: new Date().toLocaleString(),
                type: 'success',
                message: 'Command executed successfully',
                command: cmd,
                details: result || 'No output',
                duration: Date.now() - startTime
            });
        }

        return result;
    } catch (error: any) {
        // HANDLE CONFLICTS SPECIFICALLY
        if (error.message.startsWith('CONFLICT_ERROR:')) {
            const details = error.message.replace('CONFLICT_ERROR:', '').trim();
            await showNotification(
                'error',
                'Reset blocked: Conflicts detected',
                `The reset operation was blocked because it would cause conflicts.\n\nDetails:\n${details}\n\nPlease resolve conflicts manually before proceeding.`,
                true // ADD SHOW DETAILS BUTTON
            );
            throw new Error('Reset blocked due to conflicts');
        }

        // LOG ONLY IMPORTANT ERRORS
        if (cmd.includes('reset') || cmd.includes('cherry-pick')) {
            await logToFile({
                timestamp: new Date().toLocaleString(),
                type: 'error',
                message: 'Command failed',
                command: cmd,
                details: error.message,
                duration: Date.now() - startTime
            });
        }
        throw error;
    }
};

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
    context.subscriptions.push(resetDisposable); // REGISTER COMMAND TO RESET "DONT COMMIT JUST SAVE" COMMITS

    // REGISTER COMMAND TO SHOW RESET HISTORY
    let historyDisposable = vscode.commands.registerCommand('extension.showResetHistory', () => {
        resetHistory.showHistory();
    });
    context.subscriptions.push(historyDisposable); // REGISTER COMMAND TO SHOW RESET HISTORY

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

    context.subscriptions.push({ dispose: () => clearInterval(interval) }); // CLEAR INTERVAL ON DISPOSE
}

export function deactivate() { }
