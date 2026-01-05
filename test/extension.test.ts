import * as assert from 'node:assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { activate, deactivate } from '../src/extension';

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
    test('activate should set up interval for monitoring blocked pushes', async () => {
        // ARRANGE - SETUP STUBS
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.commands, 'registerCommand');
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
        sandbox.stub(vscode.extensions, 'getExtension');

        // ACT - ACTIVATE EXTENSION
        await activate(context);

        // ASSERT - VERIFY INTERVAL SETUP
        assert.ok(context.subscriptions.length > 0);
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
});
