import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

const MARKER_START = '# DONT-COMMIT-JUST-SAVE BEGIN';
const MARKER_END = '# DONT-COMMIT-JUST-SAVE END';

// RESOLVE GIT DIRECTORY FROM WORKSPACE ROOT
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

// ESCAPE REGULAR EXPRESSION FOR USE IN REPLACE OPERATIONS
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// UPSERT HOOK BLOCK INTO HOOK FILE
function upsertHookBlock(hookPath: string, block: string): void {
    let content = '';
    let newline = '\n';

    if (fs.existsSync(hookPath)) {
        content = fs.readFileSync(hookPath, 'utf8');
        newline = content.includes('\r\n') ? '\r\n' : '\n';
    } else {
        content = '#!/bin/sh\n';
    }

    if (!content.startsWith('#!')) { content = `#!/bin/sh${newline}${content}`; }

    const blockWithMarkers = `${MARKER_START}${newline}${block}${newline}${MARKER_END}`;
    const blockRegex = new RegExp(`${escapeRegExp(MARKER_START)}[\\s\\S]*?${escapeRegExp(MARKER_END)}\\s*`, 'm');

    if (blockRegex.test(content)) {
        content = content.replace(blockRegex, `${blockWithMarkers}${newline}${newline}`);
    } else {
        const firstLfIdx = content.indexOf('\n');
        const insertPos = firstLfIdx === -1 ? content.length : firstLfIdx + 1;
        const prefix = content.slice(0, insertPos);
        const suffix = content.slice(insertPos);
        content = `${prefix}${newline}${blockWithMarkers}${newline}${newline}${suffix}`;
    }

    fs.writeFileSync(hookPath, content, { mode: 0o755 });
}

// BUILD PRE-PUSH HOOK BLOCK FOR CHECKING FOR 'DONT COMMIT JUST SAVE' MESSAGE IN PUSH COMMITS
function buildPrePushBlock(): string {
    return [
        'dont_commit_just_save_git_dir() {',
        '    git rev-parse --git-dir 2>/dev/null || echo ".git"',
        '}',
        '',
        'dont_commit_just_save_check_push() {',
        '    commits="$(git log @{u}..HEAD --pretty=%B 2>/dev/null || true)"',
        '    if [ -z "$commits" ]; then',
        '        return 0',
        '    fi',
        '',
        '    if echo "$commits" | grep -q "DONT COMMIT JUST SAVE"; then',
        '        git_dir="$(dont_commit_just_save_git_dir)"',
        '        touch "$git_dir/PUSH_BLOCKED" 2>/dev/null || true',
        '        sleep 2',
        '',
        '        echo ""',
        '        echo "\\033[1;31m╔═══════════════════════════════════════════════╗"',
        '        echo "║                   PUSH BLOCKED                ║"',
        '        echo "║                                               ║"',
        '        echo "║  Found commit with \'DONT COMMIT JUST SAVE\'    ║"',
        '        echo "║  Please remove or amend the commit before push║"',
        '        echo "║                                               ║"',
        '        echo "╚═══════════════════════════════════════════════╝\\033[0m"',
        '        echo ""',
        '        return 1',
        '    fi',
        '',
        '    return 0',
        '}',
        '',
        'if ! dont_commit_just_save_check_push; then',
        '    exit 1',
        'fi',
    ].join('\n');
}

// BUILD POST-MERGE HOOK BLOCK FOR CHECKING FOR 'DONT COMMIT JUST SAVE' MESSAGE IN PULL COMMITS
function buildPostMergeBlock(): string {
    return [
        'dont_commit_just_save_git_dir() {',
        '    git rev-parse --git-dir 2>/dev/null || echo ".git"',
        '}',
        '',
        'dont_commit_just_save_check_pull() {',
        '    git_dir="$(dont_commit_just_save_git_dir)"',
        '',
        '    if [ -f "$git_dir/ORIG_HEAD" ]; then',
        '        commits="$(git log ORIG_HEAD..HEAD --pretty=%B 2>/dev/null || true)"',
        '    else',
        '        # FALLBACK: CHECK LAST 5 COMMITS IF ORIG_HEAD NOT AVAILABLE',
        '        commits="$(git log -5 --pretty=%B 2>/dev/null || true)"',
        '    fi',
        '',
        '    if echo "$commits" | grep -q "DONT COMMIT JUST SAVE"; then',
        '        touch "$git_dir/PULL_DETECTED" 2>/dev/null || true',
        '    fi',
        '',
        '    return 0',
        '}',
        '',
        'dont_commit_just_save_check_pull || true',
    ].join('\n');
}

// SETUP GIT HOOKS FOR PRE-PUSH AND POST-MERGE
export const setupGitHook = (workspaceRoot: string): void => {
    if (!workspaceRoot || workspaceRoot.trim().length === 0) {
        void vscode.window.showErrorMessage('Failed to setup git hook: invalid workspace root path');
        return;
    }

    const gitDir = resolveGitDir(workspaceRoot);
    if (!gitDir) { return; }

    const hooksDir = path.join(gitDir, 'hooks');
    try {
        fs.mkdirSync(hooksDir, { recursive: true });

        // SETUP PRE-PUSH HOOK
        const prePushHookPath = path.join(hooksDir, 'pre-push');
        upsertHookBlock(prePushHookPath, buildPrePushBlock());

        // SETUP POST-MERGE HOOK (TRIGGERED AFTER GIT PULL)
        const postMergeHookPath = path.join(hooksDir, 'post-merge');
        upsertHookBlock(postMergeHookPath, buildPostMergeBlock());
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        void vscode.window.showErrorMessage(`Failed to setup git hook: ${message}`);
    }
}; 
