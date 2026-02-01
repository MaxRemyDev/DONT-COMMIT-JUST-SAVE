import * as assert from 'node:assert';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { activate } from '../../src/extension';
import { createMockExtensionContext } from '../helpers/extensionContext';

const childProcess = require('node:child_process') as typeof import('node:child_process');

// TESTS FOR SOFT RESET FEATURE
suite('softReset Feature', () => {
    let sandbox: sinon.SinonSandbox;
    let context: vscode.ExtensionContext;

    setup(() => {
        sandbox = sinon.createSandbox();
        context = createMockExtensionContext();
    });

    teardown(() => sandbox.restore());

    // TESTS FOR SOFT RESET HEAD COMMAND WHEN NO CONSECUTIVE DCJS COMMITS EXIST
    test('softResetHead command should run git reset --soft HEAD~N when no consecutive DCJS commits', async () => {
        // ARRANGE - 0 DCJS, INPUT 2, CONFIRM
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

        const execFileSyncStub = sandbox.stub(childProcess, 'execFileSync');
        execFileSyncStub.onFirstCall().returns('fix: something\n');
        execFileSyncStub.onSecondCall().returns(Buffer.from(''));

        // ACT - ACTIVATE + SOFT RESET
        await activate(context);
        const commandCall = registerCommandStub.getCalls().find(call => call.args[0] === 'extension.softResetHead');
        assert.ok(commandCall, 'softResetHead command should be registered');
        if (commandCall && typeof commandCall.args[1] === 'function') { await commandCall.args[1](); }

        // ASSERT - LOG + RESET HEAD~2
        assert.strictEqual(execFileSyncStub.callCount, 2);
        const logCall = execFileSyncStub.getCall(0).args as [string, string[], { cwd?: string; encoding?: string }];
        assert.strictEqual(logCall[0], 'git');
        assert.deepStrictEqual(logCall[1], ['log', '-n', '50', '--pretty=%s']);
        const resetCall = execFileSyncStub.getCall(1).args as [string, string[], { cwd?: string }];
        assert.strictEqual(resetCall[0], 'git');
        assert.deepStrictEqual(resetCall[1], ['reset', '--soft', 'HEAD~2']);
        assert.strictEqual(resetCall[2].cwd, '/test/repo');
    });

    // TESTS FOR SOFT RESET HEAD COMMAND WHEN CONSECUTIVE DCJS COMMITS EXIST
    test('softResetHead command should suggest and run reset N when consecutive DCJS commits exist', async () => {
        // ARRANGE - 3 DCJS, CLICK "Reset 3"
        const mockRepo = { rootUri: vscode.Uri.file('/test/repo'), state: { onDidChange: () => ({ dispose: () => { } }) } };
        const mockGit = { repositories: [mockRepo] };
        const mockGitExtension = { getAPI: () => mockGit };
        sandbox.stub(vscode.extensions, 'getExtension').returns({ exports: mockGitExtension } as vscode.Extension<any>);
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
        const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');
        const dcjs = 'DONT COMMIT JUST SAVE';
        sandbox.stub(vscode.window, 'showWarningMessage').resolves({ title: 'Reset 3' } as any);
        sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);

        const execFileSyncStub = sandbox.stub(childProcess, 'execFileSync');
        execFileSyncStub.onFirstCall().returns(`${dcjs}\n${dcjs}\n${dcjs}\n`);
        execFileSyncStub.onSecondCall().returns(Buffer.from(''));

        // ACT - ACTIVATE + SOFT RESET
        await activate(context);
        const commandCall = registerCommandStub.getCalls().find(call => call.args[0] === 'extension.softResetHead');
        assert.ok(commandCall);
        if (commandCall && typeof commandCall.args[1] === 'function') { await commandCall.args[1](); }

        // ASSERT - RESET HEAD~3
        assert.strictEqual(execFileSyncStub.callCount, 2);
        assert.deepStrictEqual(execFileSyncStub.getCall(1).args[1], ['reset', '--soft', 'HEAD~3']);
    });

    // TESTS FOR SOFT RESET HEAD COMMAND WHEN USER CANCELS SUGGESTION DIALOG
    test('softResetHead command should not run reset when user cancels suggestion dialog', async () => {
        // ARRANGE - DCJS, CANCEL
        const mockRepo = { rootUri: vscode.Uri.file('/test/repo'), state: { onDidChange: () => ({ dispose: () => { } }) } };
        const mockGit = { repositories: [mockRepo] };
        const mockGitExtension = { getAPI: () => mockGit };
        sandbox.stub(vscode.extensions, 'getExtension').returns({ exports: mockGitExtension } as vscode.Extension<any>);
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
        const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');
        sandbox.stub(vscode.window, 'showWarningMessage').resolves({ title: 'Cancel' } as any);

        const execFileSyncStub = sandbox.stub(childProcess, 'execFileSync').returns('DONT COMMIT JUST SAVE\n');

        // ACT - ACTIVATE + SOFT RESET
        await activate(context);
        const commandCall = registerCommandStub.getCalls().find(call => call.args[0] === 'extension.softResetHead');
        assert.ok(commandCall);
        if (commandCall && typeof commandCall.args[1] === 'function') { await commandCall.args[1](); }

        // ASSERT - LOG ONLY
        assert.strictEqual(execFileSyncStub.callCount, 1);
    });

    // TESTS FOR SOFT RESET HEAD COMMAND WHEN INPUT IS CANCELLED
    test('softResetHead command should not run reset if input is cancelled', async () => {
        // ARRANGE - 0 DCJS, CANCEL INPUT
        const mockRepo = { rootUri: vscode.Uri.file('/test/repo'), state: { onDidChange: () => ({ dispose: () => { } }) } };
        const mockGit = { repositories: [mockRepo] };
        const mockGitExtension = { getAPI: () => mockGit };
        sandbox.stub(vscode.extensions, 'getExtension').returns({ exports: mockGitExtension } as vscode.Extension<any>);
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
        const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');
        sandbox.stub(vscode.window, 'showInputBox').resolves(undefined);

        const execFileSyncStub = sandbox.stub(childProcess, 'execFileSync').returns('fix: other\n');

        // ACT - ACTIVATE + SOFT RESET
        await activate(context);
        const commandCall = registerCommandStub.getCalls().find(call => call.args[0] === 'extension.softResetHead');
        assert.ok(commandCall);
        if (commandCall && typeof commandCall.args[1] === 'function') { await commandCall.args[1](); }

        // ASSERT - LOG ONLY
        assert.strictEqual(execFileSyncStub.callCount, 1);
    });

    // TESTS FOR SOFT RESET HEAD COMMAND WHEN USER CANCELS CONFIRMATION AFTER MANUAL INPUT
    test('softResetHead command should not run reset when user cancels confirmation after manual input', async () => {
        // ARRANGE - 0 DCJS, INPUT 2, CANCEL CONFIRM
        const mockRepo = { rootUri: vscode.Uri.file('/test/repo'), state: { onDidChange: () => ({ dispose: () => { } }) } };
        const mockGit = { repositories: [mockRepo] };
        const mockGitExtension = { getAPI: () => mockGit };
        sandbox.stub(vscode.extensions, 'getExtension').returns({ exports: mockGitExtension } as vscode.Extension<any>);
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
        const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');
        sandbox.stub(vscode.window, 'showInputBox').resolves('2');
        sandbox.stub(vscode.window, 'showWarningMessage').resolves({ title: 'Cancel' } as any);

        const execFileSyncStub = sandbox.stub(childProcess, 'execFileSync').returns('fix: msg\n');

        // ACT - ACTIVATE + SOFT RESET
        await activate(context);
        const commandCall = registerCommandStub.getCalls().find(call => call.args[0] === 'extension.softResetHead');
        assert.ok(commandCall);
        if (commandCall && typeof commandCall.args[1] === 'function') { await commandCall.args[1](); }

        // ASSERT - LOG ONLY
        assert.strictEqual(execFileSyncStub.callCount, 1);
    });

    // TESTS FOR MANUAL INPUT VALIDATION
    test('softResetHead command should validate manual input values', async () => {
        // ARRANGE - 0 DCJS, CAPTURE VALIDATOR
        const mockRepo = { rootUri: vscode.Uri.file('/test/repo'), state: { onDidChange: () => ({ dispose: () => { } }) } };
        const mockGit = { repositories: [mockRepo] };
        const mockGitExtension = { getAPI: () => mockGit };
        sandbox.stub(vscode.extensions, 'getExtension').returns({ exports: mockGitExtension } as vscode.Extension<any>);
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
        const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');
        let validateInput: vscode.InputBoxOptions['validateInput'];
        sandbox.stub(vscode.window, 'showInputBox').callsFake(async options => {
            validateInput = options?.validateInput;
            return '2';
        });
        sandbox.stub(vscode.window, 'showWarningMessage').resolves({ title: 'Cancel' } as any);

        const execFileSyncStub = sandbox.stub(childProcess, 'execFileSync').returns('fix: msg\n');

        // ACT - ACTIVATE + SOFT RESET
        await activate(context);
        const commandCall = registerCommandStub.getCalls().find(call => call.args[0] === 'extension.softResetHead');
        assert.ok(commandCall);
        if (commandCall && typeof commandCall.args[1] === 'function') { await commandCall.args[1](); }

        // ASSERT - VALIDATION RULES
        assert.strictEqual(execFileSyncStub.callCount, 1);
        assert.ok(validateInput, 'validateInput should be provided');
        const runValidate = validateInput as (value: string) => string | undefined;
        assert.strictEqual(runValidate(''), 'Enter a number');
        assert.strictEqual(runValidate('   '), 'Enter a number');
        assert.strictEqual(runValidate('0'), 'Use 1 or more');
        assert.strictEqual(runValidate('1.2'), 'Use 1 or more');
        assert.strictEqual(runValidate('2'), undefined);
    });

    // TESTS FOR SOFT RESET HEAD COMMAND WHEN GIT EXTENSION NOT FOUND
    test('softResetHead command should show error when Git extension not found', async () => {
        // ARRANGE - NO GIT
        sandbox.stub(vscode.extensions, 'getExtension').returns(undefined);
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
        const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');
        const showNotificationStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);

        // ACT - ACTIVATE + SOFT RESET
        await activate(context);
        const commandCall = registerCommandStub.getCalls().find(call => call.args[0] === 'extension.softResetHead');
        assert.ok(commandCall);
        if (commandCall && typeof commandCall.args[1] === 'function') { await commandCall.args[1](); }

        // ASSERT - ERROR SHOWN
        assert.ok(showNotificationStub.calledOnce);
        assert.ok(showNotificationStub.getCall(0).args[0].includes('Git not available'));
    });

    // TESTS FOR SOFT RESET HEAD COMMAND WHEN NO GIT REPOSITORY
    test('softResetHead command should show error when no git repository', async () => {
        // ARRANGE - EMPTY REPOS
        const mockGit = { repositories: [] };
        const mockGitExtension = { getAPI: () => mockGit };
        sandbox.stub(vscode.extensions, 'getExtension').returns({ exports: mockGitExtension } as vscode.Extension<any>);
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
        const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');
        const showNotificationStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);

        // ACT - ACTIVATE + SOFT RESET
        await activate(context);
        const commandCall = registerCommandStub.getCalls().find(call => call.args[0] === 'extension.softResetHead');
        assert.ok(commandCall);
        if (commandCall && typeof commandCall.args[1] === 'function') { await commandCall.args[1](); }

        // ASSERT - ERROR SHOWN
        assert.ok(showNotificationStub.calledOnce);
        assert.ok(showNotificationStub.getCall(0).args[0].includes('No Git repo'));
    });

    // TESTS FOR SOFT RESET HEAD COMMAND WHEN GIT LOG FAILS
    test('softResetHead command should fallback to manual input when git log fails', async () => {
        // ARRANGE - LOG THROWS, INPUT 1, CONFIRM
        const mockRepo = { rootUri: vscode.Uri.file('/test/repo'), state: { onDidChange: () => ({ dispose: () => { } }) } };
        const mockGit = { repositories: [mockRepo] };
        const mockGitExtension = { getAPI: () => mockGit };
        sandbox.stub(vscode.extensions, 'getExtension').returns({ exports: mockGitExtension } as vscode.Extension<any>);
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
        const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');
        sandbox.stub(vscode.window, 'showInputBox').resolves('1');
        sandbox.stub(vscode.window, 'showWarningMessage').resolves({ title: 'Reset' } as any);
        sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);

        const execFileSyncStub = sandbox.stub(childProcess, 'execFileSync');
        execFileSyncStub.onFirstCall().throws(new Error('not a git repo'));
        execFileSyncStub.onSecondCall().returns(Buffer.from(''));

        // ACT - ACTIVATE + SOFT RESET
        await activate(context);
        const commandCall = registerCommandStub.getCalls().find(call => call.args[0] === 'extension.softResetHead');
        assert.ok(commandCall);
        if (commandCall && typeof commandCall.args[1] === 'function') { await commandCall.args[1](); }

        // ASSERT - RESET HEAD~1
        assert.strictEqual(execFileSyncStub.callCount, 2);
        assert.deepStrictEqual(execFileSyncStub.getCall(1).args[1], ['reset', '--soft', 'HEAD~1']);
    });

    // TESTS FOR SOFT RESET HEAD COMMAND WHEN GIT RESET FAILS
    test('softResetHead command should show error when git reset fails', async () => {
        // ARRANGE - RESET THROWS
        const mockRepo = { rootUri: vscode.Uri.file('/test/repo'), state: { onDidChange: () => ({ dispose: () => { } }) } };
        const mockGit = { repositories: [mockRepo] };
        const mockGitExtension = { getAPI: () => mockGit };
        sandbox.stub(vscode.extensions, 'getExtension').returns({ exports: mockGitExtension } as vscode.Extension<any>);
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
        const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');
        sandbox.stub(vscode.window, 'showInputBox').resolves('2');
        sandbox.stub(vscode.window, 'showWarningMessage').resolves({ title: 'Reset' } as any);
        const showErrorStub = sandbox.stub(vscode.window, 'showErrorMessage').resolves(undefined);

        const execFileSyncStub = sandbox.stub(childProcess, 'execFileSync');
        execFileSyncStub.onFirstCall().returns('fix: x\n');
        execFileSyncStub.onSecondCall().throws(Object.assign(new Error('reset failed'), { stderr: Buffer.from('fatal: ...') }));

        // ACT - ACTIVATE + SOFT RESET
        await activate(context);
        const commandCall = registerCommandStub.getCalls().find(call => call.args[0] === 'extension.softResetHead');
        assert.ok(commandCall);
        if (commandCall && typeof commandCall.args[1] === 'function') { await commandCall.args[1](); }

        // ASSERT - ERROR SHOWN
        assert.strictEqual(execFileSyncStub.callCount, 2);
        assert.ok(showErrorStub.calledOnce);
        assert.ok(showErrorStub.getCall(0).args[0].includes('Reset failed'));
    });

    // TESTS FOR SOFT RESET HEAD COMMAND WITH MULTIPLE REPOSITORIES
    test('softResetHead command with multiple repos should run reset on selected repo', async () => {
        // ARRANGE - 2 REPOS, PICK B, INPUT 1, CONFIRM
        const repoA = { rootUri: vscode.Uri.file('/a'), state: { onDidChange: () => ({ dispose: () => { } }) } };
        const repoB = { rootUri: vscode.Uri.file('/b'), state: { onDidChange: () => ({ dispose: () => { } }) } };
        const mockGit = { repositories: [repoA, repoB] };
        const mockGitExtension = { getAPI: () => mockGit };
        sandbox.stub(vscode.extensions, 'getExtension').returns({ exports: mockGitExtension } as vscode.Extension<any>);
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
        const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');
        sandbox.stub(vscode.window, 'showInputBox').resolves('1');
        sandbox.stub(vscode.window, 'showWarningMessage').resolves({ title: 'Reset' } as any);
        sandbox.stub(vscode.window, 'showInformationMessage').resolves(undefined);
        sandbox.stub(vscode.window, 'showQuickPick').resolves({ label: 'b', description: '/b', repo: repoB } as any);

        const execFileSyncStub = sandbox.stub(childProcess, 'execFileSync');
        execFileSyncStub.onFirstCall().returns('fix: y\n');
        execFileSyncStub.onSecondCall().returns(Buffer.from(''));

        // ACT - ACTIVATE + SOFT RESET
        await activate(context);
        const commandCall = registerCommandStub.getCalls().find(call => call.args[0] === 'extension.softResetHead');
        assert.ok(commandCall);
        if (commandCall && typeof commandCall.args[1] === 'function') { await commandCall.args[1](); }

        // ASSERT - RESET CWD /b
        assert.strictEqual(execFileSyncStub.callCount, 2);
        const resetOpts = execFileSyncStub.getCall(1).args[2] as { cwd: string } | undefined;
        assert.strictEqual(resetOpts?.cwd, '/b');
    });

    // TESTS FOR SOFT RESET HEAD COMMAND WITH MULTIPLE REPOSITORIES WHEN USER CANCELS REPO PICK
    test('softResetHead command with multiple repos should not run when user cancels repo pick', async () => {
        // ARRANGE - 2 REPOS, CANCEL PICK
        const repoA = { rootUri: vscode.Uri.file('/a'), state: { onDidChange: () => ({ dispose: () => { } }) } };
        const repoB = { rootUri: vscode.Uri.file('/b'), state: { onDidChange: () => ({ dispose: () => { } }) } };
        const mockGit = { repositories: [repoA, repoB] };
        const mockGitExtension = { getAPI: () => mockGit };
        sandbox.stub(vscode.extensions, 'getExtension').returns({ exports: mockGitExtension } as vscode.Extension<any>);
        sandbox.stub(vscode.workspace, 'workspaceFolders').value([]);
        sandbox.stub(vscode.workspace, 'onDidChangeWorkspaceFolders');
        const registerCommandStub = sandbox.stub(vscode.commands, 'registerCommand');
        sandbox.stub(vscode.window, 'showQuickPick').resolves(undefined);

        const execFileSyncStub = sandbox.stub(childProcess, 'execFileSync');

        // ACT - ACTIVATE + SOFT RESET
        await activate(context);
        const commandCall = registerCommandStub.getCalls().find(call => call.args[0] === 'extension.softResetHead');
        assert.ok(commandCall);
        if (commandCall && typeof commandCall.args[1] === 'function') { await commandCall.args[1](); }

        // ASSERT - NO GIT CALL
        assert.strictEqual(execFileSyncStub.callCount, 0);
    });
});
