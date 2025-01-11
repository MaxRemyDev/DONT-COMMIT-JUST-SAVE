# DONT COMMIT JUST SAVE

A VSCode extension that blocks git pushes containing commits with 'DONT COMMIT JUST SAVE' message.

<img width="750" alt="Screenshot 2024-12-24 at 01 00 26" src="https://github.com/user-attachments/assets/f32c2784-2ed9-4726-8f21-7b64dbef8086" />

## Features

- Automatically blocks pushes containing commits with 'DONT COMMIT JUST SAVE' message
- Shows a clear modal dialog in VS Code when a push is blocked
- Works with all git commands (VS Code UI, terminal, external git clients)
- Quick insert button in Source Control view to add "DONT COMMIT JUST SAVE" message
- Reset button to safely remove DONT COMMIT JUST SAVE commits while preserving other commits
- No configuration needed

## Usage

1. Install the extension
2. The extension will automatically activate for any git repository
3. Use the save button (💾) in the Source Control title bar to quickly insert "DONT COMMIT JUST SAVE"
4. If you try to push a commit containing 'DONT COMMIT JUST SAVE' in its message, the push will be blocked
5. You'll see a modal dialog in VS Code explaining why the push was blocked
6. Use the history button (🕒) to reset DONT COMMIT JUST SAVE commits while keeping other commits intact

## Requirements

- VS Code 1.85.0 or higher
- Git installed on your system

## Extension Settings

This extension doesn't require any settings.

## Known Issues

None at the moment.

## License

MIT
