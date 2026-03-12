# Composer Sync Check

[![CI](https://github.com/tupolev/vs-composer-sync-check/actions/workflows/ci.yml/badge.svg)](https://github.com/tupolev/vs-composer-sync-check/actions/workflows/ci.yml)

This repository contains the source code for the VS Code extension **Composer Sync Check**.

## Stack

- TypeScript
- VS Code Extension API
- esbuild
- ESLint

## Project Layout

- `src/extension.ts`
  Entry point and orchestration (commands, status bar, checks, notifications).
- `src/composer/ComposerDetector.ts`
  Sync detection heuristics.
- `src/composer/ComposerRunner.ts`
  Executes configured Composer command.
- `src/git/GitWatcher.ts`
  Git branch change watcher.
- `src/scheduler/Scheduler.ts`
  Periodic scheduler.
- `src/output/Output.ts`
  Output channel wrapper.
- `src/test/`
  Extension and detector tests.
- `docs/`
  End-user documentation (installation/configuration/usage).

## Local Development

Install dependencies:

```bash
npm install
```

Build:

```bash
npm run compile
```

Run Extension Development Host:

1. Open this repo in VS Code.
2. Press `F5`.

## Quality Checks

```bash
npm run check-types
npm run lint
npm run compile
```

## Packaging

```bash
npm run package
npx @vscode/vsce package
```

## Current Behavior Notes

- Multi-root workspaces are supported.
- Composer file paths are configurable per workspace folder via:
  - `composerSyncCheck.composerJsonPath`
  - `composerSyncCheck.composerLockPath`
- Status bar uses text states:
  - `Composer sync OK`
  - `Composer sync needed`
  - `Composer sync running`
- Status bar click opens actions:
  - Run composer install
  - Check sync now


## Support

- Report issues: <https://github.com/tupolev/vs-composer-sync-check/issues>
- **Support the developer** <a href="https://ko-fi.com/O5O51FHM"><img src="https://storage.ko-fi.com/cdn/kofi6.png?v=6" alt="Buy me a coffee at ko-fi.com" width="180" /></a>