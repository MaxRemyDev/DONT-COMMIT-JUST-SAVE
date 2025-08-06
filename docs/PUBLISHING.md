# Publishing - VS Code Extension

Quick guide to publish the **DONT COMMIT JUST SAVE** extension to VS Code Marketplace.

## Setup

### 1. Create Publisher Account

1. Go to [VS Code Marketplace](https://marketplace.visualstudio.com/)
2. Sign in → "Publish extensions" → Create publisher
3. Note your publisher ID (e.g., `MaxRemyDev`)

### 2. Generate PAT

1. Go to [Azure DevOps](https://dev.azure.com/)
2. "Personal Access Tokens" → "New Token"
3. Scope: "Marketplace (Publish)"
4. Copy the token

### 3. Add GitHub Secret

1. Repository → Settings → Secrets → Actions
2. Create secret: `VSCE_PAT` = your token

## Publish

1. Go to **Actions** tab in GitHub
2. Select **"Publish Extension"** workflow
3. Click **"Run workflow"**
4. Choose version:
    - **patch**: 1.1.2 → 1.1.3 (bug fixes)
    - **minor**: 1.1.2 → 1.2.0 (new features)
    - **major**: 1.1.2 → 2.0.0 (breaking changes)

## Manual Publishing

```bash
npm install -g @vscode/vsce
vsce login <publisher-name>
vsce publish [patch|minor|major]
```

## Issues

-   **Auth failed**: Check `VSCE_PAT` secret
-   **Publisher mismatch**: Verify publisher in `package.json`
-   **Version exists**: Choose different version type
-   **Compile errors**: Run `npm run compile` locally first

## Links

-   [VS Code Marketplace](https://marketplace.visualstudio.com/)
-   [Azure DevOps PAT](https://dev.azure.com/)
-   [vsce Documentation](https://github.com/microsoft/vscode-vsce)
