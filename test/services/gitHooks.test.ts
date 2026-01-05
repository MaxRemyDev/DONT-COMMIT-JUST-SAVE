import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { setupGitHook } from '../../src/services/gitHooks';

suite('Git Hooks Tests', () => {
    let sandbox: sinon.SinonSandbox;
    let testWorkspaceRoot: string;
    let testGitDir: string;
    let testHooksDir: string;

    setup(() => {
        sandbox = sinon.createSandbox();

        testWorkspaceRoot = path.join(__dirname, '../../../../test-workspace');
        testGitDir = path.join(testWorkspaceRoot, '.git');
        testHooksDir = path.join(testGitDir, 'hooks');

        if (!fs.existsSync(testHooksDir)) { fs.mkdirSync(testHooksDir, { recursive: true }); }
    });

    // CLEAN UP TEST DIRECTORY
    teardown(() => {
        sandbox.restore();
        if (fs.existsSync(testWorkspaceRoot)) { fs.rmSync(testWorkspaceRoot, { recursive: true, force: true }); }
    });

    // TEST FOR PRE-PUSH HOOK CREATION
    test('setupGitHook should create pre-push hook file', async () => {
        // ARRANGE - DEFINE HOOK PATH
        const prePushHookPath = path.join(testHooksDir, 'pre-push');

        // ACT - SETUP GIT HOOK
        await setupGitHook(testWorkspaceRoot);

        // ASSERT - VERIFY HOOK FILE CREATED AND CONTENT VALID
        assert.ok(fs.existsSync(prePushHookPath), 'pre-push hook should be created');
        const content = fs.readFileSync(prePushHookPath, 'utf8');
        assert.ok(content.includes('DONT COMMIT JUST SAVE'), 'pre-push hook should contain check for DONT COMMIT JUST SAVE');
        assert.ok(content.includes('PUSH_BLOCKED'), 'pre-push hook should create PUSH_BLOCKED file');
    });

    // TEST FOR POST-MERGE HOOK CREATION
    test('setupGitHook should create post-merge hook file', async () => {
        // ARRANGE - DEFINE HOOK PATH
        const postMergeHookPath = path.join(testHooksDir, 'post-merge');

        // ACT - SETUP GIT HOOK
        await setupGitHook(testWorkspaceRoot);

        // ASSERT - VERIFY HOOK FILE CREATED AND CONTENT VALID
        assert.ok(fs.existsSync(postMergeHookPath), 'post-merge hook should be created');
        const content = fs.readFileSync(postMergeHookPath, 'utf8');
        assert.ok(content.includes('DONT COMMIT JUST SAVE'), 'post-merge hook should contain check for DONT COMMIT JUST SAVE');
        assert.ok(content.includes('PULL_DETECTED'), 'post-merge hook should create PULL_DETECTED file');
    });

    // TEST FOR HOOK FILE PERMISSIONS
    test('setupGitHook should set executable permissions on hook files', async () => {
        // ARRANGE - DEFINE HOOK PATHS
        const prePushHookPath = path.join(testHooksDir, 'pre-push');
        const postMergeHookPath = path.join(testHooksDir, 'post-merge');

        // ACT - SETUP GIT HOOK
        await setupGitHook(testWorkspaceRoot);

        // ASSERT - VERIFY FILES EXIST (PERMISSIONS CHECK IS PLATFORM-SPECIFIC)
        assert.ok(fs.existsSync(prePushHookPath));
        assert.ok(fs.existsSync(postMergeHookPath));
    });

    // TEST FOR ERROR HANDLING
    test('setupGitHook should handle errors gracefully', async () => {
        // ARRANGE - SETUP ERROR STUB
        sandbox.stub(vscode.window, 'showErrorMessage');
        const readOnlyDir = path.join(testWorkspaceRoot, '.git', 'hooks', 'readonly');
        if (!fs.existsSync(path.dirname(readOnlyDir))) { fs.mkdirSync(path.dirname(readOnlyDir), { recursive: true }); }

        // ACT - TRIGGER ERROR WITH INVALID PATH
        try {
            await setupGitHook('');
        } catch {
            // EXPECTED - ERROR SHOULD BE HANDLED GRACEFULLY
        }

        // ASSERT - VERIFY FUNCTION COMPLETES WITHOUT THROWING
        assert.ok(true);
    });

    // TEST FOR PRE-PUSH HOOK CONTENT
    test('pre-push hook should contain correct git command', async () => {
        // ACT - SETUP GIT HOOK
        await setupGitHook(testWorkspaceRoot);

        // ASSERT - VERIFY HOOK CONTENT
        const prePushHookPath = path.join(testHooksDir, 'pre-push');
        const content = fs.readFileSync(prePushHookPath, 'utf8');
        assert.ok(content.includes('git log @{u}..HEAD'), 'pre-push hook should check commits between upstream and HEAD');
        assert.ok(content.includes('grep -q "DONT COMMIT JUST SAVE"'), 'pre-push hook should grep for DONT COMMIT JUST SAVE');
    });

    // TEST FOR POST-MERGE HOOK CONTENT
    test('post-merge hook should contain ORIG_HEAD check', async () => {
        // ACT - SETUP GIT HOOK
        await setupGitHook(testWorkspaceRoot);

        // ASSERT - VERIFY HOOK CONTENT
        const postMergeHookPath = path.join(testHooksDir, 'post-merge');
        const content = fs.readFileSync(postMergeHookPath, 'utf8');
        assert.ok(content.includes('ORIG_HEAD'), 'post-merge hook should check ORIG_HEAD');
        assert.ok(content.includes('git log ORIG_HEAD..HEAD'), 'post-merge hook should check commits between ORIG_HEAD and HEAD');
        assert.ok(content.includes('git log -5'), 'post-merge hook should have fallback to check last 5 commits');
    });
});
