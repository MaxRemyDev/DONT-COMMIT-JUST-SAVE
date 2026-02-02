import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
const childProcess = require('node:child_process') as typeof import('node:child_process');
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { resolveGitDir, resolveHooksDir, getGitApi, pickRepository, hasGitHead } from '../../src/utils/git';

// TESTS FOR GIT UTILS
suite('Git Utils Tests', () => {
    let sandbox: sinon.SinonSandbox;
    const tempDirs: string[] = [];

    // CREATE TEMP DIRECTORY FOR TESTS
    const createTempDir = (): string => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dont-commit-just-save-git-'));
        tempDirs.push(dir);
        return dir;
    };

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
        for (const dir of tempDirs) {
            if (fs.existsSync(dir)) { fs.rmSync(dir, { recursive: true, force: true }); }
        }
        tempDirs.length = 0;
    });

    // TEST FOR MISSING .GIT
    test('resolveGitDir should return undefined when .git is missing', () => {
        // ARRANGE - TEMP DIR
        const root = createTempDir();

        // ACT & ASSERT - CALL RESOLVEGITDIR & MUST BE UNDEFINED
        assert.strictEqual(resolveGitDir(root), undefined);
    });

    // TEST FOR .GIT DIRECTORY
    test('resolveGitDir should return directory path when .git is a directory', () => {
        // ARRANGE - CREATE DIR
        const root = createTempDir();
        const gitDir = path.join(root, '.git');
        fs.mkdirSync(gitDir, { recursive: true });

        // ACT & ASSERT - CALL RESOLVEGITDIR & MUST RETURN DIR
        assert.strictEqual(resolveGitDir(root), gitDir);
    });

    // TEST FOR GITDIR FILE RESOLUTION
    test('resolveGitDir should resolve gitdir file values', () => {
        // ARRANGE - CREATE FILES
        const root = createTempDir();
        const gitFile = path.join(root, '.git');
        const relativeTarget = path.join('.git', 'worktrees', 'foo');
        fs.writeFileSync(gitFile, `gitdir: ${relativeTarget}\n`, 'utf8');

        // ACT & ASSERT - CALL RESOLVEGITDIR REL & RESOLVED RELATIVE
        assert.strictEqual(resolveGitDir(root), path.resolve(root, relativeTarget));

        // ARRANGE - SET ABSOLUTE DIR
        const absoluteTarget = path.join(root, 'abs', 'gitdir');
        fs.writeFileSync(gitFile, `gitdir: ${absoluteTarget}\n`, 'utf8');

        // ACT & ASSERT - CALL RESOLVEGITDIR ABS & EQUAL ABSOLUTE
        assert.strictEqual(resolveGitDir(root), absoluteTarget);
    });

    // TEST FOR INVALID GITDIR CONTENT
    test('resolveGitDir should return undefined when gitdir value is missing', () => {
        // ARRANGE - BAD GITFILE
        const root = createTempDir();
        const gitFile = path.join(root, '.git');
        fs.writeFileSync(gitFile, 'not a gitdir\n', 'utf8');

        // ACT & ASSERT - CALL RESOLVEGITDIR & MUST BE UNDEFINED
        assert.strictEqual(resolveGitDir(root), undefined);
    });

    // TEST FOR NON-FILE/NON-DIR STAT
    test('resolveGitDir should return undefined for non-file, non-dir stats', function () {
        if (process.platform === 'win32') { this.skip(); }

        // ARRANGE - CREATE FIFO
        const root = createTempDir();
        const gitPath = path.join(root, '.git');
        childProcess.execFileSync('mkfifo', [gitPath]);

        // ACT & ASSERT - CALL RESOLVEGITDIR & MUST BE UNDEFINED
        assert.strictEqual(resolveGitDir(root), undefined);
    });

    // TEST FOR GIT API ERROR HANDLING
    test('getGitApi should return undefined when API throws', async () => {
        // ARRANGE - STUB THROW
        sandbox.stub(vscode.extensions, 'getExtension').returns({
            isActive: true,
            exports: { getAPI: () => { throw new Error('boom'); } }
        } as vscode.Extension<any>);

        // ACT - CALL GETGITAPI
        const api = await getGitApi();

        // ASSERT - MUST BE UNDEFINED
        assert.strictEqual(api, undefined);
    });

    // TEST FOR GIT API ACTIVATION
    test('getGitApi should activate extension when inactive', async () => {
        // ARRANGE - STUB EXTENSION
        const mockGit = { repositories: [] };
        const extensionStub = {
            isActive: false,
            activate: sandbox.stub().resolves(undefined),
            exports: { getAPI: () => mockGit }
        };
        sandbox.stub(vscode.extensions, 'getExtension').returns(extensionStub as unknown as vscode.Extension<any>);

        // ACT - CALL GETGITAPI
        const api = await getGitApi();

        // ASSERT - RETURNS API, ACTIVATED
        assert.strictEqual(api, mockGit);
        assert.ok(extensionStub.activate.calledOnce);
    });

    // TEST FOR GIT API ACTIVATION FAILURE
    test('getGitApi should return undefined when activation fails', async () => {
        // ARRANGE - STUB FAILURE
        const extensionStub = {
            isActive: false,
            activate: sandbox.stub().rejects(new Error('nope')),
            exports: { getAPI: () => ({ repositories: [] }) }
        };
        sandbox.stub(vscode.extensions, 'getExtension').returns(extensionStub as unknown as vscode.Extension<any>);

        // ACT - CALL GETGITAPI
        const api = await getGitApi();

        // ASSERT - MUST BE UNDEFINED, ACT CALLED
        assert.strictEqual(api, undefined);
        assert.ok(extensionStub.activate.calledOnce);
    });

    // TEST FOR PICKING REPOSITORY FROM ACTIVE EDITOR
    test('pickRepository should prefer active editor repo', async () => {
        // ARRANGE - ACTIVE EDITOR
        const repoA = { rootUri: vscode.Uri.file('/repo') };
        const repoB = { rootUri: vscode.Uri.file('/repo/sub') };
        const repoC = {};
        sandbox.stub(vscode.window, 'activeTextEditor').value({
            document: { uri: vscode.Uri.file('/repo/sub/file.ts') }
        } as vscode.TextEditor);
        const quickPickStub = sandbox.stub(vscode.window, 'showQuickPick');

        // ACT - CALL PICKREPO
        const picked = await pickRepository([repoA, repoB, repoC]);

        // ASSERT - MUST BE REPOB
        assert.strictEqual(picked, repoB);
        assert.ok(quickPickStub.notCalled);
    });

    // TEST FOR PICKING REPOSITORY FROM ACTIVE EDITOR WHEN SHORTER REPO APPEARS LATER
    test('pickRepository should keep longest match when shorter repo appears later', async () => {
        // ARRANGE - REPOS REVERSED
        const repoA = { rootUri: vscode.Uri.file('/repo') };
        const repoB = { rootUri: vscode.Uri.file('/repo/sub') };
        sandbox.stub(vscode.window, 'activeTextEditor').value({ document: { uri: vscode.Uri.file('/repo/sub/file.ts') } } as vscode.TextEditor);
        const quickPickStub = sandbox.stub(vscode.window, 'showQuickPick');

        // ACT - CALL PICKREPO
        const picked = await pickRepository([repoB, repoA]);

        // ASSERT - MUST BE REPOB
        assert.strictEqual(picked, repoB);
        assert.ok(quickPickStub.notCalled);
    });

    // TEST FOR PICKING REPOSITORY WHEN PROMPT IS FALSE
    test('pickRepository should return first repo when prompt is false', async () => {
        // ARRANGE - PROMPT FALSE
        const repoA = { rootUri: vscode.Uri.file('/a') };
        const repoB = { rootUri: vscode.Uri.file('/b') };
        sandbox.stub(vscode.window, 'activeTextEditor').value(undefined);
        const quickPickStub = sandbox.stub(vscode.window, 'showQuickPick');

        // ACT - CALL PICKREPO
        const picked = await pickRepository([repoA, repoB], { prompt: false, preferActive: false });

        // ASSERT - MUST BE REPOA
        assert.strictEqual(picked, repoA);
        assert.ok(quickPickStub.notCalled);
    });

    // TEST FOR PICKING REPOSITORY WHEN PREFER ACTIVE IS FALSE
    test('pickRepository should use quick pick when preferActive is false', async () => {
        // ARRANGE - STUB SHOWQUICKPICK
        const repoA = { rootUri: vscode.Uri.file('/a') };
        const repoB = { rootUri: vscode.Uri.file('/b') };
        sandbox.stub(vscode.window, 'activeTextEditor').value({
            document: { uri: vscode.Uri.file('/a/file.ts') }
        } as vscode.TextEditor);
        sandbox.stub(vscode.window, 'showQuickPick').resolves({ label: 'b', description: '/b', repo: repoB } as any);

        // ACT - CALL PICKREPO PREFERACTIVE FALSE
        const picked = await pickRepository([repoA, repoB], { preferActive: false });

        // ASSERT - MUST BE REPOB
        assert.strictEqual(picked, repoB);
    });

    // TEST FOR RESOLVING HOOKS DIRECTORY WHEN ABSOLUTE GIT PATH IS AVAILABLE
    test('resolveHooksDir should prefer absolute git path when available', () => {
        // ARRANGE - MAKE .GIT DIR ABS STUB
        const root = createTempDir();
        const gitDir = path.join(root, '.git');
        fs.mkdirSync(gitDir, { recursive: true });

        sandbox.stub(childProcess, 'execFileSync').callsFake((cmd: string, args?: readonly string[]) => {
            const resolvedArgs = args ?? [];
            if (cmd === 'git' && resolvedArgs[0] === 'rev-parse' && resolvedArgs[1] === '--absolute-git-path') {
                return '/abs/hooks\n';
            }
            throw new Error('fail');
        });
        // ACT & ASSERT - CALL RESOLVEHOOKSDIR & MUST BE ABS HOOKS
        assert.strictEqual(resolveHooksDir(root), '/abs/hooks');
    });

    // TEST FOR RESOLVING HOOKS DIRECTORY WHEN ABSOLUTE GIT PATH FAILS
    test('resolveHooksDir should fallback to core.hooksPath when absolute path fails', () => {
        // ARRANGE - MAKE .GIT DIR CORE HOOKSTUB
        const root = createTempDir();
        const gitDir = path.join(root, '.git');
        fs.mkdirSync(gitDir, { recursive: true });

        sandbox.stub(childProcess, 'execFileSync').callsFake((cmd: string, args?: readonly string[]) => {
            const resolvedArgs = args ?? [];
            if (cmd === 'git' && resolvedArgs[0] === 'rev-parse') { throw new Error('no absolute'); }
            if (cmd === 'git' && resolvedArgs[0] === 'config') { return '/custom/hooks\n'; }
            throw new Error('fail');
        });

        // ACT & ASSERT - CALL RESOLVEHOOKSDIR & MUST BE CUSTOM HOOKS
        assert.strictEqual(resolveHooksDir(root), '/custom/hooks');
    });

    // TEST FOR RESOLVING HOOKS DIRECTORY WHEN RELATIVE CORE.HOOKSPATH IS AVAILABLE
    test('resolveHooksDir should resolve relative core.hooksPath', () => {
        // ARRANGE - MAKE .GIT DIR RELATIVE STUB
        const root = createTempDir();
        const gitDir = path.join(root, '.git');
        fs.mkdirSync(gitDir, { recursive: true });

        sandbox.stub(childProcess, 'execFileSync').callsFake((cmd: string, args?: readonly string[]) => {
            const resolvedArgs = args ?? [];
            if (cmd === 'git' && resolvedArgs[0] === 'rev-parse') { throw new Error('no absolute'); }
            if (cmd === 'git' && resolvedArgs[0] === 'config') { return 'hooks\n'; }
            throw new Error('fail');
        });

        // ACT & ASSERT - CALL RESOLVEHOOKSDIR & MUST BE REL PATH
        assert.strictEqual(resolveHooksDir(root), path.resolve(root, 'hooks'));
    });

    // TEST FOR RESOLVING HOOKS DIRECTORY WHEN NO CONFIG IS AVAILABLE
    test('resolveHooksDir should fallback to .git/hooks when no config is available', () => {
        // ARRANGE - MAKE .GIT DIR STUB THROWS
        const root = createTempDir();
        const gitDir = path.join(root, '.git');
        fs.mkdirSync(gitDir, { recursive: true });

        sandbox.stub(childProcess, 'execFileSync').throws(new Error('no git'));

        // ACT & ASSERT - CALL RESOLVEHOOKSDIR & MUST BE GIT HOOKS
        assert.strictEqual(resolveHooksDir(root), path.join(gitDir, 'hooks'));
    });

    // TEST FOR CHECKING IF GIT HEAD EXISTS WHEN GIT OUTPUT IS EMPTY
    test('hasGitHead should return false when git output is empty', () => {
        // ARRANGE - STUB EMPTY
        sandbox.stub(childProcess, 'execFileSync').returns('   \n');

        // ACT & ASSERT - CALL HASGITHEAD & MUST BE FALSE
        assert.strictEqual(hasGitHead('/repo'), false);
    });

    // TEST FOR CHECKING IF GIT HEAD EXISTS WHEN GIT OUTPUT IS NON-EMPTY
    test('hasGitHead should return true when git output is non-empty', () => {
        // ARRANGE - STUB HEADHASH
        sandbox.stub(childProcess, 'execFileSync').returns('HEADHASH\n');

        // ACT & ASSERT - CALL HASGITHEAD & MUST BE TRUE
        assert.strictEqual(hasGitHead('/repo'), true);
    });

    // TEST FOR PICKING REPOSITORY WHEN REPOSITORY LIST IS EMPTY
    test('pickRepository should return undefined when repository list is empty', async () => {
        // ARRANGE - EMPTY LIST
        const quickPickStub = sandbox.stub(vscode.window, 'showQuickPick');

        // ACT - CALL PICKREPO
        const picked = await pickRepository([], { prompt: true });

        // ASSERT - MUST BE UNDEFINED
        assert.strictEqual(picked, undefined);
        assert.ok(quickPickStub.notCalled);
    });

    // TEST FOR PICKING REPOSITORY WHEN ACTIVE FILE IS OUTSIDE REPOS
    test('pickRepository should fall back to quick pick when active file is outside repos', async () => {
        // ARRANGE - SET OUTSIDE FILE
        const repoA = { rootUri: vscode.Uri.file('/a') };
        const repoB = { rootUri: vscode.Uri.file('/b') };
        sandbox.stub(vscode.window, 'activeTextEditor').value({ document: { uri: vscode.Uri.file('/outside/file.ts') } } as vscode.TextEditor);
        sandbox.stub(vscode.window, 'showQuickPick').resolves({ label: 'b', description: '/b', repo: repoB } as any);

        // ACT - CALL PICKREPO
        const picked = await pickRepository([repoA, repoB]);

        // ASSERT - MUST BE REPOB
        assert.strictEqual(picked, repoB);
    });

    // TEST FOR PICKING REPOSITORY WHEN ROOT PATH EQUALITY IS MATCHED
    test('pickRepository should match root path equality', async () => {
        // ARRANGE - SET EQUAL PATH
        const repoA = { rootUri: vscode.Uri.file('/repo') };
        const repoB = { rootUri: vscode.Uri.file('/other') };
        sandbox.stub(vscode.window, 'activeTextEditor').value({ document: { uri: vscode.Uri.file('/repo') } } as vscode.TextEditor);
        const quickPickStub = sandbox.stub(vscode.window, 'showQuickPick');

        // ACT - CALL PICKREPO
        const picked = await pickRepository([repoA, repoB]);

        // ASSERT - MUST BE REPOA
        assert.strictEqual(picked, repoA);
        assert.ok(quickPickStub.notCalled);
    });

    // TEST FOR PICKING REPOSITORY WHEN ENTRIES WITHOUT ROOTURI ARE PRESENT
    test('pickRepository should include entries without rootUri', async () => {
        // ARRANGE - NO ROOTURI
        const repoA = { rootUri: vscode.Uri.file('/a') };
        const repoB = {};
        sandbox.stub(vscode.window, 'activeTextEditor').value(undefined);
        sandbox.stub(vscode.window, 'showQuickPick').resolves({ label: 'Repository', description: '', repo: repoB } as any);

        // ACT - CALL PICKREPO
        const picked = await pickRepository([repoA, repoB], { preferActive: false });

        // ASSERT - MUST BE REPOB
        assert.strictEqual(picked, repoB);
    });

    // TEST FOR PICKING REPOSITORY WHEN MATCHING CASE-INSENSITIVELY ON WIN32
    test('pickRepository should match case-insensitively on win32', async () => {
        // ARRANGE - MOCK WIN32
        const originalDescriptor = Object.getOwnPropertyDescriptor(process, 'platform');
        Object.defineProperty(process, 'platform', { value: 'win32' });

        try {
            // ARRANGE - REPOS DIFF CASE
            const repoA = { rootUri: vscode.Uri.file('/Repo') };
            const repoB = { rootUri: vscode.Uri.file('/Other') };
            sandbox.stub(vscode.window, 'activeTextEditor').value({ document: { uri: vscode.Uri.file('/repo/file.ts') } } as vscode.TextEditor);
            const quickPickStub = sandbox.stub(vscode.window, 'showQuickPick');

            // ACT - CALL PICKREPO
            const picked = await pickRepository([repoA, repoB]);

            // ASSERT - MUST BE REPOA
            assert.strictEqual(picked, repoA);
            assert.ok(quickPickStub.notCalled);
        } finally {
            // ARRANGE - RESTORE PLAT
            if (originalDescriptor) { Object.defineProperty(process, 'platform', originalDescriptor); }
        }
    });
});
