import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';
import type { GitAPI, GitExtensionExports, GitRepository } from '../types';
import { GIT_EXTENSION_ID, GIT_API_VERSION, DONT_COMMIT_MESSAGE } from '../constants';

// RESOLVE GIT DIRECTORY FROM WORKSPACE ROOT
// SUPPORTS WORKTREE: .git FILE WITH gitdir: PATH
export function resolveGitDir(workspaceRoot: string): string | undefined {
    const dotGitPath = path.join(workspaceRoot, '.git');
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

// RUNS A GIT COMMAND IN GIVEN FOLDER AND RETURNS STDOUT TRIMMED OR UNDEFINED IF ERROR - EXECUTES SYNC, UTF-8, NO SIDE EFFECT
function execGit(cwd: string, args: string[]): string | undefined {
    try {
        const out = childProcess.execFileSync('git', args, { cwd, encoding: 'utf8' });
        const trimmed = out.trim();
        return trimmed.length > 0 ? trimmed : undefined;
    } catch {
        return undefined;
    }
}

// RETURNS THE TRUE HOOKS DIRECTORY PATH, CHECKS core.hooksPath, WORKTREES, THEN DEFAULT .git/hooks - ABSOLUTE FULL PATH ALWAYS
export function resolveHooksDir(workspaceRoot: string): string | undefined {
    const absolute = execGit(workspaceRoot, ['rev-parse', '--absolute-git-path', 'hooks']);
    if (absolute) { return absolute; }

    const configured = execGit(workspaceRoot, ['config', '--path', '--get', 'core.hooksPath']);
    if (configured) { return path.isAbsolute(configured) ? configured : path.resolve(workspaceRoot, configured); }

    const gitDir = resolveGitDir(workspaceRoot);
    if (!gitDir) { return undefined; }
    return path.join(gitDir, 'hooks');
}

// RETURNS TRUE IF THE GIVEN MESSAGE CONTAINS THE "DONT COMMIT JUST SAVE" MARK (CASE INSENSITIVE), ELSE FALSE
function messageHasMarker(message: string): boolean {
    return message.toLowerCase().includes(DONT_COMMIT_MESSAGE.toLowerCase());
}

// CHECKS IF ANY OF THE LAST N COMMITS CONTAIN THE "DONT COMMIT JUST SAVE" MARKER IN THEIR MESSAGE - N=50 BY DEFAULT
export function hasRecentDontCommitMarker(cwd: string, limit: number = 50): boolean {
    try {
        const out = childProcess.execFileSync('git', ['log', '-n', String(limit), '--pretty=%B%x00'], { cwd, encoding: 'utf8' });
        const messages = out.split('\0').map(part => part.trim()).filter(Boolean);
        return messages.some(messageHasMarker);
    } catch {
        return false;
    }
}

// RETURNS TRUE IF THE GIT REPOSITORY HAS AT LEAST ONE COMMIT (HEAD EXISTS), ELSE FALSE
export function hasGitHead(cwd: string): boolean {
    return Boolean(execGit(cwd, ['rev-parse', '--verify', 'HEAD']));
}

// COUNT CONSECUTIVE COMMITS FROM HEAD WHOSE SUBJECT IS "DONT COMMIT JUST SAVE"
export function getConsecutiveDontCommitCount(cwd: string): number {
    try {
        const out = childProcess.execFileSync('git', ['log', '-n', '50', '--pretty=%B%x00'], { cwd, encoding: 'utf8' });
        const subjects = out.split('\0').map(s => s.trim()).filter(Boolean);
        let numberOfConsecutiveCommits = 0;
        for (const s of subjects) {
            if (!messageHasMarker(s)) { break; }
            numberOfConsecutiveCommits++;
        }
        return numberOfConsecutiveCommits;
    } catch {
        return 0;
    }
}

// GET GIT API FROM VSCODE EXTENSION
export async function getGitApi(): Promise<GitAPI | undefined> {
    const extension = vscode.extensions.getExtension(GIT_EXTENSION_ID);
    if (!extension) { return undefined; }
    if (!extension.isActive) {
        try { await extension.activate(); } catch { return undefined; }
    }
    const exports = extension.exports as GitExtensionExports | undefined;
    try { return exports?.getAPI(GIT_API_VERSION); } catch { return undefined; }
}

// RETURN THE GIT REPOSITORY WHOSE ROOT MOST CLOSELY CONTAINS filePath. SELECTS THE DEEPEST MATCHING REPOSITORY ROOT
function getRepoForPath(repositories: GitRepository[], filePath: string): GitRepository | undefined {
    const normalized = path.normalize(filePath);
    const normalizedCmp = process.platform === 'win32' ? normalized.toLowerCase() : normalized;
    let best: GitRepository | undefined;
    let bestLength = -1;
    for (const repo of repositories) {
        const root = repo.rootUri?.fsPath;
        if (!root) { continue; }
        const rootNormalized = path.normalize(root);
        const rootCmp = process.platform === 'win32' ? rootNormalized.toLowerCase() : rootNormalized;
        if (!normalizedCmp.startsWith(rootCmp + path.sep) && normalizedCmp !== rootCmp) { continue; }
        if (root.length > bestLength) {
            best = repo;
            bestLength = root.length;
        }
    }
    return best;
}

// RETURN THE RELEVANT GIT REPOSITORY, PREFER ACTIVE FILE'S REPO OR SHOW A QUICK PICK IF MULTIPLE
export async function pickRepository(
    repositories: GitRepository[],
    options?: { title?: string; placeHolder?: string; preferActive?: boolean; prompt?: boolean }
): Promise<GitRepository | undefined> {
    if (repositories.length === 0) { return undefined; }
    if (repositories.length === 1) { return repositories[0]; }

    const preferActive = options?.preferActive !== false;
    const activePath = vscode.window.activeTextEditor?.document?.uri?.fsPath;
    const activeRepo = activePath ? getRepoForPath(repositories, activePath) : undefined;
    if (preferActive && activeRepo) { return activeRepo; }

    if (options?.prompt === false) { return repositories[0]; }

    const items = repositories.map(repo => {
        const repoPath = repo?.rootUri?.fsPath as string | undefined;
        const label = repoPath ? path.basename(repoPath) : 'Repository';
        return { label, description: repoPath ?? '', repo };
    });

    const selected = await vscode.window.showQuickPick(items, {
        title: options?.title ?? 'Pick repo',
        placeHolder: options?.placeHolder ?? 'Which repo?'
    });

    return selected?.repo;
}
