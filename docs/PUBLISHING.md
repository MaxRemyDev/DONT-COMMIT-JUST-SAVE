# Publishing - VS Code Extension

Quick guide to publish the **DONT COMMIT JUST SAVE** extension to VS Code Marketplace and Open VSX Registry.

## Setup

### 1. Create Publisher Account

1. Go to [VS Code Marketplace](https://marketplace.visualstudio.com/)
2. Sign in → "Publish extensions" → Create publisher
3. Note publisher ID (e.g., `MaxRemyDev`)

### 2. Generate PAT

1. Go to [Azure DevOps](https://dev.azure.com/)
2. "Personal Access Tokens" → "New Token"
3. Scope: "Marketplace (Publish)"
4. Copy the token

### 3. Generate Open VSX Token

1. Go to [Open VSX](https://open-vsx.org/)
2. Sign in with GitHub
3. Go to profile
4. Create a Namespaces
5. Create a Access Tokens
6. Copy the token

### 4. Add GitHub Secrets

1. Repository → Settings → Secrets → Actions
2. Create secrets:
   - `VSCE_PAT` = Azure DevOps token (for VS Code Marketplace)
   - `OVSX_PAT` = Open VSX token (for Open VSX Registry)

## Publish

1. Go to **Actions** tab in GitHub
2. Select **"Publish Extension"** workflow
3. Click **"Run workflow"**
4. Choose version:
   - **patch**: 1.1.2 → 1.1.3 (bug fixes)
   - **minor**: 1.1.2 → 1.2.0 (new features)
   - **major**: 1.1.2 → 2.0.0 (breaking changes)

The workflow will automatically publish to both:

- **VS Code Marketplace** (marketplace.visualstudio.com)
- **Open VSX Registry** (open-vsx.org)

## Manual Publishing

### VS Code Marketplace

```bash
npm install -g @vscode/vsce
vsce login <publisher-name>
vsce publish [patch|minor|major]
```

### Open VSX Registry

```bash
npm install -g ovsx
ovsx publish -p <open-vsx-token>
```

## Issues

- **Auth failed**: Check `VSCE_PAT` or `OVSX_PAT` secrets
- **Publisher mismatch**: Verify publisher in `package.json`
- **Version exists**: Choose different version type
- **Compile errors**: Run `npm run compile` locally first
- **Open VSX publish fails**: Check `OVSX_PAT` secret (workflow continues even if Open VSX publish fails)

## Links

- [VS Code Marketplace](https://marketplace.visualstudio.com/)
- [Open VSX Registry](https://open-vsx.org/)
- [Azure DevOps PAT](https://dev.azure.com/)
- [vsce Documentation](https://github.com/microsoft/vscode-vsce)
- [ovsx Documentation](https://github.com/open-vsx/publish-extensions)
