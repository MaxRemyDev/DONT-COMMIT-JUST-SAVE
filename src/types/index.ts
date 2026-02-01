import type * as vscode from 'vscode';

export type NotificationType = 'info' | 'warning' | 'error';
export type LogType = 'success' | 'warning' | 'error';

export type GitRepository = { rootUri?: vscode.Uri; inputBox?: { value: string } };
export type GitAPI = { repositories: GitRepository[] };
export type GitExtensionExports = { getAPI(version: 1): GitAPI };
