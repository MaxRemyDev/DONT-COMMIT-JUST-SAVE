import * as vscode from 'vscode';
import * as fs from 'node:fs';
import { LOG_FILE, logToFile, LogEntry } from './logging';
import { NotificationType, LogType } from '../types';

export const showNotification = async (type: NotificationType, message: string, details?: string, showDetailsButton: boolean = false): Promise<{ title: string } | undefined> => {
    const now = new Date().toLocaleString();

    let logType: LogType;
    const typeMap: Record<NotificationType, LogType> = {
        info: 'success',
        warning: 'warning',
        error: 'error',
    };
    logType = typeMap[type];

    const logEntry: LogEntry = { timestamp: now, type: logType, message, details };
    await logToFile(logEntry);

    // SHOW DETAILS BUTTON IF REQUESTED
    const showDetails = async (): Promise<void> => {
        const doc = await vscode.workspace.openTextDocument({ content: fs.readFileSync(LOG_FILE, 'utf8'), language: 'markdown' });
        await vscode.window.showTextDocument(doc, { preview: true });
    };

    // SHOW INFO, WARNING OR ERROR MESSAGE
    if (type === 'info') {
        const buttons = showDetailsButton ? [{ title: 'Show Details' }] : [];
        return vscode.window.showInformationMessage(message, { detail: details, modal: false }, ...buttons).then(selection => {
            if (selection?.title === 'Show Details') { showDetails(); }
            return selection as { title: string } | undefined;
        });
    } else if (type === 'warning') {
        return vscode.window.showWarningMessage(message, { detail: details, modal: true }, { title: 'Proceed' });
    } else {
        return vscode.window.showErrorMessage(message, { detail: details, modal: true }).then(selection => selection as { title: string } | undefined);
    }
};
