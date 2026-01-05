import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

export const setupGitHook = async (workspaceRoot: string) => {
    // SETUP PRE-PUSH HOOK
    const prePushHookPath = path.join(workspaceRoot, '.git', 'hooks', 'pre-push');
    const prePushHookContent = `#!/bin/sh

# CHECK FOR DONT COMMIT JUST SAVE
commits=\`git log @{u}..HEAD --pretty=%B\`
if echo "$commits" | grep -q "DONT COMMIT JUST SAVE"; then
    # NOTIFY VS CODE AND WAIT
    touch "${workspaceRoot}/.git/PUSH_BLOCKED"
    sleep 2

    # SHOW TERMINAL MESSAGE
    echo ""
    echo "\\033[1;31m╔═══════════════════════════════════════════════╗"
    echo "║                   PUSH BLOCKED                    ║"
    echo "║                                                  ║"
    echo "║  Found commit with 'DONT COMMIT JUST SAVE'       ║"
    echo "║  Please remove or amend the commit before push   ║"
    echo "║                                                  ║"
    echo "╚═══════════════════════════════════════════════╝\\033[0m"
    echo ""
    exit 1
fi
exit 0
`;

    // SETUP POST-MERGE HOOK (TRIGGERED AFTER GIT PULL)
    const postMergeHookPath = path.join(workspaceRoot, '.git', 'hooks', 'post-merge');
    const postMergeHookContent = `#!/bin/sh

# CHECK FOR DONT COMMIT JUST SAVE IN NEW COMMITS FROM PULL
# ORIG_HEAD IS SET BY GIT PULL TO THE PREVIOUS HEAD BEFORE MERGE
if [ -f "${workspaceRoot}/.git/ORIG_HEAD" ]; then
    commits=\`git log ORIG_HEAD..HEAD --pretty=%B\`
else
    # FALLBACK: CHECK LAST 5 COMMITS IF ORIG_HEAD NOT AVAILABLE
    commits=\`git log -5 --pretty=%B\`
fi

if echo "$commits" | grep -q "DONT COMMIT JUST SAVE"; then
    # NOTIFY VS CODE
    touch "${workspaceRoot}/.git/PULL_DETECTED"
fi
`;

    try {
        fs.writeFileSync(prePushHookPath, prePushHookContent, { mode: 0o755 });
        fs.writeFileSync(postMergeHookPath, postMergeHookContent, { mode: 0o755 });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to setup git hook: ${error}`);
    }
}; 
