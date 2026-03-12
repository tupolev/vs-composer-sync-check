# Installation

## From Marketplace

### From VSCode
1. Open **Extensions** in VS Code. 
2. Search for **Composer Sync Check**.
3. Click **Install**.

### From marketplace website
[visit the marketplace site](https://marketplace.visualstudio.com/items?itemName=kodesoft.composer-sync-check)

## From file

### Building the extension locally
1. Build package files:

```bash
npm run package
npx @vscode/vsce package
```

### Downloading package from repository
1. Download a [release package](https://github.com/tupolev/vs-composer-sync-check/releases)

### Install the package
2. In VS Code, run **Extensions: Install from VSIX...**.
3. Select the generated `.vsix` file.

## Verify Installation

After opening a workspace containing `composer.json`:

- The extension activates automatically.
- A status bar item appears with Composer sync state.
