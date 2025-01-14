import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// LOGGING UTILITIES
export const LOG_FILE = path.join(os.tmpdir(), 'dont-commit-just-save.md');

export interface LogEntry {
    timestamp: string;
    type: 'success' | 'warning' | 'error';
    message: string;
    details?: string;
    command?: string;
    duration?: number;
}

export const logToFile = async (entry: LogEntry) => {
    const icon = {
        success: '✅',
        warning: '⚠️',
        error: '❌'
    }[entry.type];

    // CREATE OR CLEAR LOG FILE AT START OF OPERATION
    if (entry.message.includes('Warning: This operation can be risky!')) {
        fs.writeFileSync(LOG_FILE, `# DONT COMMIT JUST SAVE - Operation Log\n\n`);
    }

    let logLine = ''; // INITIALIZE

    // LOG COMMANDS
    if (entry.command?.includes('git')) {
        logLine = `${icon} ${entry.timestamp} - ${entry.command} (${entry.duration}ms)\n`;
    } else {
        const status = entry.type.toUpperCase();
        logLine = `${icon} ${status} - ${entry.message} - ${entry.timestamp}\n`;
    }

    // APPEND LOG LINE TO FILE
    try {
        fs.appendFileSync(LOG_FILE, logLine);
    } catch (error) {
        console.error('Failed to write to log file:', error);
    }
}; 
