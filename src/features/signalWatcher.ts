import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { hasRecentDontCommitMarker, resolveGitDir } from '../utils/git';
import { showNotification } from '../utils/notifications';
import { SIGNAL_FILES } from '../constants';
import { setupGitHook } from '../services/gitHooks';

let isShowingError = false;
const signalWatchers = new Map<string, { watcher?: fs.FSWatcher; poller?: NodeJS.Timeout; roots: Set<string> }>();
const workspaceToGitDir = new Map<string, string>();
type PendingSignal = { gitDir: string; signalFile: string; title: string; detail: string };
const pendingSignals: Array<PendingSignal | undefined> = [];
const warnedRepos = new Set<string>();
let watchFn: typeof fs.watch = fs.watch;

export const __test = {
    setWatchFn: (fn: typeof fs.watch): void => { watchFn = fn; },
    resetWatchFn: (): void => { watchFn = fs.watch; },
    enqueuePendingSignal: (signal?: PendingSignal): void => { pendingSignals.push(signal); },
    addWarnedRepo: (gitDir: string): void => { warnedRepos.add(gitDir); },
    clearWarnedRepos: (): void => { warnedRepos.clear(); }
};

// CHECKS FOR SIGNAL FILE, SHOWS ERROR MODAL IF PRESENT, THEN REMOVES FILE
async function consumeSignalFile(gitDir: string, signalFile: string, title: string, detail: string): Promise<void> {
    const filePath = path.join(gitDir, signalFile);
    if (!fs.existsSync(filePath)) { return; }
    if (isShowingError) { pendingSignals.push({ gitDir, signalFile, title, detail }); return; }

    try {
        isShowingError = true;
        await showNotification('error', title, detail);
    } finally {
        if (fs.existsSync(filePath)) { fs.unlinkSync(filePath); }
        isShowingError = false;
    }

    while (pendingSignals.length > 0) {
        const next = pendingSignals.shift();
        if (!next) { break; }
        await consumeSignalFile(next.gitDir, next.signalFile, next.title, next.detail);
    }
}

// SETS UP AND REGISTERS FS.WATCH FOR GIT SIGNAL FILES (PUSH_BLOCKED, PULL_DETECTED)
// SHOWS MODAL ERRORS IF SIGNAL FILES APPEAR
function ensureGitSignalWatcher(workspaceRoot: string): void {
    const gitDir = resolveGitDir(workspaceRoot);
    if (!gitDir) { return; }

    workspaceToGitDir.set(workspaceRoot, gitDir);
    const existing = signalWatchers.get(gitDir);
    if (existing) { existing.roots.add(workspaceRoot); return; }

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
                        'This repo has a "DONT COMMIT JUST SAVE" commit (for example after a pull/rebase/checkout).',
                        '',
                        '⚠ Remove or amend it first.'
                    ].join('\n')
                );
            }
        }
    };

    const checkForMarker = async (): Promise<void> => {
        if (warnedRepos.has(gitDir)) { return; }
        if (!hasRecentDontCommitMarker(workspaceRoot, 50)) { return; }
        warnedRepos.add(gitDir);
        await showNotification(
            'info',
            'Marker commit detected',
            'This repo contains a "DONT COMMIT JUST SAVE" commit. Remove or amend it before pushing.'
        );
    };

    queueMicrotask(() => {
        void processSignals().catch(() => { /* IGNORE */ });
        void checkForMarker().catch(() => { /* IGNORE */ });
    });

    try {
        const watcher = watchFn(gitDir, (...args) => {
            const filename = args[1];
            void (async () => {
                const raw = filename ? filename.toString() : '';
                if (!raw) { await processSignals(); return; }
                if (raw !== SIGNAL_FILES.PUSH_BLOCKED && raw !== SIGNAL_FILES.PULL_DETECTED) { return; }
                await processSignals([raw]);
            })().catch(() => { /* IGNORE */ });
        });

        signalWatchers.set(gitDir, { watcher, roots: new Set([workspaceRoot]) });
    } catch {
        const poller = setInterval(() => { void processSignals().catch(() => { /* IGNORE */ }); }, 5000);
        signalWatchers.set(gitDir, { poller, roots: new Set([workspaceRoot]) });
    }
}

// CLOSE AND CLEAR ALL ACTIVE GIT SIGNAL FILE WATCHERS.
function disposeSignalWatchers(): void {
    for (const entry of signalWatchers.values()) {
        if (entry.watcher) { entry.watcher.close(); }
        if (entry.poller) { clearInterval(entry.poller); }
    }
    signalWatchers.clear();
    workspaceToGitDir.clear();
    pendingSignals.length = 0;
    warnedRepos.clear();
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
            const gitDir = workspaceToGitDir.get(root);

            workspaceToGitDir.delete(root);
            if (!gitDir) { return; }

            const entry = signalWatchers.get(gitDir);
            if (!entry) { return; }
            entry.roots.delete(root);

            if (entry.roots.size === 0) {
                if (entry.watcher) { entry.watcher.close(); }
                if (entry.poller) { clearInterval(entry.poller); }
                signalWatchers.delete(gitDir);
                warnedRepos.delete(gitDir);
            }
        });
    });

    context.subscriptions.push(workspaceWatcher);
    context.subscriptions.push({ dispose: disposeSignalWatchers });
}
