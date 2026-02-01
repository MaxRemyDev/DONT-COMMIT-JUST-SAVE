import * as path from 'node:path';
import * as vscode from 'vscode';

// RETURNS A MOCK VSCODE EXTENSIONCONTEXT FOR TESTS
export function createMockExtensionContext(): vscode.ExtensionContext {
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

    return {
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
}
