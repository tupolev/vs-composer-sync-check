# Usage

This page describes how to use the extension during normal development.

## Typical Flow

1. Open your project in VS Code.
2. Check the status bar:
   - `Composer sync OK`
   - `Composer sync needed`
   - `Composer sync running`
3. If needed, click the status bar item and select **Run composer install**.

## Commands

From Command Palette:

- `Composer Sync Check: Run Composer Install`
- `Composer Sync Check: Force Dependency Check`
- `Composer Sync Check: Show Output`
- `Composer Sync Check: Test Notification Balloon`

## Notifications

When the extension detects potential drift, it can show a warning with:

- `Run composer install`
- `Ignore`

You can disable these notifications from settings.

## Output Logs

Use **Composer Sync Check: Show Output** to inspect logs for:

- checks and reasons
- command stdout/stderr
- command exit code
