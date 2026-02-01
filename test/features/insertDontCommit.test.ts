import * as assert from 'node:assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { activate } from '../../src/extension';
import { createMockExtensionContext } from '../helpers/extensionContext';

// TESTS FOR INSERT DONT COMMIT JUST SAVE COMMAND
suite('insertDontCommit Feature', () => {
    let sandbox: sinon.SinonSandbox;
    let context: vscode.ExtensionContext;

    setup(() => {
        sandbox = sinon.createSandbox();
        context = createMockExtensionContext();
    });

    teardown(() => sandbox.restore());

    // TESTS FOR INSERT DONT COMMIT JUST SAVE COMMAND
    test('insertDontCommit command should set input box value', async () => {
        // ARRANGE - MOCK GIT REPO WITH INPUT BOX
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

        // ASSERT - INPUT BOX VALUE SET
        assert.strictEqual(mockRepo.inputBox.value, 'DONT COMMIT JUST SAVE');
    });
});
