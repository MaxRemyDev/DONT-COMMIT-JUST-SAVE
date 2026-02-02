import * as assert from 'node:assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { activate } from '../../src/extension';
import { registerSignalWatcher, __test as signalWatcherTest } from '../../src/features/signalWatcher';
import { SIGNAL_FILES } from '../../src/constants';
import * as gitHooks from '../../src/services/gitHooks';
import * as notifications from '../../src/utils/notifications';
import * as gitUtils from '../../src/utils/git';
import { createMockExtensionContext } from '../helpers/extensionContext';

// TESTS FOR SIGNAL WATCHER FEATURE
suite('signalWatcher Feature', () => {
    let sandbox: sinon.SinonSandbox;
    let context: vscode.ExtensionContext;

    setup(() => {
        sandbox = sinon.createSandbox();
        context = createMockExtensionContext();
    });

    teardown(() => {
        for (const sub of context.subscriptions) {
            try { (sub as any)?.dispose?.(); } catch { /* IGNORE */ }
        }
        signalWatcherTest.resetWatchFn();
        sandbox.restore();
    });

    // TESTS FOR ACTIVATE FUNCTION
    test('activate should set up git signal watchers for monitoring blocked pushes', async () => {
        // ARRANGE - SETUP STUBS
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.commands, 'registerCommand').returns({ dispose: () => { } } as any);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders').returns({ dispose: () => { } } as any);
        sandbox.stub(vscode.extensions, 'getExtension');

        // ACT - ACTIVATE EXTENSION
        await activate(context);

        // ASSERT - SUBSCRIPTIONS ADDED
        assert.ok(context.subscriptions.length > 0);
    });

    // TESTS FOR ACTIVATE FUNCTION
    test('activate should show modal when PULL_DETECTED file exists and then clear it', async () => {
        // ARRANGE - TEMP REPO WITH PULL_DETECTED FILE
        const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'dont-commit-just-save-'));
        const gitDir = path.join(tmpRepo, '.git');
        fs.mkdirSync(path.join(gitDir, 'hooks'), { recursive: true });
        const pullDetectedFile = path.join(gitDir, 'PULL_DETECTED');
        fs.writeFileSync(pullDetectedFile, '');
        const mockFolder: vscode.WorkspaceFolder = { uri: vscode.Uri.file(tmpRepo), name: 'tmp-repo', index: 0 };
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockFolder]);

        sandbox.stub(vscode.commands, 'registerCommand').returns({ dispose: () => { } } as any);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders').returns({ dispose: () => { } } as any);

        const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);

        // ACT - ACTIVATE AND WAIT FOR MICROTASK
        await activate(context);
        await new Promise<void>(resolve => setImmediate(resolve));

        // ASSERT - MODAL SHOWN, FILE CLEARED
        assert.ok(showErrorStub.calledOnce);
        const callArgs = showErrorStub.getCall(0).args;
        assert.strictEqual(callArgs[0], 'HEADS UP');
        assert.deepStrictEqual(callArgs[1], {
            detail: 'This repo has a "DONT COMMIT JUST SAVE" commit (for example after a pull/rebase/checkout).\n\n⚠ Remove or amend it first.',
            modal: true
        });
        assert.ok(!fs.existsSync(pullDetectedFile), 'PULL_DETECTED file should be removed after showing the modal');

        for (const sub of context.subscriptions) try { (sub as any)?.dispose?.(); } catch { /* IGNORE */ }
        fs.rmSync(tmpRepo, { recursive: true, force: true });
    });

    // TEST FOR REGISTER SIGNAL WATCHER FUNCTION
    test('registerSignalWatcher should react to fs.watch filenames', async () => {
        // ARRANGE - TEMP REPO WITH GIT DIR
        const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'dont-commit-just-save-'));
        const gitDir = path.join(tmpRepo, '.git');
        fs.mkdirSync(gitDir, { recursive: true });
        const mockFolder: vscode.WorkspaceFolder = { uri: vscode.Uri.file(tmpRepo), name: 'tmp-repo', index: 0 };
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockFolder]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders').returns({ dispose: () => { } } as any);

        let watchCallback: ((eventType: string, filename?: string | Buffer) => void) | undefined;
        signalWatcherTest.setWatchFn((...args: any[]) => {
            watchCallback = args[1] as (eventType: string, filename?: string | Buffer) => void;
            return { close: () => { } } as unknown as fs.FSWatcher;
        });

        // ACT - REGISTER WATCHER AND SIMULATE EVENTS
        registerSignalWatcher(context);
        assert.ok(watchCallback, 'fs.watch callback should be captured');
        watchCallback?.('change', undefined);
        watchCallback?.('change', Buffer.from('OTHER'));
        watchCallback?.('change', Buffer.from(SIGNAL_FILES.PUSH_BLOCKED));
        await new Promise<void>(resolve => setImmediate(resolve));

        // CLEANUP
        fs.rmSync(tmpRepo, { recursive: true, force: true });
    });

    // TEST FOR REGISTER SIGNAL WATCHER FUNCTION
    test('registerSignalWatcher should ignore fs.watch failures', () => {
        // ARRANGE - TEMP REPO WITH GIT DIR
        const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'dont-commit-just-save-'));
        const gitDir = path.join(tmpRepo, '.git');
        fs.mkdirSync(gitDir, { recursive: true });
        const mockFolder: vscode.WorkspaceFolder = { uri: vscode.Uri.file(tmpRepo), name: 'tmp-repo', index: 0 };
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockFolder]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders').returns({ dispose: () => { } } as any);
        signalWatcherTest.setWatchFn(() => { throw new Error('watch failed'); });

        // ACT / ASSERT - REGISTER SHOULD NOT THROW
        assert.doesNotThrow(() => registerSignalWatcher(context));

        // CLEANUP
        fs.rmSync(tmpRepo, { recursive: true, force: true });
    });

    // TEST FOR REGISTER SIGNAL WATCHER FUNCTION
    test('registerSignalWatcher should handle workspace folder add/remove events', async () => {
        // ARRANGE - TEMP REPOS
        const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'dont-commit-just-save-'));
        const gitDir = path.join(tmpRepo, '.git');
        fs.mkdirSync(gitDir, { recursive: true });
        const tmpNoGit = fs.mkdtempSync(path.join(os.tmpdir(), 'dont-commit-just-save-nogit-'));
        const tmpNoWatcher = fs.mkdtempSync(path.join(os.tmpdir(), 'dont-commit-just-save-nowatch-'));
        const withGit: vscode.WorkspaceFolder = { uri: vscode.Uri.file(tmpRepo), name: 'with-git', index: 0 };
        const noGit: vscode.WorkspaceFolder = { uri: vscode.Uri.file(tmpNoGit), name: 'no-git', index: 1 };
        const noWatcher: vscode.WorkspaceFolder = { uri: vscode.Uri.file(tmpNoWatcher), name: 'no-watcher', index: 2 };

        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        let workspaceHandler: ((event: vscode.WorkspaceFoldersChangeEvent) => void) | undefined;
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders').callsFake(handler => {
            workspaceHandler = handler;
            return { dispose: () => { } } as any;
        });
        const closeStub = sandbox.stub();
        const watchStub = sandbox.stub().callsFake(() => ({ close: closeStub }) as unknown as fs.FSWatcher);
        signalWatcherTest.setWatchFn(watchStub as unknown as typeof fs.watch);
        const setupHookStub = sandbox.stub(gitHooks, 'setupGitHook');

        // ACT - REGISTER AND FIRE EVENTS
        registerSignalWatcher(context);
        assert.ok(workspaceHandler, 'workspace handler should be registered');
        workspaceHandler?.({ added: [withGit, noGit], removed: [] } as vscode.WorkspaceFoldersChangeEvent);
        workspaceHandler?.({ added: [withGit], removed: [] } as vscode.WorkspaceFoldersChangeEvent);
        workspaceHandler?.({ added: [], removed: [withGit, noWatcher] } as vscode.WorkspaceFoldersChangeEvent);
        await new Promise<void>(resolve => setImmediate(resolve));

        // ASSERT - SETUP + WATCH + CLOSE
        assert.ok(setupHookStub.calledWith(tmpRepo));
        assert.ok(setupHookStub.calledWith(tmpNoGit));
        assert.strictEqual(watchStub.callCount, 1);
        assert.ok(closeStub.calledOnce);

        // CLEANUP
        fs.rmSync(tmpRepo, { recursive: true, force: true });
        fs.rmSync(tmpNoGit, { recursive: true, force: true });
        fs.rmSync(tmpNoWatcher, { recursive: true, force: true });
    });

    // TEST FOR REGISTER SIGNAL WATCHER FUNCTION
    test('registerSignalWatcher should skip when already showing error and file is missing on cleanup', async () => {
        // ARRANGE - TEMP REPO WITH SIGNAL FILE
        const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'dont-commit-just-save-'));
        const gitDir = path.join(tmpRepo, '.git');
        fs.mkdirSync(gitDir, { recursive: true });
        const signalFile = path.join(gitDir, SIGNAL_FILES.PUSH_BLOCKED);
        fs.writeFileSync(signalFile, '');
        const mockFolder: vscode.WorkspaceFolder = { uri: vscode.Uri.file(tmpRepo), name: 'tmp-repo', index: 0 };
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockFolder]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders').returns({ dispose: () => { } } as any);

        let watchCallback: ((eventType: string, filename?: string | Buffer) => void) | undefined;
        signalWatcherTest.setWatchFn((...args: any[]) => {
            watchCallback = args[1] as (eventType: string, filename?: string | Buffer) => void;
            return { close: () => { } } as unknown as fs.FSWatcher;
        });

        let resolveNotification: (() => void) | undefined;
        const notificationPromise = new Promise<void>(resolve => { resolveNotification = resolve; });
        sandbox.stub(notifications, 'showNotification').returns(notificationPromise as unknown as Promise<{ title: string } | undefined>);

        // ACT - REGISTER AND TRIGGER CONCURRENT SIGNALS
        registerSignalWatcher(context);
        assert.ok(watchCallback, 'fs.watch callback should be captured');
        watchCallback?.('change', Buffer.from(SIGNAL_FILES.PUSH_BLOCKED));
        await new Promise<void>(resolve => setImmediate(resolve));
        watchCallback?.('change', Buffer.from(SIGNAL_FILES.PUSH_BLOCKED));
        await new Promise<void>(resolve => setImmediate(resolve));
        fs.unlinkSync(signalFile);
        resolveNotification?.();
        await new Promise<void>(resolve => setImmediate(resolve));

        // CLEANUP
        fs.rmSync(tmpRepo, { recursive: true, force: true });
    });

    // TEST FOR REGISTER SIGNAL WATCHER FUNCTION
    test('registerSignalWatcher should show info when marker commit is detected', async () => {
        // ARRANGE - TEMP REPO WITH GIT DIR
        const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'dont-commit-just-save-'));
        const gitDir = path.join(tmpRepo, '.git');
        fs.mkdirSync(gitDir, { recursive: true });
        const mockFolder: vscode.WorkspaceFolder = { uri: vscode.Uri.file(tmpRepo), name: 'tmp-repo', index: 0 };
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockFolder]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders').returns({ dispose: () => { } } as any);
        signalWatcherTest.setWatchFn(() => ({ close: () => { } }) as unknown as fs.FSWatcher);
        sandbox.stub(gitUtils, 'hasRecentDontCommitMarker').returns(true);
        const notifyStub = sandbox.stub(notifications, 'showNotification').resolves(undefined);

        // ACT - REGISTER AND WAIT FOR MICROTASK
        registerSignalWatcher(context);
        await new Promise<void>(resolve => setImmediate(resolve));

        // ASSERT - NOTIFY STUB CALLED WITH INFO
        assert.ok(notifyStub.calledWith('info', 'Marker commit detected'));
        fs.rmSync(tmpRepo, { recursive: true, force: true });
    });

    // TEST FOR REGISTER SIGNAL WATCHER FUNCTION
    test('registerSignalWatcher should poll when fs.watch fails', async () => {
        // ARRANGE - TEMP REPO WITH GIT DIR
        const clock = sandbox.useFakeTimers();
        const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'dont-commit-just-save-'));
        const gitDir = path.join(tmpRepo, '.git');
        fs.mkdirSync(gitDir, { recursive: true });
        const mockFolder: vscode.WorkspaceFolder = { uri: vscode.Uri.file(tmpRepo), name: 'tmp-repo', index: 0 };
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockFolder]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders').returns({ dispose: () => { } } as any);
        signalWatcherTest.setWatchFn(() => { throw new Error('watch failed'); });
        sandbox.stub(gitUtils, 'hasRecentDontCommitMarker').returns(false);

        // ACT - REGISTER AND TICK CLOCK
        registerSignalWatcher(context);
        clock.tick(5000);

        // CLEANUP
        fs.rmSync(tmpRepo, { recursive: true, force: true });
    });

    // TEST FOR REGISTER SIGNAL WATCHER FUNCTION
    test('registerSignalWatcher should skip marker check when repo already warned', async () => {
        // ARRANGE - TEMP REPO WITH GIT DIR
        const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'dont-commit-just-save-'));
        const gitDir = path.join(tmpRepo, '.git');
        fs.mkdirSync(gitDir, { recursive: true });
        const mockFolder: vscode.WorkspaceFolder = { uri: vscode.Uri.file(tmpRepo), name: 'tmp-repo', index: 0 };
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockFolder]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders').returns({ dispose: () => { } } as any);
        signalWatcherTest.setWatchFn(() => ({ close: () => { } }) as unknown as fs.FSWatcher);
        const markerStub = sandbox.stub(gitUtils, 'hasRecentDontCommitMarker').returns(true);
        const notifyStub = sandbox.stub(notifications, 'showNotification').resolves(undefined);
        signalWatcherTest.addWarnedRepo(gitDir);

        // ACT - REGISTER AND WAIT FOR MICROTASK
        registerSignalWatcher(context);
        await new Promise<void>(resolve => setImmediate(resolve));

        // ASSERT - MARKER STUB NOT CALLED, NOTIFY STUB NOT CALLED
        assert.ok(markerStub.notCalled);
        assert.ok(notifyStub.notCalled);
        signalWatcherTest.clearWarnedRepos();

        // CLEANUP
        fs.rmSync(tmpRepo, { recursive: true, force: true });
    });

    // TEST FOR REGISTER SIGNAL WATCHER FUNCTION
    test('registerSignalWatcher should ignore undefined pending signals', async () => {
        // ARRANGE - TEMP REPO WITH GIT DIR
        const tmpRepo = fs.mkdtempSync(path.join(os.tmpdir(), 'dont-commit-just-save-'));
        const gitDir = path.join(tmpRepo, '.git');
        fs.mkdirSync(gitDir, { recursive: true });
        const signalFile = path.join(gitDir, SIGNAL_FILES.PUSH_BLOCKED);
        fs.writeFileSync(signalFile, '');
        const mockFolder: vscode.WorkspaceFolder = { uri: vscode.Uri.file(tmpRepo), name: 'tmp-repo', index: 0 };
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockFolder]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders').returns({ dispose: () => { } } as any);

        let watchCallback: ((eventType: string, filename?: string | Buffer) => void) | undefined;
        signalWatcherTest.setWatchFn((...args: any[]) => {
            watchCallback = args[1] as (eventType: string, filename?: string | Buffer) => void;
            return { close: () => { } } as unknown as fs.FSWatcher;
        });
        sandbox.stub(notifications, 'showNotification').resolves(undefined);
        signalWatcherTest.enqueuePendingSignal(undefined);

        // ACT - REGISTER AND TRIGGER SIGNAL
        registerSignalWatcher(context);
        watchCallback?.('change', Buffer.from(SIGNAL_FILES.PUSH_BLOCKED));
        await new Promise<void>(resolve => setImmediate(resolve));

        // CLEANUP
        fs.rmSync(tmpRepo, { recursive: true, force: true });
    });
});
