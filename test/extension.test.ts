import * as assert from 'node:assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import { activate, deactivate } from '../src/extension';

const childProcess = require('node:child_process') as typeof import('node:child_process');

suite('Extension Tests', () => {
    let sandbox: sinon.SinonSandbox;
    let context: vscode.ExtensionContext;

    setup(() => {
        sandbox = sinon.createSandbox();

        const mockMemento = {
            get: () => undefined,
            update: () => Promise.resolve(),
            setKeysForSync: () => { },
            keys: () => []
        } as vscode.Memento & { setKeysForSync(keys: readonly string[]): void };

        const mockEnvCollection = {
            persistent: true,
            description: '',
            replace: () => { },
            append: () => { },
            prepend: () => { },
            get: () => undefined,
            forEach: () => { },
            delete: () => { },
            clear: () => { },
            getScoped: () => ({} as vscode.EnvironmentVariableCollection),
            [Symbol.iterator]: function* () { }
        } as vscode.GlobalEnvironmentVariableCollection;

        context = {
            subscriptions: [],
            workspaceState: mockMemento,
            globalState: mockMemento,
            extensionPath: '',
            globalStoragePath: '',
            storagePath: '',
            globalStorageUri: vscode.Uri.file(''),
            workspaceStorageUri: vscode.Uri.file(''),
            storageUri: vscode.Uri.file(''),
            logUri: vscode.Uri.file(''),
            logPath: '',
            asAbsolutePath: (relativePath: string) => path.resolve(relativePath),
            extensionUri: vscode.Uri.file(''),
            environmentVariableCollection: mockEnvCollection,
            extensionMode: vscode.ExtensionMode.Test,
            secrets: {} as vscode.SecretStorage,
            extension: {} as vscode.Extension<any>,
            languageModelAccessInformation: {} as any
        } as vscode.ExtensionContext;
    });

    teardown(() => sandbox.restore());

    // TEST FOR COMMAND REGISTRATION
    test('activate should register insertDontCommit command', async () => {
        // ARRANGE - SETUP STUBS
        const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');
        sandbox.stub(vscode.extensions, 'getExtension');
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');

        // ACT - ACTIVATE EXTENSION
        await activate(context);

        // ASSERT - VERIFY COMMAND REGISTERED
        assert.ok(registerCommandStub.called);
        const registeredCommand = registerCommandStub.getCalls().find(call => call.args[0] === 'extension.insertDontCommit');
        assert.ok(registeredCommand, 'insertDontCommit command should be registered');
    });

    // TEST FOR SOFT RESET COMMAND REGISTRATION
    test('activate should register softResetHead command', async () => {
        // ARRANGE - SETUP STUBS
        const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');
        sandbox.stub(vscode.extensions, 'getExtension');
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');

        // ACT - ACTIVATE EXTENSION
        await activate(context);

        // ASSERT - VERIFY COMMAND REGISTERED
        assert.ok(registerCommandStub.called);
        const registeredCommand = registerCommandStub.getCalls().find(call => call.args[0] === 'extension.softResetHead');
        assert.ok(registeredCommand, 'softResetHead command should be registered');
    });

    // TEST FOR GIT HOOKS SETUP ON WORKSPACE FOLDERS
    test('activate should setup git hooks for existing workspace folders', async () => {
        // ARRANGE - CREATE MOCK WORKSPACE FOLDER
        const mockFolder: vscode.WorkspaceFolder = { uri: vscode.Uri.file('/test/workspace'), name: 'test-workspace', index: 0 };
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([mockFolder]);
        sandbox.stub(vscode.commands, 'registerCommand');
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
        sandbox.stub(vscode.extensions, 'getExtension');

        // ACT - ACTIVATE EXTENSION
        await activate(context);

        // ASSERT - VERIFY SUBSCRIPTIONS ADDED
        assert.ok(context.subscriptions.length > 0, 'Subscriptions should be added');
    });

    // TEST FOR WORKSPACE FOLDER WATCHER
    test('activate should watch for new workspace folders', async () => {
        // ARRANGE - SETUP STUBS
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.commands, 'registerCommand');
        const onDidChangeWorkspaceFoldersStub = sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
        sandbox.stub(vscode.extensions, 'getExtension');

        // ACT - ACTIVATE EXTENSION
        await activate(context);

        // ASSERT - VERIFY WATCHER SET UP
        assert.ok(onDidChangeWorkspaceFoldersStub.called);
    });

    // TEST FOR DEACTIVATION
    test('deactivate should complete without errors', () => {
        // ACT & ASSERT- DEACTIVATE EXTENSION & VERIFY NO ERRORS
        assert.doesNotThrow(() => deactivate());
    });

    // TEST FOR INTERVAL MONITORING SETUP
    test('activate should set up git signal watchers for monitoring blocked pushes', async () => {
        // ARRANGE - SETUP STUBS
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.commands, 'registerCommand').returns({ dispose: () => { } } as any);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders').returns({ dispose: () => { } } as any);
        sandbox.stub(vscode.extensions, 'getExtension');

        // ACT - ACTIVATE EXTENSION
        await activate(context);

        // ASSERT - VERIFY INTERVAL SETUP
        assert.ok(context.subscriptions.length > 0);
    });

    // TEST FOR PULL DETECTION NOTIFICATION (FILE-BASED SIGNAL)
    test('activate should show modal when PULL_DETECTED file exists and then clear it', async () => {
        // ARRANGE - CREATE TEMP REPO STRUCTURE
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

        // ACT
        await activate(context);

        // WAIT FOR MICROTASK-BASED INITIAL SIGNAL CONSUMPTION
        await new Promise<void>(resolve => setImmediate(resolve));

        // ASSERT - MODAL SHOWN WITH PULL MESSAGE AND FILE CLEARED
        assert.ok(showErrorStub.calledOnce);
        const callArgs = showErrorStub.getCall(0).args;
        assert.strictEqual(callArgs[0], "Pull detected: Found commit with 'DONT COMMIT JUST SAVE' message");
        assert.deepStrictEqual(callArgs[1], { detail: 'Source: DONT COMMIT JUST SAVE', modal: true });
        assert.ok(!fs.existsSync(pullDetectedFile), 'PULL_DETECTED file should be removed after showing the modal');

        // CLEANUP
        for (const sub of context.subscriptions) try { (sub as any)?.dispose?.(); } catch { /* IGNORE */ }
        fs.rmSync(tmpRepo, { recursive: true, force: true });
    });

    // TEST FOR INSERT DONT COMMIT COMMAND
    test('insertDontCommit command should set input box value', async () => {
        // ARRANGE - CREATE MOCK GIT REPOSITORY
        const mockRepo = { inputBox: { value: '' }, state: { onDidChange: () => ({ dispose: () => { } }) } };
        const mockGit = { repositories: [mockRepo] };
        const mockGitExtension = { getAPI: () => mockGit };
        sandbox.stub(vscode.extensions, 'getExtension').returns({ exports: mockGitExtension } as vscode.Extension<any>);
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
        const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');

        // ACT - ACTIVATE AND EXECUTE COMMAND
        await activate(context);
        const commandCall = registerCommandStub.getCalls().find(call => call.args[0] === 'extension.insertDontCommit');
        if (commandCall && typeof commandCall.args[1] === 'function') { await commandCall.args[1](); }

        // ASSERT - VERIFY INPUT BOX VALUE SET
        assert.strictEqual(mockRepo.inputBox.value, 'DONT COMMIT JUST SAVE');
    });

    // TEST FOR SOFT RESET HEAD COMMAND SUCCESS PATH
    test('softResetHead command should run git reset --soft HEAD~N', async () => {
        // ARRANGE - SETUP STUBS AND CREATE MOCK GIT REPOSITORY
        const mockRepo = { rootUri: vscode.Uri.file('/test/repo'), state: { onDidChange: () => ({ dispose: () => { } }) } };
        const mockGit = { repositories: [mockRepo] };
        const mockGitExtension = { getAPI: () => mockGit };
        sandbox.stub(vscode.extensions, 'getExtension').returns({ exports: mockGitExtension } as vscode.Extension<any>);
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
        const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');
        sandbox.stub(vscode.window, 'showInputBox').resolves('2');
        sandbox.stub(vscode.window, 'showWarningMessage').resolves({ title: 'Reset' } as any);
        sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);

        const execFileSyncStub = sandbox.stub(childProcess, 'execFileSync').returns(Buffer.from(''));

        // ACT - ACTIVATE AND EXECUTE COMMAND
        await activate(context);
        const commandCall = registerCommandStub.getCalls().find(call => call.args[0] === 'extension.softResetHead');
        assert.ok(commandCall, 'softResetHead command should be registered');
        if (commandCall && typeof commandCall.args[1] === 'function') { await commandCall.args[1](); }

        // ASSERT - VERIFY COMMAND EXECUTED
        assert.ok(execFileSyncStub.calledOnce);
        const [file, args, opts] = execFileSyncStub.getCall(0).args as [string, string[], { cwd?: string; stdio?: any }];
        assert.strictEqual(file, 'git');
        assert.deepStrictEqual(args, ['reset', '--soft', 'HEAD~2']);
        assert.strictEqual(opts.cwd, '/test/repo');
    });

    // TEST FOR SOFT RESET HEAD COMMAND CANCEL AT INPUT
    test('softResetHead command should not run if input is cancelled', async () => {
        // ARRANGE - SETUP STUBS AND CREATE MOCK GIT REPOSITORY
        const mockRepo = { rootUri: vscode.Uri.file('/test/repo'), state: { onDidChange: () => ({ dispose: () => { } }) } };
        const mockGit = { repositories: [mockRepo] };
        const mockGitExtension = { getAPI: () => mockGit };
        sandbox.stub(vscode.extensions, 'getExtension').returns({ exports: mockGitExtension } as vscode.Extension<any>);
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
        const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');
        sandbox.stub(vscode.window, 'showInputBox').resolves(undefined);
        const execFileSyncStub = sandbox.stub(childProcess, 'execFileSync').returns(Buffer.from(''));

        // ACT - ACTIVATE AND EXECUTE COMMAND
        await activate(context);
        const commandCall = registerCommandStub.getCalls().find(call => call.args[0] === 'extension.softResetHead');
        assert.ok(commandCall, 'softResetHead command should be registered');
        if (commandCall && typeof commandCall.args[1] === 'function') { await commandCall.args[1](); }

        // ASSERT - VERIFY COMMAND NOT EXECUTED
        assert.ok(execFileSyncStub.notCalled);
    });
});
