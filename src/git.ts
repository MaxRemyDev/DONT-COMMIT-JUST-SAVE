import { Event } from 'vscode';

export interface RepositoryState {
    pushPending: boolean;
    onDidChange: Event<void>;
}

export interface Repository {
    state: RepositoryState;
}

export interface API {
    repositories: Repository[];
    onDidOpenRepository: Event<Repository>;
} 
