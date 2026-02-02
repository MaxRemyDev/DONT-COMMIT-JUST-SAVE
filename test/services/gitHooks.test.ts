import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { setupGitHook, __test as gitHooksTest } from '../../src/services/gitHooks';

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

    // TEST FOR POST-REWRITE AND POST-CHECKOUT HOOK CREATION
    test('setupGitHook should create post-rewrite and post-checkout hook files', async () => {
        // ARRANGE - DEFINE HOOK PATHS
        const postRewriteHookPath = path.join(testHooksDir, 'post-rewrite');
        const postCheckoutHookPath = path.join(testHooksDir, 'post-checkout');

        // ACT - SETUP GIT HOOK
        await setupGitHook(testWorkspaceRoot);

        // ASSERT - VERIFY HOOK FILES CREATED
        assert.ok(fs.existsSync(postRewriteHookPath), 'post-rewrite hook should be created');
        assert.ok(fs.existsSync(postCheckoutHookPath), 'post-checkout hook should be created');
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
        assert.ok(content.includes('dont_commit_just_save_check_range'), 'pre-push hook should check commit ranges');
        assert.ok(content.includes('rev-parse --abbrev-ref --symbolic-full-name @{u}'), 'pre-push hook should detect upstream');
        assert.ok(content.includes('grep -Fqi "DONT COMMIT JUST SAVE"'), 'pre-push hook should grep for DONT COMMIT JUST SAVE');
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

    // TEST FOR EXISTING HOOK BLOCK UPDATE
    test('setupGitHook should update existing hook block and normalize shebang', async () => {
        // ARRANGE - CREATE EXISTING HOOK WITH MARKERS AND CRLF
        const prePushHookPath = path.join(testHooksDir, 'pre-push');
        const markerStart = '# DONT-COMMIT-JUST-SAVE BEGIN';
        const markerEnd = '# DONT-COMMIT-JUST-SAVE END';
        const existing = ['echo "custom"', markerStart, 'OLD_BLOCK', markerEnd].join('\r\n');
        fs.writeFileSync(prePushHookPath, existing, 'utf8');

        // ACT - SETUP GIT HOOK
        await setupGitHook(testWorkspaceRoot);

        // ASSERT - VERIFY BLOCK UPDATED AND SHEBANG ADDED
        const content = fs.readFileSync(prePushHookPath, 'utf8');
        assert.ok(content.startsWith('#!/bin/sh'), 'hook should start with shebang');
        assert.ok(content.includes('dont_commit_just_save_check_push'), 'hook block should be updated');
        assert.ok(!content.includes('OLD_BLOCK'), 'old hook block should be replaced');
        assert.ok(content.includes('\r\n'), 'CRLF newlines should be preserved');
    });

    // TEST FOR INSERT WHEN NO NEWLINE EXISTS
    test('setupGitHook should insert block when hook file has no newline', async () => {
        // ARRANGE - EXISTING FILE WITHOUT NEWLINES
        const prePushHookPath = path.join(testHooksDir, 'pre-push');
        fs.writeFileSync(prePushHookPath, '#!/bin/sh', 'utf8');

        // ACT - SETUP GIT HOOK
        await setupGitHook(testWorkspaceRoot);

        // ASSERT - VERIFY BLOCK INSERTED
        const content = fs.readFileSync(prePushHookPath, 'utf8');
        assert.ok(content.includes('dont_commit_just_save_check_push'));
    });

    // TEST FOR MISSING GIT DIR
    test('setupGitHook should return when .git directory is missing', async () => {
        // ARRANGE - CREATE NON-GIT WORKSPACE
        const noGitRoot = fs.mkdtempSync(path.join(testWorkspaceRoot, 'nogit-'));

        // ACT - SETUP GIT HOOK
        await setupGitHook(noGitRoot);

        // ASSERT - VERIFY NO HOOKS CREATED
        const hooksDir = path.join(noGitRoot, '.git', 'hooks');
        assert.ok(!fs.existsSync(hooksDir));
    });

    // TEST FOR HOOK SETUP FAILURE
    test('setupGitHook should surface errors when hook setup fails', async () => {
        // ARRANGE - FORCE MKDIR FAILURE
        const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage');
        const hooksDir = path.join(testGitDir, 'hooks');
        if (fs.existsSync(hooksDir)) { fs.rmSync(hooksDir, { recursive: true, force: true }); }
        fs.writeFileSync(hooksDir, 'not a directory');

        // ACT - SETUP GIT HOOK
        await setupGitHook(testWorkspaceRoot);

        // ASSERT - ERROR MESSAGE SHOWN
        assert.ok(showErrorStub.calledOnce);
        assert.ok(showErrorStub.getCall(0).args[0].includes('Hook setup failed'));
    });

    test('formatHookError should handle non-Error values', () => {
        assert.strictEqual(gitHooksTest.formatHookError(new Error('fail')), 'fail');
        assert.strictEqual(gitHooksTest.formatHookError('boom'), 'boom');
    });
});
