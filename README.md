# DONT COMMIT JUST SAVE

A VS Code extension that blocks git pushes containing commits with 'DONT COMMIT JUST SAVE' message.

## Features

- Automatically blocks pushes containing commits with 'DONT COMMIT JUST SAVE' message
- Shows a clear modal dialog in VS Code when a push is blocked
- Works with all git commands (VS Code UI, terminal, external git clients)
- No configuration needed

## Usage

1. Install the extension
2. The extension will automatically activate for any git repository
3. If you try to push a commit containing 'DONT COMMIT JUST SAVE' in its message, the push will be blocked
4. You'll see a modal dialog in VS Code explaining why the push was blocked

## Requirements

- VS Code 1.85.0 or higher
- Git installed on your system

## Extension Settings

This extension doesn't require any settings.

## Known Issues

None at the moment.

## Release Notes

### 1.0.2
- updated: minimum vscode version to 1.85.0 for better compatibility

### 1.0.1
- added: image to the extension

### 1.0.0
- added: initial project vscode extension

## License

MIT
