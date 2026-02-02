import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { resolveHooksDir } from '../utils/git';
import { DONT_COMMIT_MESSAGE, SIGNAL_FILES } from '../constants';

const MARKER_START = '# DONT-COMMIT-JUST-SAVE BEGIN';
const MARKER_END = '# DONT-COMMIT-JUST-SAVE END';

function formatHookError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export const __test = { formatHookError };

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
        'dont_commit_just_save_check_range() {',
        `    if git log --pretty=%B "$@" 2>/dev/null | grep -Fqi "${DONT_COMMIT_MESSAGE}"; then`,
        '        return 1',
        '    fi',
        '    return 0',
        '}',
        '',
        'dont_commit_just_save_check_recent() {',
        `    if git log -n 50 --pretty=%B 2>/dev/null | grep -Fqi "${DONT_COMMIT_MESSAGE}"; then`,
        '        return 1',
        '    fi',
        '    return 0',
        '}',
        '',
        'dont_commit_just_save_check_push() {',
        '    remote_name="$1"',
        '    zero="0000000000000000000000000000000000000000"',
        '    has_lines=0',
        '    while IFS=" " read -r local_ref local_sha remote_ref remote_sha; do',
        '        [ -z "$local_sha" ] && continue',
        '        has_lines=1',
        '        [ "$local_sha" = "$zero" ] && continue',
        '        if [ "$remote_sha" = "$zero" ]; then',
        '            if [ -n "$remote_name" ]; then',
        '                dont_commit_just_save_check_range "$local_sha" --not --remotes="$remote_name" || return 1',
        '            else',
        '                dont_commit_just_save_check_range "$local_sha" || return 1',
        '            fi',
        '        else',
        '            dont_commit_just_save_check_range "$remote_sha..$local_sha" || return 1',
        '        fi',
        '    done',
        '',
        '    if [ "$has_lines" -eq 0 ]; then',
        '        upstream="$(git rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || true)"',
        '        if [ -n "$upstream" ]; then',
        '            dont_commit_just_save_check_range "$upstream..HEAD" || return 1',
        '        else',
        '            dont_commit_just_save_check_recent || return 1',
        '        fi',
        '    fi',
        '',
        '    return 0',
        '}',
        '',
        'if ! dont_commit_just_save_check_push "$1"; then',
        '    git_dir="$(dont_commit_just_save_git_dir)"',
        `    touch "$git_dir/${SIGNAL_FILES.PUSH_BLOCKED}" 2>/dev/null || true`,
        '    sleep 2',
        '',
        '    echo ""',
        '    echo "\\033[1;31m╔═══════════════════════════════════════════════╗"',
        '    echo "║                   PUSH BLOCKED                ║"',
        '    echo "║                                               ║"',
        `    echo "║  Found commit with '${DONT_COMMIT_MESSAGE}'    ║"`,
        '    echo "║  Please remove or amend the commit before push║"',
        '    echo "║                                               ║"',
        '    echo "╚═══════════════════════════════════════════════╝\\033[0m"',
        '    echo ""',
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
        '    commits=""',
        '    if [ -f "$git_dir/ORIG_HEAD" ]; then',
        '        commits="$(git log ORIG_HEAD..HEAD --pretty=%B 2>/dev/null || true)"',
        '    fi',
        '    if [ -z "$commits" ]; then',
        '        # FALLBACK: CHECK LAST 5 COMMITS IF ORIG_HEAD NOT AVAILABLE',
        '        commits="$(git log -5 --pretty=%B 2>/dev/null || true)"',
        '    fi',
        '',
        `    if echo "$commits" | grep -Fqi "${DONT_COMMIT_MESSAGE}"; then`,
        `        touch "$git_dir/${SIGNAL_FILES.PULL_DETECTED}" 2>/dev/null || true`,
        '    fi',
        '',
        '    return 0',
        '}',
        '',
        'dont_commit_just_save_check_pull || true',
    ].join('\n');
}

// BUILD POST-REWRITE HOOK BLOCK (AMEND/REBASE)
function buildPostRewriteBlock(): string {
    return [
        'dont_commit_just_save_git_dir() {',
        '    git rev-parse --git-dir 2>/dev/null || echo ".git"',
        '}',
        '',
        'dont_commit_just_save_check_rewrite() {',
        '    git_dir="$(dont_commit_just_save_git_dir)"',
        '',
        '    commits="$(git log ORIG_HEAD..HEAD --pretty=%B 2>/dev/null || true)"',
        '    if [ -z "$commits" ]; then',
        '        commits="$(git log -5 --pretty=%B 2>/dev/null || true)"',
        '    fi',
        '',
        `    if echo "$commits" | grep -Fqi "${DONT_COMMIT_MESSAGE}"; then`,
        `        touch "$git_dir/${SIGNAL_FILES.PULL_DETECTED}" 2>/dev/null || true`,
        '    fi',
        '',
        '    return 0',
        '}',
        '',
        'dont_commit_just_save_check_rewrite || true',
    ].join('\n');
}

// BUILD POST-CHECKOUT HOOK BLOCK (BRANCH SWITCHES)
function buildPostCheckoutBlock(): string {
    return [
        'dont_commit_just_save_git_dir() {',
        '    git rev-parse --git-dir 2>/dev/null || echo ".git"',
        '}',
        '',
        'dont_commit_just_save_check_checkout() {',
        '    # $3 == 1 means branch checkout, 0 means file checkout',
        '    if [ "$3" != "1" ]; then',
        '        return 0',
        '    fi',
        '',
        '    git_dir="$(dont_commit_just_save_git_dir)"',
        '    commits="$(git log -5 --pretty=%B 2>/dev/null || true)"',
        `    if echo "$commits" | grep -Fqi "${DONT_COMMIT_MESSAGE}"; then`,
        `        touch "$git_dir/${SIGNAL_FILES.PULL_DETECTED}" 2>/dev/null || true`,
        '    fi',
        '',
        '    return 0',
        '}',
        '',
        'dont_commit_just_save_check_checkout "$@" || true',
    ].join('\n');
}

// SETUP GIT HOOKS FOR PRE-PUSH AND POST-MERGE
export const setupGitHook = (workspaceRoot: string): void => {
    if (!workspaceRoot || workspaceRoot.trim().length === 0) {
        void vscode.window.showErrorMessage('Hook setup failed: invalid folder path');
        return;
    }

    const hooksDir = resolveHooksDir(workspaceRoot);
    if (!hooksDir) { return; }
    try {
        fs.mkdirSync(hooksDir, { recursive: true });

        // SETUP PRE-PUSH HOOK
        const prePushHookPath = path.join(hooksDir, 'pre-push');
        upsertHookBlock(prePushHookPath, buildPrePushBlock());

        // SETUP POST-MERGE HOOK (TRIGGERED AFTER GIT PULL)
        const postMergeHookPath = path.join(hooksDir, 'post-merge');
        upsertHookBlock(postMergeHookPath, buildPostMergeBlock());

        // SETUP POST-REWRITE HOOK (TRIGGERED AFTER REBASE/AMEND)
        const postRewriteHookPath = path.join(hooksDir, 'post-rewrite');
        upsertHookBlock(postRewriteHookPath, buildPostRewriteBlock());

        // SETUP POST-CHECKOUT HOOK (TRIGGERED AFTER BRANCH SWITCH)
        const postCheckoutHookPath = path.join(hooksDir, 'post-checkout');
        upsertHookBlock(postCheckoutHookPath, buildPostCheckoutBlock());
    } catch (error) {
        const message = formatHookError(error);
        void vscode.window.showErrorMessage(`Hook setup failed: ${message}`);
    }
};
