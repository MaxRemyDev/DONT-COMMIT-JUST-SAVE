import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { showNotification } from './utils/notifications';
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
