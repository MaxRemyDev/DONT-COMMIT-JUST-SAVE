import * as path from 'node:path';
import { glob } from 'glob';
import Mocha from 'mocha';

export function run(): Promise<void> {
    const mocha = new Mocha({ ui: 'tdd', color: true }); // CREATE MOCHA TEST
    const testsRoot = path.resolve(__dirname, '..');

    return glob('**/**.test.js', { cwd: testsRoot }).then(async files => {
        // ADD FILES TO TEST SUITE
        files.forEach((f: string) => mocha.addFile(path.resolve(testsRoot, f)));

        // RUN MOCHA TEST
        return new Promise<void>((c, e) => {
            mocha.run((failures: number) => {
                failures > 0 ? e(new Error(`${failures} tests failed.`)) : c();
            });
        });
    }).catch(err => {
        console.error(err);
        throw err;
    });
}
