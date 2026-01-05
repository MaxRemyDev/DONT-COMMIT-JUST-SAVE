import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { showNotification } from './utils/notifications';
import { setupGitHook } from './services/gitHooks';
import { NotificationType } from './types';

export async function activate(context: vscode.ExtensionContext) {
    // SETUP HOOKS FOR EXISTING WORKSPACES
    vscode.workspace.workspaceFolders?.forEach(folder => setupGitHook(folder.uri.fsPath));

    // REGISTER COMMAND TO INSERT "DONT COMMIT JUST SAVE"
    let disposable = vscode.commands.registerCommand('extension.insertDontCommit', () => {
        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        const git = gitExtension.getAPI(1);

        if (git.repositories.length > 0) {
            const repo = git.repositories[0];
            repo.inputBox.value = "DONT COMMIT JUST SAVE";
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
                    commits = execSync('git log ORIG_HEAD..HEAD --pretty=%B', { cwd: workspaceFolder.uri.fsPath, encoding: 'utf8' });
                } catch {
                    // IF ORIG_HEAD DOESN'T EXIST, CHECK LAST 5 COMMITS (FALLBACK)
                    commits = execSync('git log -5 --pretty=%B', { cwd: workspaceFolder.uri.fsPath, encoding: 'utf8' });
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

    context.subscriptions.push(disposable, workspaceWatcher);

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
