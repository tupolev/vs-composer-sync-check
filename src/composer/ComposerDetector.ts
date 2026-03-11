import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ComposerRunner } from './ComposerRunner';

export interface SyncState {
  isOutOfSync: boolean;
  reason: string;
  lockHash: string;
}

export interface DetectorPaths {
  composerJsonRelativePath: string;
  composerLockRelativePath: string;
}

export class ComposerDetector {
  private lastKnownLockHashByFolder = new Map<string, string>();
  private lastInstalledHashByFolder = new Map<string, string>();
  private lastInstallTimestampByFolder = new Map<string, number>();
  private initializedFolders = new Set<string>();
  private static readonly INSTALL_GRACE_WINDOW_MS = 2000;

  public markInstall(folder: vscode.WorkspaceFolder, detectorPaths?: Partial<DetectorPaths>): void {
    this.lastInstallTimestampByFolder.set(this.getFolderKey(folder, detectorPaths), Date.now());
  }

  public checkWorkspace(workspaceFolder: vscode.WorkspaceFolder, detectorPaths?: Partial<DetectorPaths>): SyncState {
    const composerJsonRelativePath = this.normalizeRelativePath(
      detectorPaths?.composerJsonRelativePath ?? 'composer.json',
      'composer.json',
    );
    const composerLockRelativePath = this.normalizeRelativePath(
      detectorPaths?.composerLockRelativePath ?? 'composer.lock',
      'composer.lock',
    );

    const lockPath = ComposerRunner.resolveWorkspacePath(workspaceFolder, composerLockRelativePath);
    const composerJsonPath = ComposerRunner.resolveWorkspacePath(workspaceFolder, composerJsonRelativePath);
    const composerRoot = path.dirname(lockPath);
    const vendorAutoloadPath = path.join(composerRoot, 'vendor/autoload.php');
    const installedJsonPath = path.join(composerRoot, 'vendor/composer/installed.json');
    const folderKey = this.getFolderKey(workspaceFolder, {
      composerJsonRelativePath,
      composerLockRelativePath,
    });

    if (!this.safeExists(lockPath)) {
      const composerJsonExists = this.safeExists(composerJsonPath);
      this.lastKnownLockHashByFolder.delete(folderKey);
      this.lastInstalledHashByFolder.delete(folderKey);
      this.lastInstallTimestampByFolder.delete(folderKey);
      this.initializedFolders.delete(folderKey);
      return {
        isOutOfSync: false,
        reason: composerJsonExists
          ? `${composerLockRelativePath} was not found.`
          : `${composerJsonRelativePath} was not found.`,
        lockHash: '',
      };
    }

    const lockContent = this.safeReadFile(lockPath);
    if (!lockContent) {
      return {
        isOutOfSync: false,
        reason: 'Failed reading composer.lock.',
        lockHash: '',
      };
    }

    const lockHash = crypto.createHash('sha1').update(lockContent).digest('hex');
    const previousLockHash = this.lastKnownLockHashByFolder.get(folderKey) ?? '';
    this.lastKnownLockHashByFolder.set(folderKey, lockHash);

    if (!this.safeExists(vendorAutoloadPath)) {
      return {
        isOutOfSync: true,
        reason: 'Vendor directory appears outdated.',
        lockHash,
      };
    }

    if (!this.safeExists(installedJsonPath)) {
      return {
        isOutOfSync: true,
        reason: 'Vendor directory appears outdated.',
        lockHash,
      };
    }

    const installedContent = this.safeReadFile(installedJsonPath);
    if (!installedContent) {
      return {
        isOutOfSync: true,
        reason: 'Composer dependencies may be out of sync after switching branches.',
        lockHash,
      };
    }
    const installedHash = crypto.createHash('sha1').update(installedContent).digest('hex');
    const previousInstalledHash = this.lastInstalledHashByFolder.get(folderKey) ?? '';
    this.lastInstalledHashByFolder.set(folderKey, installedHash);

    if (!this.initializedFolders.has(folderKey)) {
      this.initializedFolders.add(folderKey);
      return {
        isOutOfSync: false,
        reason: 'Composer dependencies look in sync.',
        lockHash,
      };
    }

    const lastInstallTimestamp = this.lastInstallTimestampByFolder.get(folderKey) ?? 0;
    if (Date.now() - lastInstallTimestamp < ComposerDetector.INSTALL_GRACE_WINDOW_MS) {
      return {
        isOutOfSync: false,
        reason: 'Composer install was just executed. Rechecking shortly.',
        lockHash,
      };
    }

    if (previousLockHash !== '' && previousLockHash !== lockHash) {
      return {
        isOutOfSync: true,
        reason: 'composer.lock changed after the last dependency installation.',
        lockHash,
      };
    }

    if (previousLockHash === lockHash && previousInstalledHash !== '' && previousInstalledHash !== installedHash) {
      return {
        isOutOfSync: true,
        reason: 'Composer dependencies may be out of sync after switching branches.',
        lockHash,
      };
    }

    return {
      isOutOfSync: false,
      reason: 'Composer dependencies look in sync.',
      lockHash,
    };
  }

  private safeExists(filePath: string): boolean {
    try {
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  private safeReadFile(filePath: string): Buffer | undefined {
    try {
      return fs.readFileSync(filePath);
    } catch {
      return undefined;
    }
  }

  private normalizeRelativePath(value: string, fallback: string): string {
    const normalized = value.trim().replace(/\\/g, '/').replace(/^\.?\//, '');
    return normalized === '' ? fallback : normalized;
  }

  private getFolderKey(workspaceFolder: vscode.WorkspaceFolder, detectorPaths?: Partial<DetectorPaths>): string {
    const composerLockRelativePath = this.normalizeRelativePath(
      detectorPaths?.composerLockRelativePath ?? 'composer.lock',
      'composer.lock',
    );

    return `${workspaceFolder.uri.fsPath}:${composerLockRelativePath}`;
  }
}
