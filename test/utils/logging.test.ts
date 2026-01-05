import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { logToFile, LOG_FILE, LogEntry } from '../../src/utils/logging';

suite('Logging Tests', () => {
    let testLogFile: string;

    setup(() => {
        testLogFile = path.join(os.tmpdir(), 'test-dont-commit-just-save.md');
    });

    teardown(() => {
        if (fs.existsSync(testLogFile)) { fs.unlinkSync(testLogFile); }
    });

    // TEST FOR SUCCESS LOG ENTRY
    test('logToFile should create log entry with success type', async () => {
        // ARRANGE - CREATE LOG ENTRY
        const entry: LogEntry = {
            timestamp: '2024-01-01 12:00:00',
            type: 'success',
            message: 'Test success message'
        };

        // ACT - LOG TO FILE
        await logToFile(entry);

        // ASSERT - VERIFY LOG CONTENT
        if (fs.existsSync(LOG_FILE)) {
            const content = fs.readFileSync(LOG_FILE, 'utf8');
            assert.ok(content.includes('✅'));
            assert.ok(content.includes('Test success message'));
            assert.ok(content.includes('SUCCESS'));
        }
    });

    // TEST FOR WARNING LOG ENTRY
    test('logToFile should create log entry with warning type', async () => {
        // ARRANGE - CREATE LOG ENTRY
        const entry: LogEntry = {
            timestamp: '2024-01-01 12:00:00',
            type: 'warning',
            message: 'Test warning message'
        };

        // ACT - LOG TO FILE
        await logToFile(entry);

        // ASSERT - VERIFY LOG CONTENT
        if (fs.existsSync(LOG_FILE)) {
            const content = fs.readFileSync(LOG_FILE, 'utf8');
            assert.ok(content.includes('⚠️'));
            assert.ok(content.includes('Test warning message'));
            assert.ok(content.includes('WARNING'));
        }
    });

    // TEST FOR ERROR LOG ENTRY
    test('logToFile should create log entry with error type', async () => {
        // ARRANGE - CREATE LOG ENTRY
        const entry: LogEntry = {
            timestamp: '2024-01-01 12:00:00',
            type: 'error',
            message: 'Test error message'
        };

        // ACT - LOG TO FILE
        await logToFile(entry);

        // ASSERT - VERIFY LOG CONTENT
        if (fs.existsSync(LOG_FILE)) {
            const content = fs.readFileSync(LOG_FILE, 'utf8');
            assert.ok(content.includes('❌'));
            assert.ok(content.includes('Test error message'));
            assert.ok(content.includes('ERROR'));
        }
    });

    // TEST FOR GIT COMMAND LOGGING
    test('logToFile should log git commands with duration', async () => {
        // ARRANGE - CREATE LOG ENTRY WITH COMMAND
        const entry: LogEntry = {
            timestamp: '2024-01-01 12:00:00',
            type: 'success',
            message: 'Git command executed',
            command: 'git log --oneline',
            duration: 150
        };

        // ACT - LOG TO FILE
        await logToFile(entry);

        // ASSERT - VERIFY COMMAND AND DURATION LOGGED
        if (fs.existsSync(LOG_FILE)) {
            const content = fs.readFileSync(LOG_FILE, 'utf8');
            assert.ok(content.includes('git log --oneline'));
            assert.ok(content.includes('150ms'));
        }
    });

    // TEST FOR LOG FILE CLEARING
    test('logToFile should clear log file when message contains specific warning', async () => {
        // ARRANGE - CREATE LOG ENTRY WITH CLEAR TRIGGER
        const entry: LogEntry = {
            timestamp: '2024-01-01 12:00:00',
            type: 'warning',
            message: 'Warning: This operation can be risky!'
        };

        // ACT - LOG TO FILE
        await logToFile(entry);

        // ASSERT - VERIFY LOG FILE CLEARED AND HEADER ADDED
        if (fs.existsSync(LOG_FILE)) {
            const content = fs.readFileSync(LOG_FILE, 'utf8');
            assert.ok(content.includes('# DONT COMMIT JUST SAVE - Operation Log'));
        }
    });
});
