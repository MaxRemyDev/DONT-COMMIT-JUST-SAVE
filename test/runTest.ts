import * as path from 'node:path';
import { runTests } from '@vscode/test-electron';

async function main() {
    try {
        // FOLDER CONTAINING PACKAGE.JSON PASSED TO `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, '../../');

        // PATH TO TEST RUNNER AND PASSED TO --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, './suite/index');

        // DOWNLOAD VSCODE, UNZIP AND RUN INTEGRATION TEST
        await runTests({ extensionDevelopmentPath, extensionTestsPath });
    } catch (err) {
        console.error('Failed to run tests', err);
        process.exit(1);
    }
}

main(); // NOSONAR: typescript:S7785 - TOP-LEVEL AWAIT NOT SUPPORTED IN COMMONJS MODULES
