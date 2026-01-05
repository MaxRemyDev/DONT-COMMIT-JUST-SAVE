import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';
import { showNotification } from './utils/notifications';
import { setupGitHook } from './services/gitHooks';
import { NotificationType } from './types';

export async function activate(context: vscode.ExtensionContext) {
    // SETUP HOOKS FOR EXISTING WORKSPACES
    vscode.workspace.workspaceFolders?.forEach(folder => setupGitHook(folder.uri.fsPath));

    // REGISTER COMMAND TO INSERT "DONT COMMIT JUST SAVE"
    const insertDontCommitDisposable = vscode.commands.registerCommand('extension.insertDontCommit', () => {
        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        const git = gitExtension.getAPI(1);

        if (git.repositories.length > 0) {
            const repo = git.repositories[0];
            repo.inputBox.value = "DONT COMMIT JUST SAVE";
        }
    });

    // REGISTER COMMAND TO SOFT RESET HEAD~N
    const softResetDisposable = vscode.commands.registerCommand('extension.softResetHead', async () => {
        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        if (!gitExtension) {
            await showNotification('error' as NotificationType, 'Git extension not found', 'The built-in vscode.git extension is required.');
            return;
        }

        const git = gitExtension.getAPI(1);
        const repositories = git.repositories as any[];

        // SHOW ERROR NOTIFICATION IF NO GIT REPOSITORY IS FOUND
        if (!repositories || repositories.length === 0) {
            await showNotification('error' as NotificationType, 'No git repository found', 'Open a folder containing a git repository and try again.');
            return;
        }

        // SHOW QUICK PICK TO SELECT THE REPOSITORY TO RESET
        const pickRepo = async (): Promise<any | undefined> => {
            if (repositories.length === 1) { return repositories[0]; }

            const items = repositories.map(repo => {
                const repoPath = repo?.rootUri?.fsPath as string | undefined;
                const label = repoPath ? path.basename(repoPath) : 'Repository';
                return {
                    label,
                    description: repoPath ?? '',
                    repo
                };
            });

            const selected = await vscode.window.showQuickPick(items, {
                title: 'Select repository',
                placeHolder: 'Select the git repository to soft reset'
            });

            return selected?.repo;
        };

        const repo = await pickRepo();
        if (!repo?.rootUri?.fsPath) { return; }

        // SHOW INPUT BOX TO GET THE NUMBER OF COMMITS TO RESET
        const rawCount = await vscode.window.showInputBox({
            title: 'Git soft reset',
            prompt: 'How many commits do you want to soft reset? (HEAD~N)',
            placeHolder: '',
            validateInput: (value: string) => {
                const trimmed = value.trim();
                if (trimmed.length === 0) { return 'Required'; }
                const n = Number(trimmed);
                if (!Number.isInteger(n) || n < 1) { return 'Enter a positive integer (>= 1)'; }
                return undefined;
            }
        });

        if (!rawCount) { return; }
        const count = Number(rawCount.trim());

        // SHOW CONFIRMATION DIALOG
        const confirm = await vscode.window.showWarningMessage(
            `Soft reset last ${count} commit${count > 1 ? 's' : ''}?`,
            {
                modal: true,
                detail: [
                    `This will run: git reset --soft HEAD~${count}`,
                    '',
                    `- Removes the last ${count} commit${count > 1 ? 's' : ''} from history (git log).`,
                    '- Changes stay staged.',
                    '',
                    'If pushed, you may need to force push.'
                ].join('\n')
            },
            { title: 'Reset' },
            { title: 'Cancel', isCloseAffordance: true }
        );

        if (confirm?.title !== 'Reset') { return; }

        // RESET HEAD~N COMMITS
        const cmd = `git reset --soft HEAD~${count}`;
        try {
            childProcess.execSync(cmd, { cwd: repo.rootUri.fsPath, stdio: 'pipe' });
            await showNotification('info' as NotificationType, 'Soft reset completed', cmd);
        } catch (error) {
            const e = error as { message?: string; stderr?: Buffer | string };
            const stderr = typeof e?.stderr === 'string' ? e.stderr : e?.stderr?.toString('utf8');
            const details = [e?.message ?? String(error), stderr ? `\n\nSTDERR:\n${stderr}` : undefined].filter(Boolean).join('');
            await showNotification('error' as NotificationType, 'Soft reset failed', `${cmd}\n\n${details}`);
        }
    });

    // WATCH FOR NEW WORKSPACES
    const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(event => {
        event.added.forEach(folder => setupGitHook(folder.uri.fsPath));
    });

    // WATCH FOR GIT REPOSITORY CHANGES (DETECT PULLS)
    const checkCommitsAfterPull = async () => {
        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        if (!gitExtension) { return; }

        const git = gitExtension.getAPI(1);
        for (const repo of git.repositories) {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(repo.rootUri);
            if (!workspaceFolder) { continue; }

            try {
                // CHECK FOR NEWLY PULLED COMMITS
                let commits = '';
                try {
                    // TRY TO GET COMMITS BETWEEN ORIG_HEAD AND HEAD (ORIG_HEAD IS SET BY GIT PULL)
                    commits = childProcess.execSync('git log ORIG_HEAD..HEAD --pretty=%B', { cwd: workspaceFolder.uri.fsPath, encoding: 'utf8' });
                } catch {
                    // IF ORIG_HEAD DOESN'T EXIST, CHECK LAST 5 COMMITS (FALLBACK)
                    commits = childProcess.execSync('git log -5 --pretty=%B', { cwd: workspaceFolder.uri.fsPath, encoding: 'utf8' });
                }

                if (commits.includes('DONT COMMIT JUST SAVE')) {
                    const pullFile = path.join(workspaceFolder.uri.fsPath, '.git', 'PULL_DETECTED');
                    if (!fs.existsSync(pullFile)) { fs.writeFileSync(pullFile, ''); }
                }
            } catch {
                // IGNORE ERRORS (NOT A GIT REPO OR OTHER ISSUES)
            }
        }
    };

    // LISTEN TO REPOSITORY STATE CHANGES (DELAY CHECK TO ALLOW PULL TO COMPLETE)
    const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
    if (gitExtension) {
        const git = gitExtension.getAPI(1);
        git.repositories.forEach((repo: any) => {
            const stateChangeListener = repo.state.onDidChange(() => { setTimeout(checkCommitsAfterPull, 1000); });
            context.subscriptions.push(stateChangeListener);
        });
    }

    context.subscriptions.push(insertDontCommitDisposable, softResetDisposable, workspaceWatcher);

    let isShowingError = false; // CHECK IF ERROR IS BEING SHOWN

    // MONITOR FOR BLOCKED PUSHES AND PULL DETECTIONS
    const interval = setInterval(async () => {
        if (isShowingError) { return; }

        for (const folder of vscode.workspace.workspaceFolders || []) {
            // CHECK FOR BLOCKED PUSHES (AFTER GIT PUSH)
            const blockFile = path.join(folder.uri.fsPath, '.git', 'PUSH_BLOCKED');
            if (fs.existsSync(blockFile)) {
                try {
                    isShowingError = true;
                    await showNotification(
                        'error' as NotificationType,
                        "Push blocked: Found commit with 'DONT COMMIT JUST SAVE' message",
                        "Please remove or amend the commit before pushing."
                    );

                    if (fs.existsSync(blockFile)) { fs.unlinkSync(blockFile); }
                } finally {
                    isShowingError = false;
                }
            }

            // CHECK FOR PULL DETECTIONS (AFTER GIT PULL)
            const pullFile = path.join(folder.uri.fsPath, '.git', 'PULL_DETECTED');
            if (fs.existsSync(pullFile)) {
                try {
                    isShowingError = true;
                    await showNotification(
                        'error' as NotificationType,
                        "Push blocked: Found commit with 'DONT COMMIT JUST SAVE' message",
                        "Source: DONT COMMIT JUST SAVE"
                    );

                    if (fs.existsSync(pullFile)) { fs.unlinkSync(pullFile); }
                } finally {
                    isShowingError = false;
                }
            }
        }
    }, 100);

    context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

export function deactivate() {
    // NO CLEANUP NEEDED
}
