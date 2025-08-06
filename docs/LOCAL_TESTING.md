# Local Testing - VS Code Extension

Quick guide to test the **DONT COMMIT JUST SAVE** extension locally.

## Quick Test (F5)

```bash
npm install
npm run compile
code .  # Open in VS Code
# Then press F5
```

A new VS Code window opens. Test in a Git project:

-   **Command Palette** : "Insert DONT COMMIT JUST SAVE"
-   **SCM Bar** : Buttons in Source Control

## Local Installation

```bash
npm install -g vsce
vsce package
code --install-extension dont-commit-just-save-x.x.x.vsix
```

## Watch Mode

```bash
npm run watch  # Auto recompilation
# Then F5 for debug
```

## Debug

-   **Logs** : Palette → "Developer: Show Logs" → "Extension Host"
-   **Breakpoints** : In TypeScript code
-   **Restart** : F5 after modification

## Issues

-   **Extension not loading** : Check `out/extension.js`
-   **Missing commands** : Check `.git` folder
-   **Errors** : `npm run lint` + `npm run compile`
