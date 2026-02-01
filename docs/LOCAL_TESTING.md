# Local Testing

## Quick run (F5)

```bash
npm install && npm run compile
code .
# F5 → new window; test in a git repo
```

- **Commands:** Palette → "Insert DONT COMMIT JUST SAVE"
- **UI:** Source Control bar (💾 + Soft Reset)

## Install as .vsix

```bash
npm install -g vsce
vsce package
code --install-extension dont-commit-just-save-*.vsix
```

## Watch + tests

```bash
npm run watch   # then F5
npm test        # vscode-test
```

## Debug

- **Logs:** Palette → "Developer: Show Logs" → Extension Host
- **Breakpoints:** in `.ts`; restart with F5

**Troubleshooting:** no `out/extension.js` → `npm run compile`; commands missing → ensure `.git`; run `npm run lint` and fix.
