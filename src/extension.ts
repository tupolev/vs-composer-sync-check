import * as vscode from 'vscode';
import { ComposerDetector, type DetectorPaths, type SyncState } from './composer/ComposerDetector';
import { ComposerRunner } from './composer/ComposerRunner';
import { GitWatcher } from './git/GitWatcher';
import { Output } from './output/Output';
import { Scheduler } from './scheduler/Scheduler';

const SECTION = 'composerSyncCheck';
const RUN_COMPOSER_COMMAND = 'composerSyncCheck.runComposerInstall';
const SHOW_OUTPUT_COMMAND = 'composerSyncCheck.showOutput';
const FORCE_CHECK_COMMAND = 'composerSyncCheck.forceCheck';
const TEST_NOTIFICATION_COMMAND = 'composerSyncCheck.testNotification';
const STATUS_MENU_COMMAND = 'composerSyncCheck.statusMenu';

interface ExtensionConfig {
  command: string;
  checkIntervalMinutes: number;
  checkOnGitBranchChange: boolean;
  checkOnComposerFilesChange: boolean;
  composerJsonPath: string;
  composerLockPath: string;
  showNotifications: boolean;
  debugMode: boolean;
}

export function activate(context: vscode.ExtensionContext): void {
  const output = new Output();
  const detector = new ComposerDetector();
  const scheduler = new Scheduler();
  const runner = new ComposerRunner(output);
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

  let isOutOfSync = false;
  let ignoreUntilNextChange = false;
  let lastNotificationSignature = '';
  let hasCompletedInitialCheck = false;
  let activeChecks = 0;
  let activeInstalls = 0;
  const debounceHandleByFolder = new Map<string, NodeJS.Timeout>();
  const folderStateByPath = new Map<string, SyncState>();
  let dynamicDisposables: vscode.Disposable[] = [];

  const getWorkspaceFolders = (): vscode.WorkspaceFolder[] => {
    return [...(vscode.workspace.workspaceFolders ?? [])];
  };

  const getOutOfSyncFolders = (): vscode.WorkspaceFolder[] => {
    return getWorkspaceFolders().filter((folder) => folderStateByPath.get(folder.uri.fsPath)?.isOutOfSync === true);
  };

  const updateStatusBar = (): void => {
    const outOfSyncFolders = getOutOfSyncFolders();
    const isBusy = activeChecks > 0 || activeInstalls > 0;
    const hasWorkspace = getWorkspaceFolders().length > 0;

    statusBar.command = STATUS_MENU_COMMAND;

    if (!hasWorkspace) {
      statusBar.text = 'Composer sync running';
      statusBar.tooltip = 'No workspace folder is open. Click for actions.';
      statusBar.show();
      return;
    }

    if (!hasCompletedInitialCheck) {
      statusBar.text = 'Composer sync running';
      statusBar.tooltip = 'Checking composer status';
      statusBar.show();
      return;
    }

    if (activeInstalls > 0) {
      statusBar.text = 'Composer sync running';
      statusBar.tooltip = 'Composer is running';
      statusBar.show();
      return;
    }

    if (activeChecks > 0 || isBusy) {
      statusBar.text = 'Composer sync running';
      statusBar.tooltip = 'Checking composer status';
      statusBar.show();
      return;
    }

    if (outOfSyncFolders.length > 0) {
      const primaryFolder = outOfSyncFolders[0];
      const primaryState = folderStateByPath.get(primaryFolder.uri.fsPath);
      statusBar.text = 'Composer sync needed';
      statusBar.tooltip = primaryState?.reason
        ? `${primaryFolder.name}: ${primaryState.reason}. Click for actions.`
        : 'Composer dependencies may be out of sync. Click for actions.';
      statusBar.show();
      return;
    }

    statusBar.text = 'Composer sync OK';
    statusBar.tooltip = 'Composer dependencies are in sync. Click for actions.';
    statusBar.show();
  };

  const getConfig = (): ExtensionConfig => {
    const config = vscode.workspace.getConfiguration(SECTION);

    return {
      command: config.get<string>('command', 'composer install'),
      checkIntervalMinutes: config.get<number>('checkIntervalMinutes', 5),
      checkOnGitBranchChange: config.get<boolean>('checkOnGitBranchChange', true),
      checkOnComposerFilesChange: config.get<boolean>('checkOnComposerFilesChange', true),
      composerJsonPath: config.get<string>('composerJsonPath', 'composer.json'),
      composerLockPath: config.get<string>('composerLockPath', 'composer.lock'),
      showNotifications: config.get<boolean>('showNotifications', true),
      debugMode: config.get<boolean>('debugMode', false),
    };
  };

  const getFolderConfig = (workspaceFolder: vscode.WorkspaceFolder): ExtensionConfig => {
    const config = vscode.workspace.getConfiguration(SECTION, workspaceFolder.uri);

    return {
      command: config.get<string>('command', 'composer install'),
      checkIntervalMinutes: config.get<number>('checkIntervalMinutes', 5),
      checkOnGitBranchChange: config.get<boolean>('checkOnGitBranchChange', true),
      checkOnComposerFilesChange: config.get<boolean>('checkOnComposerFilesChange', true),
      composerJsonPath: config.get<string>('composerJsonPath', 'composer.json'),
      composerLockPath: config.get<string>('composerLockPath', 'composer.lock'),
      showNotifications: config.get<boolean>('showNotifications', true),
      debugMode: config.get<boolean>('debugMode', false),
    };
  };

  const normalizeRelativePath = (value: string, fallback: string): string => {
    const normalized = value.trim().replace(/\\/g, '/').replace(/^\.?\//, '');
    return normalized === '' ? fallback : normalized;
  };

  const getDetectorPaths = (workspaceFolder: vscode.WorkspaceFolder): DetectorPaths => {
    const config = getFolderConfig(workspaceFolder);
    return {
      composerJsonRelativePath: normalizeRelativePath(config.composerJsonPath, 'composer.json'),
      composerLockRelativePath: normalizeRelativePath(config.composerLockPath, 'composer.lock'),
    };
  };

  const showSyncNeededNotification = async (
    notificationMessage: string,
    workspaceFolder?: vscode.WorkspaceFolder,
  ): Promise<void> => {
    const runNowLabel = 'Run composer install';
    const ignoreLabel = 'Ignore';
    const selection = await vscode.window.showWarningMessage(
      notificationMessage,
      runNowLabel,
      ignoreLabel,
    );

    if (selection === runNowLabel) {
      await runComposerInstall(workspaceFolder);
      return;
    }

    if (selection === ignoreLabel) {
      ignoreUntilNextChange = true;
    }
  };

  const runCheck = async (reason: string, workspaceFolder?: vscode.WorkspaceFolder): Promise<void> => {
    activeChecks += 1;
    updateStatusBar();
    const foldersToCheck = workspaceFolder ? [workspaceFolder] : getWorkspaceFolders();
    let notificationMessage: string | undefined;
    let notificationFolder: vscode.WorkspaceFolder | undefined;

    try {
      if (foldersToCheck.length === 0) {
        isOutOfSync = false;
        folderStateByPath.clear();
        updateStatusBar();
        return;
      }

      const config = getConfig();

      if (config.debugMode) {
        output.appendLine(`[debug] Check reason: ${reason}`);
      }

      for (const folder of foldersToCheck) {
        const result = detector.checkWorkspace(folder, getDetectorPaths(folder));
        folderStateByPath.set(folder.uri.fsPath, result);

        if (config.debugMode) {
          output.appendLine(`[debug] [${folder.name}] ${result.reason}`);
        }
      }

      if (!workspaceFolder) {
        const activeFolderPaths = new Set(getWorkspaceFolders().map((folder) => folder.uri.fsPath));
        for (const knownFolderPath of folderStateByPath.keys()) {
          if (!activeFolderPaths.has(knownFolderPath)) {
            folderStateByPath.delete(knownFolderPath);
          }
        }
      }

      const wasOutOfSync = isOutOfSync;
      const outOfSyncFolders = getOutOfSyncFolders();
      isOutOfSync = outOfSyncFolders.length > 0;

      if (!wasOutOfSync && isOutOfSync) {
        ignoreUntilNextChange = false;
      }

      updateStatusBar();

      if (!isOutOfSync) {
        lastNotificationSignature = '';
        return;
      }

      if (!config.showNotifications || ignoreUntilNextChange) {
        return;
      }

      const signature = outOfSyncFolders
        .map((folder) => {
          const state = folderStateByPath.get(folder.uri.fsPath);
          return `${folder.uri.fsPath}:${state?.lockHash ?? ''}:${state?.reason ?? ''}`;
        })
        .sort()
        .join('|');

      if (signature === lastNotificationSignature) {
        return;
      }

      lastNotificationSignature = signature;

      const primaryFolder = outOfSyncFolders[0];
      const primaryState = folderStateByPath.get(primaryFolder.uri.fsPath);
      notificationMessage = `${primaryFolder.name}: ${primaryState?.reason ?? 'Composer dependencies may be out of sync.'}`;
      notificationFolder = primaryFolder;
    } finally {
      if (!hasCompletedInitialCheck && reason === 'startup') {
        hasCompletedInitialCheck = true;
      }
      activeChecks = Math.max(0, activeChecks - 1);
      updateStatusBar();
    }

    if (notificationMessage) {
      await showSyncNeededNotification(notificationMessage, notificationFolder);
    }
  };

  const triggerTestNotification = async (): Promise<void> => {
    const outOfSyncFolders = getOutOfSyncFolders();
    if (outOfSyncFolders.length > 0) {
      const primaryFolder = outOfSyncFolders[0];
      const primaryState = folderStateByPath.get(primaryFolder.uri.fsPath);
      await showSyncNeededNotification(
        `${primaryFolder.name}: ${primaryState?.reason ?? 'Composer dependencies may be out of sync.'}`,
        primaryFolder,
      );
      return;
    }

    await showSyncNeededNotification('Composer dependencies may be out of sync.');
  };

  const runComposerInstall = async (workspaceFolder?: vscode.WorkspaceFolder): Promise<void> => {
    if (activeInstalls > 0) {
      void vscode.window.showInformationMessage('A Composer command is already running.');
      return;
    }

    let targetFolder = workspaceFolder;

    if (!targetFolder) {
      const folders = getWorkspaceFolders();
      if (folders.length === 0) {
        void vscode.window.showWarningMessage('Open a workspace folder to run Composer commands.');
        return;
      }

      if (folders.length === 1) {
        [targetFolder] = folders;
      } else {
        const candidateFolders = getOutOfSyncFolders();
        const choices = (candidateFolders.length > 0 ? candidateFolders : folders).map((folder) => ({
          label: folder.name,
          description: folder.uri.fsPath,
          folder,
        }));

        const selected = await vscode.window.showQuickPick(choices, {
          placeHolder: 'Select workspace folder to run composer install',
        });

        if (!selected) {
          return;
        }

        targetFolder = selected.folder;
      }
    }

    if (!targetFolder) {
      return;
    }

    activeInstalls += 1;
    updateStatusBar();
    try {
      const config = getFolderConfig(targetFolder);
      output.show(true);
      const exitCode = await runner.run(config.command, targetFolder);

      if (exitCode === 0) {
        detector.markInstall(targetFolder, getDetectorPaths(targetFolder));
        void vscode.window.showInformationMessage(`Composer command completed successfully in ${targetFolder.name}.`);
        await runCheck('post-command-check', targetFolder);
        return;
      }

      void vscode.window.showErrorMessage(`Composer command failed with exit code ${exitCode} in ${targetFolder.name}.`);
    } finally {
      activeInstalls = Math.max(0, activeInstalls - 1);
      updateStatusBar();
    }
  };

  const scheduleCheck = (): void => {
    const config = getConfig();
    scheduler.start(config.checkIntervalMinutes, () => {
      void runCheck('scheduled-check');
    });
  };

  const scheduleDebouncedCheck = (reason: string, workspaceFolder?: vscode.WorkspaceFolder): void => {
    const folderKey = workspaceFolder?.uri.fsPath ?? '__all__';
    const existingHandle = debounceHandleByFolder.get(folderKey);
    if (existingHandle) {
      clearTimeout(existingHandle);
    }

    const newHandle = setTimeout(() => {
      debounceHandleByFolder.delete(folderKey);
      void runCheck(reason, workspaceFolder);
    }, 500);

    debounceHandleByFolder.set(folderKey, newHandle);
  };

  const disposeDynamicDisposables = (): void => {
    for (const disposable of dynamicDisposables) {
      disposable.dispose();
    }
    dynamicDisposables = [];
  };

  const setupWorkspaceIntegrations = (): void => {
    disposeDynamicDisposables();

    const folders = getWorkspaceFolders();
    if (folders.length === 0) {
      output.appendLine('No workspace folder found. Extension will stay idle.');
      scheduleCheck();
      void runCheck('workspace-empty');
      return;
    }

    const config = getConfig();

    if (config.checkOnGitBranchChange) {
      for (const folder of folders) {
        const gitWatcher = new GitWatcher(folder, output);
        dynamicDisposables.push(gitWatcher);

        void gitWatcher.start((newRef, oldRef) => {
          output.appendLine(`[${folder.name}] Branch change detected: ${oldRef ?? 'unknown'} -> ${newRef}`);
          ignoreUntilNextChange = false;
          scheduleDebouncedCheck('git-branch-change', folder);
        });
      }
    }

    if (config.checkOnComposerFilesChange) {
      for (const folder of folders) {
        const folderConfig = getFolderConfig(folder);
        if (!folderConfig.checkOnComposerFilesChange) {
          continue;
        }

        const detectorPaths = getDetectorPaths(folder);
        const jsonPattern = new vscode.RelativePattern(folder, detectorPaths.composerJsonRelativePath);
        const lockPattern = new vscode.RelativePattern(folder, detectorPaths.composerLockRelativePath);
        const jsonWatcher = vscode.workspace.createFileSystemWatcher(jsonPattern);
        const lockWatcher = vscode.workspace.createFileSystemWatcher(lockPattern);

        const onFileEvent = (file: vscode.Uri): void => {
          output.appendLine(`[${folder.name}] Composer file change detected: ${file.fsPath}`);
          ignoreUntilNextChange = false;
          scheduleDebouncedCheck('composer-files-change', folder);
        };

        jsonWatcher.onDidChange(onFileEvent);
        jsonWatcher.onDidCreate(onFileEvent);
        jsonWatcher.onDidDelete(onFileEvent);
        lockWatcher.onDidChange(onFileEvent);
        lockWatcher.onDidCreate(onFileEvent);
        lockWatcher.onDidDelete(onFileEvent);

        dynamicDisposables.push(jsonWatcher, lockWatcher);
      }
    }

    scheduleCheck();
    void runCheck('startup');
  };

  setupWorkspaceIntegrations();
  updateStatusBar();

  const runCommandDisposable = vscode.commands.registerCommand(RUN_COMPOSER_COMMAND, async () => {
    await runComposerInstall();
  });

  const showOutputDisposable = vscode.commands.registerCommand(SHOW_OUTPUT_COMMAND, () => {
    output.show();
  });

  const forceCheckDisposable = vscode.commands.registerCommand(FORCE_CHECK_COMMAND, async () => {
    ignoreUntilNextChange = false;
    await runCheck('manual-force-check');
  });

  const statusMenuDisposable = vscode.commands.registerCommand(STATUS_MENU_COMMAND, async () => {
    const selection = await vscode.window.showQuickPick(
      [
        { label: 'Run composer install', description: 'Run composer install command now' },
        { label: 'Check sync now', description: 'Trigger dependency sync check' },
      ],
      { placeHolder: 'Composer actions' },
    );

    if (!selection) {
      return;
    }

    if (selection.label === 'Run composer install') {
      await runComposerInstall();
      return;
    }

    ignoreUntilNextChange = false;
    await runCheck('status-menu-check');
  });

  const testNotificationDisposable = vscode.commands.registerCommand(TEST_NOTIFICATION_COMMAND, async () => {
    await triggerTestNotification();
  });

  const configChangeDisposable = vscode.workspace.onDidChangeConfiguration((event) => {
    if (!event.affectsConfiguration(SECTION)) {
      return;
    }

    setupWorkspaceIntegrations();
    void runCheck('config-changed');
  });

  const workspaceFoldersChangeDisposable = vscode.workspace.onDidChangeWorkspaceFolders(() => {
    setupWorkspaceIntegrations();
    void runCheck('workspace-folders-changed');
  });

  context.subscriptions.push({
    dispose: () => {
      for (const handle of debounceHandleByFolder.values()) {
        clearTimeout(handle);
      }
      debounceHandleByFolder.clear();
      disposeDynamicDisposables();
    },
  });

  context.subscriptions.push(
    output,
    scheduler,
    statusBar,
    runCommandDisposable,
    showOutputDisposable,
    forceCheckDisposable,
    statusMenuDisposable,
    testNotificationDisposable,
    configChangeDisposable,
    workspaceFoldersChangeDisposable,
  );
}

export function deactivate(): void {
  // No-op; resources are disposed via context subscriptions.
}
