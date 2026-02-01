import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';
import type { GitAPI, GitExtensionExports } from '../types';
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

// COUNT CONSECUTIVE COMMITS FROM HEAD WHOSE SUBJECT IS "DONT COMMIT JUST SAVE"
export function getConsecutiveDontCommitCount(cwd: string): number {
    try {
        const out = childProcess.execFileSync('git', ['log', '-n', '50', '--pretty=%s'], { cwd, encoding: 'utf8' });
        const subjects = out.split(/\r?\n/).map(s => s.trim());
        let numberOfConsecutiveCommits = 0;
        for (const s of subjects) {
            if (s !== DONT_COMMIT_MESSAGE) { break; }
            numberOfConsecutiveCommits++;
        }
        return numberOfConsecutiveCommits;
    } catch {
        return 0;
    }
}

// GET GIT API FROM VSCODE EXTENSION
export function getGitApi(): GitAPI | undefined {
    const extension = vscode.extensions.getExtension(GIT_EXTENSION_ID);
    const exports = extension?.exports as GitExtensionExports | undefined;
    try { return exports?.getAPI(GIT_API_VERSION); } catch { return undefined; }
}
