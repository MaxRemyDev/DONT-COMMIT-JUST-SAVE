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
        assert.strictEqual(callArgs[0], 'HEADS UP');
        assert.deepStrictEqual(callArgs[1], {
            detail: 'This repo has a "DONT COMMIT JUST SAVE" commit (example: from a pull).\n\n⚠ Remove or amend it first.',
            modal: true
        });
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

    // TEST FOR SOFT RESET HEAD COMMAND SUCCESS VIA MANUAL INPUT
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

    // TEST FOR SOFT RESET HEAD COMMAND SUCCESS VIA SUGGESTION
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

    // TEST FOR SOFT RESET HEAD COMMAND CANCEL AT SUGGESTION DIALOG
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

    // TEST FOR SOFT RESET HEAD COMMAND CANCEL AT INPUT
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

    // TEST FOR SOFT RESET HEAD COMMAND CANCEL AT CONFIRMATION (MANUAL INPUT FLOW)
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

    // TEST FOR SOFT RESET HEAD WHEN GIT EXTENSION NOT FOUND
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

    // TEST FOR SOFT RESET HEAD WHEN NO REPOSITORY
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

    // TEST FOR GET CONSECUTIVE COUNT WHEN GIT LOG THROWS (FALLBACK TO 0)
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

    // TEST FOR SOFT RESET WHEN GIT RESET THROWS
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

    // TEST FOR MULTIPLE REPOS: USER SELECTS REPO
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

    // TEST FOR MULTIPLE REPOS: USER CANCELS QUICK PICK
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
