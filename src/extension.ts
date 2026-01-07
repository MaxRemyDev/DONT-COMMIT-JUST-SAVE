import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';
import { showNotification } from './utils/notifications';
import { setupGitHook } from './services/gitHooks';

type GitRepository = { rootUri?: vscode.Uri; inputBox?: { value: string }; };
type GitAPI = { repositories: GitRepository[]; };
type GitExtensionExports = { getAPI(version: 1): GitAPI; };

const GIT_EXTENSION_ID = 'vscode.git' as const;
const GIT_API_VERSION = 1 as const;
const SIGNAL_FILES = { PUSH_BLOCKED: 'PUSH_BLOCKED', PULL_DETECTED: 'PULL_DETECTED' } as const;

// RESOLVE GIT DIRECTORY FROM WORKSPACE ROOT FOR SIGNAL FILES
function resolveGitDir(workspaceRoot: string): string | undefined {
    const dotGitPath = path.join(workspaceRoot, '.git');
    if (!fs.existsSync(dotGitPath)) { return undefined; }

    try {
        const stat = fs.statSync(dotGitPath);
        if (stat.isDirectory()) { return dotGitPath; }

        if (stat.isFile()) {
            const content = fs.readFileSync(dotGitPath, 'utf8');
            const match = content.match(/^\s*gitdir:\s*(.+)\s*$/m);
            const gitDir = match?.[1]?.trim();
            if (!gitDir) { return undefined; }
            return path.isAbsolute(gitDir) ? gitDir : path.resolve(workspaceRoot, gitDir);
        }
    } catch {
        return undefined;
    }

    return undefined;
}

// GET GIT API FROM VSCODE EXTENSION
function getGitApi(): GitAPI | undefined {
    const extension = vscode.extensions.getExtension(GIT_EXTENSION_ID);
    const exports = extension?.exports as GitExtensionExports | undefined;

    try {
        return exports?.getAPI(GIT_API_VERSION);
    } catch {
        return undefined;
    }
}

// ACTIVATE EXTENSION
export async function activate(context: vscode.ExtensionContext) {
    // SETUP HOOKS FOR EXISTING WORKSPACES
    vscode.workspace.workspaceFolders?.forEach(folder => setupGitHook(folder.uri.fsPath));

    // REGISTER COMMAND TO INSERT "DONT COMMIT JUST SAVE"
    const insertDontCommitDisposable = vscode.commands.registerCommand('extension.insertDontCommit', () => {
        const git = getGitApi();
        if (!git) { return; }

        if (git.repositories.length > 0) {
            const repo = git.repositories[0];
            if (repo?.inputBox) { repo.inputBox.value = "DONT COMMIT JUST SAVE"; }
        }
    });

    // REGISTER COMMAND TO SOFT RESET HEAD~N
    const softResetDisposable = vscode.commands.registerCommand('extension.softResetHead', async () => {
        const git = getGitApi();
        if (!git) {
            await showNotification('error', 'Git extension not found', 'The built-in vscode.git extension is required.');
            return;
        }
        const repositories = git.repositories;

        // SHOW ERROR NOTIFICATION IF NO GIT REPOSITORY IS FOUND
        if (!repositories || repositories.length === 0) {
            await showNotification('error', 'No git repository found', 'Open a folder containing a git repository and try again.');
            return;
        }

        // SHOW QUICK PICK TO SELECT THE REPOSITORY TO RESET
        const pickRepo = async (): Promise<GitRepository | undefined> => {
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
            childProcess.execFileSync('git', ['reset', '--soft', `HEAD~${count}`], { cwd: repo.rootUri.fsPath, stdio: 'pipe' });
            await showNotification('info', 'Soft reset completed', cmd);
        } catch (error) {
            const e = error as { message?: string; stderr?: Buffer | string };
            const stderr = typeof e?.stderr === 'string' ? e.stderr : e?.stderr?.toString('utf8');
            const details = [e?.message ?? String(error), stderr ? `\n\nSTDERR:\n${stderr}` : undefined].filter(Boolean).join('');
            await showNotification('error', 'Soft reset failed', `${cmd}\n\n${details}`);
        }
    });
    context.subscriptions.push(insertDontCommitDisposable, softResetDisposable);

    let isShowingError = false; // CHECK IF ERROR IS BEING SHOWN
    const consumeSignalFile = async (gitDir: string, signalFile: string, title: string, detail: string) => {
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
    };

    const signalWatchers = new Map<string, fs.FSWatcher>();
    const ensureGitSignalWatcher = (workspaceRoot: string) => {
        if (signalWatchers.has(workspaceRoot)) { return; }

        const gitDir = resolveGitDir(workspaceRoot);
        if (!gitDir) { return; }

        const processSignals = async (filenames?: string[]) => {
            const toCheck = filenames?.length ? filenames : [SIGNAL_FILES.PUSH_BLOCKED, SIGNAL_FILES.PULL_DETECTED];
            for (const f of toCheck) {
                if (f === SIGNAL_FILES.PUSH_BLOCKED) {
                    await consumeSignalFile(
                        gitDir,
                        SIGNAL_FILES.PUSH_BLOCKED,
                        "Push blocked: Found commit with 'DONT COMMIT JUST SAVE' message",
                        "Please remove or amend the commit before pushing."
                    );
                }

                if (f === SIGNAL_FILES.PULL_DETECTED) {
                    await consumeSignalFile(
                        gitDir,
                        SIGNAL_FILES.PULL_DETECTED,
                        "Pull detected: Found commit with 'DONT COMMIT JUST SAVE' message",
                        "Source: DONT COMMIT JUST SAVE"
                    );
                }
            }
        };

        // PROCESS LEFTOVER SIGNAL FILES WITHOUT BLOCKING ACTIVATION
        queueMicrotask(() => { void processSignals().catch(() => { /* IGNORE */ }); });

        try {
            const watcher = fs.watch(gitDir, (...args) => {
                const filename = args[1];
                void (async () => {
                    const raw = filename ? filename.toString() : '';
                    if (!raw) {
                        await processSignals();
                        return;
                    }

                    if (raw !== SIGNAL_FILES.PUSH_BLOCKED && raw !== SIGNAL_FILES.PULL_DETECTED) { return; }
                    await processSignals([raw]);
                })().catch(() => { /* IGNORE */ });
            });

            signalWatchers.set(workspaceRoot, watcher);
        } catch {
            // IGNORE WATCHER FAILURES (E.G. GIT DIR NOT WATCHABLE)
        }
    };

    // WATCH SIGNAL FILES FOR CURRENT WORKSPACES
    vscode.workspace.workspaceFolders?.forEach(folder => ensureGitSignalWatcher(folder.uri.fsPath));

    // WATCH FOR NEW/REMOVED WORKSPACES
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

    // ENSURE ALL WATCHERS ARE CLOSED ON DEACTIVATE
    context.subscriptions.push({
        dispose: () => {
            for (const watcher of signalWatchers.values()) { watcher.close(); }
            signalWatchers.clear();
        }
    });
}

export function deactivate() {
    // NO CLEANUP NEEDED
}
