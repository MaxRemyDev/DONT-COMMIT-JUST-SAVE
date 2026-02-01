import * as vscode from 'vscode';
import { setupGitHook } from './services/gitHooks';
import { registerInsertDontCommit } from './features/insertDontCommit';
import { registerSoftReset } from './features/softReset';
import { registerSignalWatcher } from './features/signalWatcher';

// INITIALIZES EXTENSION ON ACTIVATE: SETS UP GIT HOOKS AND REGISTERS FEATURES
export async function activate(context: vscode.ExtensionContext): Promise<void> {
    vscode.workspace.workspaceFolders?.forEach(folder => setupGitHook(folder.uri.fsPath));

    registerInsertDontCommit(context);
    registerSoftReset(context);
    registerSignalWatcher(context);
}

export function deactivate(): void {
    // NO CLEANUP NEEDED (SUBSCRIPTIONS HANDLED BY VSCODE)
}
