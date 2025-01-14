import { exec } from 'child_process';
import { logToFile } from './logging';
import { showNotification } from './notifications';

export const runCommand = async (cmd: string, cwd?: string): Promise<string> => {
    const startTime = Date.now();
    try {
        const result = await new Promise<string>((resolve, reject) => {
            exec(cmd, { cwd }, (error, stdout, stderr) => {
                // CHECK FOR PATCH AND MERGE FAILURES
                if (stderr && (
                    stderr.includes('patch failed:') ||
                    stderr.includes('patch does not apply') ||
                    stderr.includes('Merge conflict marker encountered') ||
                    stderr.includes('CONFLICT')
                )) {
                    reject(new Error(`CONFLICT_ERROR: ${stderr}`));
                    return;
                }
                if (error) {
                    reject(new Error(stderr || error.message));
                    return;
                }
                resolve(stdout.trim());
            });
        });

        // LOG ONLY IMPORTANT COMMANDS
        if (cmd.includes('reset') || cmd.includes('cherry-pick')) {
            await logToFile({
                timestamp: new Date().toLocaleString(),
                type: 'success',
                message: 'Command executed successfully',
                command: cmd,
                details: result || 'No output',
                duration: Date.now() - startTime
            });
        }

        return result;
    } catch (error: any) {
        // HANDLE CONFLICTS SPECIFICALLY
        if (error.message.startsWith('CONFLICT_ERROR:')) {
            const details = error.message.replace('CONFLICT_ERROR:', '').trim();
            await showNotification(
                'error',
                'Reset blocked: Conflicts detected',
                `The reset operation was blocked because it would cause conflicts.\n\nDetails:\n${details}\n\nPlease resolve conflicts manually before proceeding.`,
                true // ADD SHOW DETAILS BUTTON
            );
            throw new Error('Reset blocked due to conflicts');
        }

        // LOG ONLY IMPORTANT ERRORS
        if (cmd.includes('reset') || cmd.includes('cherry-pick')) {
            await logToFile({
                timestamp: new Date().toLocaleString(),
                type: 'error',
                message: 'Command failed',
                command: cmd,
                details: error.message,
                duration: Date.now() - startTime
            });
        }
        throw error;
    }
}; 
