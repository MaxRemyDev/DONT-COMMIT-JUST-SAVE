# Publishing

## One-time setup

1. **Publisher** — [Marketplace](https://marketplace.visualstudio.com/) → sign in → Publish extensions → create publisher (note ID).
2. **VSCE PAT** — [Azure DevOps](https://dev.azure.com/) → Personal Access Tokens → New → scope "Marketplace (Publish)".
3. **Open VSX** — [open-vsx.org](https://open-vsx.org/) → sign in (GitHub) → profile → Namespace + Access Token.
4. **Secrets** — Repo → Settings → Secrets → Actions: `VSCE_PAT`, `OVSX_PAT`.

## Publish (recommended)

Actions → **Publish Extension** → Run workflow → pick version:

| Choice | Example |
|--------|--------|
| patch | 1.1.2 → 1.1.3 |
| minor | 1.1.2 → 1.2.0 |
| major | 1.1.2 → 2.0.0 |

Publishes to Marketplace + Open VSX.

## Manual

```bash
# Marketplace
npm i -g @vscode/vsce
vsce login <publisher>
vsce publish [patch|minor|major]

# Open VSX
npm i -g ovsx
ovsx publish -p <OVSX_PAT>
```

**Issues:** Auth → check secrets; version exists → other bump; Open VSX fails → workflow still completes Marketplace step.
