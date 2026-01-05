import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

export const setupGitHook = async (workspaceRoot: string) => {
    const gitHookPath = path.join(workspaceRoot, '.git', 'hooks', 'pre-push');
    const hookContent = `#!/bin/sh

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

    try {
        fs.writeFileSync(gitHookPath, hookContent, { mode: 0o755 });
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to setup git hook: ${error}`);
    }
}; 
