import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as childProcess from 'node:child_process';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { resolveGitDir, getGitApi } from '../../src/utils/git';

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
        const root = createTempDir();
        assert.strictEqual(resolveGitDir(root), undefined);
    });

    // TEST FOR .GIT DIRECTORY
    test('resolveGitDir should return directory path when .git is a directory', () => {
        const root = createTempDir();
        const gitDir = path.join(root, '.git');
        fs.mkdirSync(gitDir, { recursive: true });
        assert.strictEqual(resolveGitDir(root), gitDir);
    });

    // TEST FOR GITDIR FILE RESOLUTION
    test('resolveGitDir should resolve gitdir file values', () => {
        const root = createTempDir();
        const gitFile = path.join(root, '.git');
        const relativeTarget = path.join('.git', 'worktrees', 'foo');
        fs.writeFileSync(gitFile, `gitdir: ${relativeTarget}\n`, 'utf8');
        assert.strictEqual(resolveGitDir(root), path.resolve(root, relativeTarget));

        const absoluteTarget = path.join(root, 'abs', 'gitdir');
        fs.writeFileSync(gitFile, `gitdir: ${absoluteTarget}\n`, 'utf8');
        assert.strictEqual(resolveGitDir(root), absoluteTarget);
    });

    // TEST FOR INVALID GITDIR CONTENT
    test('resolveGitDir should return undefined when gitdir value is missing', () => {
        const root = createTempDir();
        const gitFile = path.join(root, '.git');
        fs.writeFileSync(gitFile, 'not a gitdir\n', 'utf8');
        assert.strictEqual(resolveGitDir(root), undefined);
    });

    // TEST FOR NON-FILE/NON-DIR STAT
    test('resolveGitDir should return undefined for non-file, non-dir stats', function () {
        if (process.platform === 'win32') { this.skip(); }
        const root = createTempDir();
        const gitPath = path.join(root, '.git');
        childProcess.execFileSync('mkfifo', [gitPath]);
        assert.strictEqual(resolveGitDir(root), undefined);
    });

    // TEST FOR GIT API ERROR HANDLING
    test('getGitApi should return undefined when API throws', () => {
        sandbox.stub(vscode.extensions, 'getExtension').returns({
            exports: { getAPI: () => { throw new Error('boom'); } }
        } as vscode.Extension<any>);

        const api = getGitApi();
        assert.strictEqual(api, undefined);
    });
});
