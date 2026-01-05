import * as vscode from 'vscode';
import * as fs from 'fs';
import { LOG_FILE, logToFile, LogEntry } from './logging';

export const showNotification = async (type: 'info' | 'warning' | 'error', message: string, details?: string, showDetailsButton: boolean = false): Promise<{ title: string } | undefined> => {
    // LOG ENTRY IN NOW DATE
    const now = new Date().toLocaleString();
    const logEntry: LogEntry = {
        timestamp: now,
        type: type === 'info' ? 'success' : type === 'warning' ? 'warning' : 'error',
        message,
        details
    };

    await logToFile(logEntry); // LOG TO FILE

    // SHOW DETAILS BUTTON IF REQUESTED
    const showDetails = async (): Promise<void> => {
        const doc = await vscode.workspace.openTextDocument({
            content: fs.readFileSync(LOG_FILE, 'utf8'),
            language: 'markdown'
        });
        await vscode.window.showTextDocument(doc, { preview: true });
    };

    // SHOW INFO OR WARNING MESSAGE
    if (type === 'info') {
        const buttons = showDetailsButton ? [{ title: 'Show Details' }] : [];
        return vscode.window.showInformationMessage(
            message,
            { detail: details, modal: false },
            ...buttons
        ).then(selection => {
            if (selection?.title === 'Show Details') {
                showDetails();
            }
            return selection as { title: string } | undefined;
        });
    } else if (type === 'warning') {
        // SHOW WARNING MESSAGE
        return vscode.window.showWarningMessage(
            message,
            { detail: details, modal: true },
            { title: 'Proceed' }
        );
    } else {
        // SHOW ERROR MESSAGE
        return vscode.window.showErrorMessage(
            message,
            { detail: details, modal: false }
        ).then(selection => selection as { title: string } | undefined);
    }
};
