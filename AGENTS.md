# AGENTS Guide

This file documents how agents should work in this repository.

## Product summary

`composer-sync-check` is a VS Code extension that detects potential Composer dependency drift and helps run a configured Composer command.

Current primary UX:

- Status bar text states:
  - `Composer sync OK`
  - `Composer sync needed`
  - `Composer sync running`
- Status bar click opens a quick-pick menu:
  - Run composer install
  - Check sync now
- Warning notification quick actions:
  - Run composer install
  - Ignore

There is no webview panel/tool window in the current implementation.

## Key files

- `src/extension.ts`
  Main orchestration: activation, commands, status bar states, notifications, watchers, periodic checks.
- `src/composer/ComposerDetector.ts`
  Sync detection logic with hash-based heuristics and install grace window.
- `src/composer/ComposerRunner.ts`
  Executes configured Composer command.
- `src/git/GitWatcher.ts`
  Branch-change detection via Git API + `.git/HEAD` fallback.
- `src/output/Output.ts`
  Output channel wrapper.
- `package.json`
  Extension manifest, commands, configuration schema.

## Configuration keys

- `composerSyncCheck.command`
- `composerSyncCheck.checkIntervalMinutes`
- `composerSyncCheck.checkOnGitBranchChange`
- `composerSyncCheck.checkOnComposerFilesChange`
- `composerSyncCheck.composerJsonPath`
- `composerSyncCheck.composerLockPath`
- `composerSyncCheck.showNotifications`
- `composerSyncCheck.debugMode`

## Editing rules for agents

- Keep behavior aligned with current UX (status bar + notifications + output channel).
- Do not add webview panel contributions unless explicitly requested.
- When changing sync heuristics, avoid startup-only logic that can cause one-time false positives.
- Preserve multi-root workspace support.
- Keep path settings relative to each workspace folder.

## Validation

Run after changes:

```bash
npm run check-types
npm run lint
npm run compile
```
