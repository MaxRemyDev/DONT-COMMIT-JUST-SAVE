import * as assert from 'node:assert';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { createMockExtensionContext } from './extensionContext';

// TESTS FOR EXTENSION CONTEXT HELPER
suite('Extension Context Helper', () => {
    // TEST FOR CREATE MOCK EXTENSION CONTEXT FUNCTION
    test('createMockExtensionContext should expose callable APIs', async () => {
        // ASSERT - WORKSPACE MEMENTO API
        const context = createMockExtensionContext();
        const workspaceMemento = context.workspaceState as vscode.Memento & { setKeysForSync(keys: readonly string[]): void };
        assert.strictEqual(workspaceMemento.get('missing'), undefined);
        await workspaceMemento.update('key', 'value');
        workspaceMemento.setKeysForSync(['a']);
        assert.deepStrictEqual(workspaceMemento.keys(), []);

        // ASSERT - GLOBAL MEMENTO API
        const globalMemento = context.globalState as vscode.Memento & { setKeysForSync(keys: readonly string[]): void };
        assert.strictEqual(globalMemento.get('missing'), undefined);
        await globalMemento.update('key', 'value');
        globalMemento.setKeysForSync(['a']);
        assert.deepStrictEqual(globalMemento.keys(), []);

        // ASSERT - ENVIRONMENT VARIABLE COLLECTION API
        const env = context.environmentVariableCollection;
        env.replace('KEY', 'VALUE');
        env.append('KEY', 'VALUE');
        env.prepend('KEY', 'VALUE');
        assert.strictEqual(env.get('KEY'), undefined);
        env.forEach(() => { /* NO-OP */ });
        env.delete('KEY');
        env.clear();
        const scoped = env.getScoped({ workspaceFolder: { uri: vscode.Uri.file(''), name: 'scope', index: 0 } });
        assert.ok(scoped);
        for (const _ of env) { /* NO-OP */ }

        // ASSERT - PATH RESOLUTION
        assert.strictEqual(context.asAbsolutePath('foo'), path.resolve('foo'));
    });
});
