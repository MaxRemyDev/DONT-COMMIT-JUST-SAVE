import * as assert from 'node:assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { activate } from '../../src/extension';
import { createMockExtensionContext } from '../helpers/extensionContext';

// TESTS FOR SIGNAL WATCHER FEATURE
suite('signalWatcher Feature', () => {
    let sandbox: sinon.SinonSandbox;
    let context: vscode.ExtensionContext;

    setup(() => {
        sandbox = sinon.createSandbox();
        context = createMockExtensionContext();
    });

    teardown(() => sandbox.restore());

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
            detail: 'This repo has a "DONT COMMIT JUST SAVE" commit (example: from a pull).\n\n⚠ Remove or amend it first.',
            modal: true
        });
        assert.ok(!fs.existsSync(pullDetectedFile), 'PULL_DETECTED file should be removed after showing the modal');

        for (const sub of context.subscriptions) try { (sub as any)?.dispose?.(); } catch { /* IGNORE */ }
        fs.rmSync(tmpRepo, { recursive: true, force: true });
    });
});
