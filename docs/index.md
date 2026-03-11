# Composer Sync Check

Composer Sync Check is a VS Code extension that detects potential Composer dependency drift and provides fast actions to resolve it.

## What it does

- Runs dependency sync checks on startup.
- Re-checks on Git branch changes.
- Re-checks when configured composer files change.
- Runs periodic checks in the background.
- Lets you run your configured Composer command from:
  - status bar action menu
  - warning notification quick action
  - command palette

## Status bar behavior

The extension keeps a status item in the bottom bar:

- `Composer sync OK`
- `Composer sync needed`
- `Composer sync running`

Clicking it opens:

- `Run composer install`
- `Check sync now`

## Support

- Report issues: <https://github.com/tupolev/vs-composer-sync-check/issues>
- **Support the developer** <a href="https://ko-fi.com/O5O51FHM"><img src="https://storage.ko-fi.com/cdn/kofi6.png?v=6" alt="Buy me a coffee at ko-fi.com" width="180" /></a>