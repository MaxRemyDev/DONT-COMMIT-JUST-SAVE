import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { resolveGitDir } from '../utils/git';
import { showNotification } from '../utils/notifications';
import { SIGNAL_FILES } from '../constants';
import { setupGitHook } from '../services/gitHooks';

let isShowingError = false;
const signalWatchers = new Map<string, fs.FSWatcher>();

// CHECKS FOR SIGNAL FILE, SHOWS ERROR MODAL IF PRESENT, THEN REMOVES FILE
async function consumeSignalFile(gitDir: string, signalFile: string, title: string, detail: string): Promise<void> {
    if (isShowingError) { return; }

    const filePath = path.join(gitDir, signalFile);
    if (!fs.existsSync(filePath)) { return; }

    try {
        isShowingError = true;
        await showNotification('error', title, detail);
    } finally {
        if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); }
        isShowingError = false;
    }
}

// SETS UP AND REGISTERS FS.WATCH FOR GIT SIGNAL FILES (PUSH_BLOCKED, PULL_DETECTED)
// SHOWS MODAL ERRORS IF SIGNAL FILES APPEAR
function ensureGitSignalWatcher(workspaceRoot: string): void {
    if (signalWatchers.has(workspaceRoot)) { return; }

    const gitDir = resolveGitDir(workspaceRoot);
    if (!gitDir) { return; }

    const processSignals = async (filenames?: string[]): Promise<void> => {
        const toCheck = filenames?.length ? filenames : [SIGNAL_FILES.PUSH_BLOCKED, SIGNAL_FILES.PULL_DETECTED];
        for (const f of toCheck) {
            if (f === SIGNAL_FILES.PUSH_BLOCKED) {
                await consumeSignalFile(
                    gitDir, SIGNAL_FILES.PUSH_BLOCKED,
                    'PUSH BLOCKED',
                    [
                        'A "DONT COMMIT JUST SAVE" commit exists.',
                        '',
                        '⚠ Remove or amend it first.'
                    ].join('\n')
                );
            }

            if (f === SIGNAL_FILES.PULL_DETECTED) {
                await consumeSignalFile(
                    gitDir, SIGNAL_FILES.PULL_DETECTED,
                    'HEADS UP',
                    [
                        'This repo has a "DONT COMMIT JUST SAVE" commit (example: from a pull).',
                        '',
                        '⚠ Remove or amend it first.'
                    ].join('\n')
                );
            }
        }
    };

    queueMicrotask(() => { void processSignals().catch(() => { /* IGNORE */ }); });

    try {
        const watcher = fs.watch(gitDir, (...args) => {
            const filename = args[1];
            void (async () => {
                const raw = filename ? filename.toString() : '';
                if (!raw) { await processSignals(); return; }
                if (raw !== SIGNAL_FILES.PUSH_BLOCKED && raw !== SIGNAL_FILES.PULL_DETECTED) { return; }
                await processSignals([raw]);
            })().catch(() => { /* IGNORE */ });
        });

        signalWatchers.set(workspaceRoot, watcher);
    } catch {
        // IGNORE WATCHER FAILURES (EXAMPLE: GIT DIR NOT WATCHABLE)
    }
}

// CLOSE AND CLEAR ALL ACTIVE GIT SIGNAL FILE WATCHERS.
function disposeSignalWatchers(): void {
    for (const watcher of signalWatchers.values()) { watcher.close(); }
    signalWatchers.clear();
}

// RIGISTER WATCHER TO MONITOR GIT DIR FOR SIGNAL FILES
// HANDLES ADD/REMOVE EVENTS
export function registerSignalWatcher(context: vscode.ExtensionContext): void {
    vscode.workspace.workspaceFolders?.forEach(folder => ensureGitSignalWatcher(folder.uri.fsPath));

    const workspaceWatcher = vscode.workspace.onDidChangeWorkspaceFolders(event => {
        event.added.forEach(folder => {
            setupGitHook(folder.uri.fsPath);
            ensureGitSignalWatcher(folder.uri.fsPath);
        });

        event.removed.forEach(folder => {
            const root = folder.uri.fsPath;
            const watcher = signalWatchers.get(root);
            if (watcher) { watcher.close(); }
            signalWatchers.delete(root);
        });
    });

    context.subscriptions.push(workspaceWatcher);
    context.subscriptions.push({ dispose: disposeSignalWatchers });
}
