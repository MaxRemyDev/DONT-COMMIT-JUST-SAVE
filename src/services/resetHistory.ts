import * as vscode from 'vscode';
import { runCommand } from '../utils/git';
import { showNotification } from '../utils/notifications';

export class ResetHistory {
    private static readonly MAX_HISTORY = 10; // MAX HISTORY
    private history: Array<{
        timestamp: number;
        commits: string[];
        branch: string;
        repoPath: string;
        normalCommits: string[];
    }> = [];

    // ADD RESET TO HISTORY
    addReset(repoPath: string, dontCommitHashes: string[], normalCommits: string[], branch: string) {
        this.history.unshift({
            timestamp: Date.now(),
            commits: dontCommitHashes,
            branch,
            repoPath,
            normalCommits
        });

        // KEEP ONLY LAST MAX_HISTORY ITEMS
        if (this.history.length > ResetHistory.MAX_HISTORY) {
            this.history.pop();
        }
    }

    // SHOW HISTORY QUICK PICK
    async showHistory() {
        if (this.history.length === 0) {
            vscode.window.showInformationMessage('No reset history available');
            return;
        }

        // CREATE HISTORY ITEMS
        const items = this.history.map((item, index) => {
            const date = new Date(item.timestamp).toLocaleString();
            return {
                label: `$(history) Reset on ${date}`,
                description: `${item.commits.length} commits on ${item.branch}`,
                detail: `Click to undo this reset`,
                index
            };
        });

        // SHOW HISTORY QUICK PICK
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a reset to undo',
            title: 'Reset History'
        });

        // UNDO SELECTED RESET
        if (selected) {
            this.undoReset(selected.index);
        }
    }

    // UNDO SELECTED RESET
    private async undoReset(index: number) {
        const item = this.history[index];
        if (!item) return;

        try {
            await runCommand('git stash', item.repoPath); // STASH ANY CURRENT CHANGES

            // RESET TO BEFORE THE NORMAL COMMITS
            await runCommand(`git reset --hard HEAD~${item.normalCommits.length}`, item.repoPath);

            // APPLY ALL COMMITS IN ORDER
            for (const commit of [...item.normalCommits, ...item.commits]) {
                await runCommand(`git cherry-pick ${commit}`, item.repoPath);
            }

            // POP THE STASH IF WE CREATED ONE
            const stashList = await runCommand('git stash list', item.repoPath);
            if (stashList) {
                await runCommand('git stash pop', item.repoPath);
            }

            await showNotification(
                'info',
                `Successfully restored reset from ${new Date(item.timestamp).toLocaleString()}`,
                `Operation Summary:
• Branch: ${item.branch}
• DONT COMMIT JUST SAVE commits restored: ${item.commits.length}
• Normal commits preserved: ${item.normalCommits.length}`,
                true // Show Details button for restore operation
            );

            // REMOVE THIS ITEM FROM HISTORY
            this.history.splice(index, 1);
        } catch (error) {
            await showNotification(
                'error',
                `Failed to undo reset: ${error}`,
                undefined,
                true // Show Details button for failed operations too
            );
        }
    }
}

// CREATE A SINGLETON INSTANCE
export const resetHistory = new ResetHistory(); 
