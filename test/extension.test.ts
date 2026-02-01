import * as assert from 'node:assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { activate, deactivate } from '../src/extension';
import { createMockExtensionContext } from './helpers/extensionContext';

// TESTS FOR EXTENSION
suite('Extension Tests', () => {
    let sandbox: sinon.SinonSandbox;
    let context: vscode.ExtensionContext;

    setup(() => {
        sandbox = sinon.createSandbox();
        context = createMockExtensionContext();
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
});
