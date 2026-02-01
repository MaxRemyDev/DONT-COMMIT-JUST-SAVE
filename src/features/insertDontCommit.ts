import * as vscode from 'vscode';
import { getGitApi } from '../utils/git';
import { DONT_COMMIT_MESSAGE } from '../constants';

// REGISTERS COMMAND TO INSERT "DONT COMMIT JUST SAVE" MESSAGE INTO ACTIVE REPO INPUT BOX
export function registerInsertDontCommit(context: vscode.ExtensionContext): void {
    const disposable = vscode.commands.registerCommand('extension.insertDontCommit', () => {
        const git = getGitApi();
        if (!git) { return; }

        if (git.repositories.length > 0) {
            const repo = git.repositories[0];
            if (repo?.inputBox) { repo.inputBox.value = DONT_COMMIT_MESSAGE; }
        }
    });
    context.subscriptions.push(disposable);
}
