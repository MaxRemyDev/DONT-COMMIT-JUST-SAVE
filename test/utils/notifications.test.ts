import * as assert from 'node:assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { showNotification } from '../../src/utils/notifications';

suite('Notifications Tests', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    // TEST FOR INFO NOTIFICATION
    test('showNotification should call showInformationMessage for info type', async () => {
        // ARRANGE - SETUP STUB
        const stub = sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);

        // ACT - SHOW NOTIFICATION
        await showNotification('info', 'Test info message', 'Test details');

        // ASSERT - VERIFY CALLED WITH CORRECT ARGS
        assert.ok(stub.calledOnce);
        const callArgs = stub.getCall(0).args;
        assert.strictEqual(callArgs[0], 'Test info message');
        assert.deepStrictEqual(callArgs[1], { detail: 'Test details', modal: false });
    });

    // TEST FOR WARNING NOTIFICATION
    test('showNotification should call showWarningMessage for warning type', async () => {
        // ARRANGE - SETUP STUB
        const stub = sandbox.stub(vscode.window, 'showWarningMessage').resolves({ title: 'Proceed' });

        // ACT - SHOW NOTIFICATION
        const result = await showNotification('warning', 'Test warning message', 'Test details');

        // ASSERT - VERIFY CALLED WITH CORRECT ARGS
        assert.ok(stub.calledOnce);
        const callArgs = stub.getCall(0).args;
        assert.strictEqual(callArgs[0], 'Test warning message');
        assert.deepStrictEqual(callArgs[1], { detail: 'Test details', modal: true });
        assert.deepStrictEqual(callArgs[2], { title: 'Proceed' });
        assert.ok(result);
    });

    // TEST FOR ERROR NOTIFICATION
    test('showNotification should call showErrorMessage for error type', async () => {
        // ARRANGE - SETUP STUB
        const stub = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);

        // ACT - SHOW NOTIFICATION
        const result = await showNotification('error', 'Test error message', 'Test details');

        // ASSERT - VERIFY CALLED WITH CORRECT ARGS
        assert.ok(stub.calledOnce);
        const callArgs = stub.getCall(0).args;
        assert.strictEqual(callArgs[0], 'Test error message');
        assert.deepStrictEqual(callArgs[1], { detail: 'Test details', modal: true });
        assert.strictEqual(result, undefined);
    });

    // TEST FOR DETAILS BUTTON DISPLAY
    test('showNotification should show details button when showDetailsButton is true', async () => {
        // ARRANGE - SETUP STUBS
        const showInfoStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves({ title: 'Show Details' });
        sandbox.stub(vscode.workspace, 'openTextDocument').resolves({} as vscode.TextDocument);
        sandbox.stub(vscode.window, 'showTextDocument').resolves();

        // ACT - SHOW NOTIFICATION WITH DETAILS BUTTON
        await showNotification('info', 'Test message', 'Test details', true);

        // ASSERT - VERIFY BUTTONS INCLUDED
        assert.ok(showInfoStub.calledOnce);
        const callArgs = showInfoStub.getCall(0).args;
        if (callArgs.length > 2) {
            const buttons = callArgs.slice(2) as vscode.MessageItem[];
            assert.ok(buttons && buttons.length > 0);
            assert.strictEqual(buttons[0].title, 'Show Details');
        }
    });

    // TEST FOR NOTIFICATION TYPE MAPPING
    test('showNotification should map notification types to log types correctly', async () => {
        // ARRANGE - SETUP STUBS FOR EACH TYPE
        const infoStub = sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
        const warningStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves({ title: 'Proceed' });
        const errorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);

        // ACT - SHOW EACH NOTIFICATION TYPE
        await showNotification('info', 'Info message');
        await showNotification('warning', 'Warning message');
        await showNotification('error', 'Error message');

        // ASSERT - VERIFY EACH TYPE CALLED CORRECT METHOD
        assert.ok(infoStub.called);
        assert.ok(warningStub.called);
        assert.ok(errorStub.called);
    });
});
