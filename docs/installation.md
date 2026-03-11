# Installation

## From Marketplace (TBD)

1. Open **Extensions** in VS Code.
2. Search for **Composer Sync Check**.
3. Click **Install**.

## From VSIX

1. Build package files:

```bash
npm run package
npx @vscode/vsce package
```

2. In VS Code, run **Extensions: Install from VSIX...**.
3. Select the generated `.vsix` file.

## Verify Installation

After opening a workspace containing `composer.json`:

- The extension activates automatically.
- A status bar item appears with Composer sync state.
