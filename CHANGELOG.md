# Change Log

All notable changes to the "Composer Sync Check" extension will be documented in this file.

## [v0.2.0]

- Changes in documentation and package definitions

## [v0.1.0] - Initial Release

- Added Composer dependency sync detection using `composer.lock` and `vendor/composer/installed.json`.
- Added branch-change monitoring via VS Code Git API with `.git/HEAD` fallback.
- Added configurable relative paths for `composer.json` and `composer.lock`.
- Added status bar sync states with quick actions:
  - Run composer install
  - Check sync now
- Added warning notifications with quick actions.
- Added commands:
  - `Composer Sync Check: Run Composer Install`
  - `Composer Sync Check: Force Dependency Check`
  - `Composer Sync Check: Show Output`
  - `Composer Sync Check: Test Notification Balloon`
- Added output channel logging for checks and command execution.
- Added multi-root workspace support and periodic background checks.
- Added Marketplace metadata, icons, and user/developer documentation.
