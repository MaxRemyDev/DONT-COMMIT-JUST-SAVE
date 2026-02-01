import * as vscode from 'vscode';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';
import type { GitRepository } from '../types';
import { getGitApi, getConsecutiveDontCommitCount } from '../utils/git';
import { showNotification } from '../utils/notifications';

const resetConfirmDetail = [
    'Removes from history, keeps changes staged.',
    '',
    '⚠ Force push needed if already pushed.'
].join('\n');

// REGISTERS COMMAND TO SOFT RESET LAST N COMMITS IN PICKED REPO (KEEPS CHANGES STAGED)
export function registerSoftReset(context: vscode.ExtensionContext): void {
    const disposable = vscode.commands.registerCommand('extension.softResetHead', async () => {
        const git = getGitApi();
        if (!git) {
            await showNotification('error', 'Git not available', 'Open a folder that uses Git.');
            return;
        }
        const repositories = git.repositories;

        if (!repositories || repositories.length === 0) {
            await showNotification('error', 'No Git repo', 'Open a folder that is a Git repo.');
            return;
        }

        const pickRepo = async (): Promise<GitRepository | undefined> => {
            if (repositories.length === 1) { return repositories[0]; }

            const items = repositories.map(repo => {
                const repoPath = repo?.rootUri?.fsPath as string | undefined;
                const label = repoPath ? path.basename(repoPath) : 'Repository';
                return { label, description: repoPath ?? '', repo };
            });

            const selected = await vscode.window.showQuickPick(items, {
                title: 'Pick repo',
                placeHolder: 'Which repo to reset?'
            });

            return selected?.repo;
        };

        const repo = await pickRepo();
        if (!repo?.rootUri?.fsPath) { return; }

        const consecutiveCount = getConsecutiveDontCommitCount(repo.rootUri.fsPath);
        let count: number;

        if (consecutiveCount > 0) {
            const confirm = await vscode.window.showWarningMessage(
                `Reset last ${consecutiveCount} 'DONT COMMIT JUST SAVE' commit${consecutiveCount > 1 ? 's' : ''} ?`,
                { modal: true, detail: resetConfirmDetail },
                { title: `Reset ${consecutiveCount}` },
                { title: 'Cancel', isCloseAffordance: true }
            );

            if (confirm?.title !== `Reset ${consecutiveCount}`) { return; }
            count = consecutiveCount;
        } else {
            const rawCount = await vscode.window.showInputBox({
                title: 'Git soft reset',
                prompt: 'How many commits ?',
                placeHolder: '',
                validateInput: (value: string) => {
                    const trimmed = value.trim();
                    if (trimmed.length === 0) { return 'Enter a number'; }
                    const n = Number(trimmed);
                    if (!Number.isInteger(n) || n < 1) { return 'Use 1 or more'; }
                    return undefined;
                }
            });

            if (!rawCount) { return; }
            count = Number(rawCount.trim());

            const confirm = await vscode.window.showWarningMessage(
                `Reset last ${count} commit${count > 1 ? 's' : ''} ?`,
                { modal: true, detail: resetConfirmDetail },
                { title: 'Reset' },
                { title: 'Cancel', isCloseAffordance: true }
            );

            if (confirm?.title !== 'Reset') { return; }
        }

        const cmd = `git reset --soft HEAD~${count}`;
        try {
            childProcess.execFileSync('git', ['reset', '--soft', `HEAD~${count}`], { cwd: repo.rootUri.fsPath, stdio: 'pipe' });
            await showNotification('info', 'Reset done.', cmd);
        } catch (error) {
            const e = error as { message?: string; stderr?: Buffer | string };
            const stderr = typeof e?.stderr === 'string' ? e.stderr : e?.stderr?.toString('utf8');
            const details = [e?.message ?? String(error), stderr ? `\n\nSTDERR:\n${stderr}` : undefined].filter(Boolean).join('');
            await showNotification('error', 'Reset failed', `${cmd}\n\n${details}`);
        }
    });
    context.subscriptions.push(disposable);
}
