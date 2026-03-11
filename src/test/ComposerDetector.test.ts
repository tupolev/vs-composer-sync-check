import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { ComposerDetector, type DetectorPaths } from '../composer/ComposerDetector';

const LOCK_FILE = 'composer.lock';
const AUTOLOAD_FILE = 'vendor/autoload.php';
const INSTALLED_JSON_FILE = 'vendor/composer/installed.json';

function createWorkspaceFolder(fsPath: string): vscode.WorkspaceFolder {
  return {
    uri: vscode.Uri.file(fsPath),
    name: path.basename(fsPath),
    index: 0,
  };
}

function createTempWorkspace(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'composer-sync-check-'));
}

function writeFile(rootPath: string, relativePath: string, content: string): void {
  const targetPath = path.join(rootPath, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content);
}

function fixtureWorkspacePath(name: string): string {
  return path.resolve(__dirname, '../../src/test/testData/workspaces', name);
}

async function withComposerPathConfig(
  composerJsonPath: string,
  composerLockPath: string,
  run: () => Promise<void>,
): Promise<void> {
  const config = vscode.workspace.getConfiguration('composerSyncCheck');
  const inspectedJson = config.inspect<string>('composerJsonPath');
  const inspectedLock = config.inspect<string>('composerLockPath');

  await config.update('composerJsonPath', composerJsonPath, vscode.ConfigurationTarget.Global);
  await config.update('composerLockPath', composerLockPath, vscode.ConfigurationTarget.Global);

  try {
    await run();
  } finally {
    await config.update('composerJsonPath', inspectedJson?.globalValue, vscode.ConfigurationTarget.Global);
    await config.update('composerLockPath', inspectedLock?.globalValue, vscode.ConfigurationTarget.Global);
  }
}

function getDetectorPathsFromConfig(): DetectorPaths {
  const config = vscode.workspace.getConfiguration('composerSyncCheck');
  return {
    composerJsonRelativePath: config.get<string>('composerJsonPath', 'composer.json'),
    composerLockRelativePath: config.get<string>('composerLockPath', 'composer.lock'),
  };
}

suite('ComposerDetector', () => {
  test('reports in sync on first check when lock and vendor metadata are present', async () => {
    const workspacePath = createTempWorkspace();
    const workspaceFolder = createWorkspaceFolder(workspacePath);
    const detector = new ComposerDetector();

    writeFile(workspacePath, AUTOLOAD_FILE, '<?php return [];');
    writeFile(workspacePath, INSTALLED_JSON_FILE, '{"packages": []}');
    writeFile(workspacePath, LOCK_FILE, '{"packages": []}');

    const result = detector.checkWorkspace(workspaceFolder);
    assert.strictEqual(result.isOutOfSync, false);
    assert.strictEqual(result.reason, 'Composer dependencies look in sync.');
  });

  test('reports out-of-sync when lock file changes after an in-sync check', async () => {
    const workspacePath = createTempWorkspace();
    const workspaceFolder = createWorkspaceFolder(workspacePath);
    const detector = new ComposerDetector();

    writeFile(workspacePath, LOCK_FILE, '{"packages": []}');
    await new Promise((resolve) => setTimeout(resolve, 20));
    writeFile(workspacePath, AUTOLOAD_FILE, '<?php return [];');
    writeFile(workspacePath, INSTALLED_JSON_FILE, '{"packages": []}');

    const firstCheck = detector.checkWorkspace(workspaceFolder);
    assert.strictEqual(firstCheck.isOutOfSync, false);

    await new Promise((resolve) => setTimeout(resolve, 20));
    writeFile(workspacePath, LOCK_FILE, '{"packages": [{"name":"vendor/pkg"}]}');

    const secondCheck = detector.checkWorkspace(workspaceFolder);
    assert.strictEqual(secondCheck.isOutOfSync, true);
    assert.strictEqual(
      secondCheck.reason,
      'composer.lock changed after the last dependency installation.',
    );
  });

  test('clears remembered hash when lock file is removed', () => {
    const workspacePath = createTempWorkspace();
    const workspaceFolder = createWorkspaceFolder(workspacePath);
    const detector = new ComposerDetector();

    writeFile(workspacePath, LOCK_FILE, '{"packages": []}');
    writeFile(workspacePath, AUTOLOAD_FILE, '<?php return [];');
    writeFile(workspacePath, INSTALLED_JSON_FILE, '{"packages": []}');

    const firstCheck = detector.checkWorkspace(workspaceFolder);
    assert.strictEqual(firstCheck.isOutOfSync, false);

    fs.rmSync(path.join(workspacePath, LOCK_FILE));

    const secondCheck = detector.checkWorkspace(workspaceFolder);
    assert.strictEqual(secondCheck.isOutOfSync, false);
    assert.strictEqual(secondCheck.reason, 'No composer.lock found in this workspace.');
    assert.strictEqual(secondCheck.lockHash, '');
  });

  test('detects installed metadata drift when lock hash is unchanged', async () => {
    const workspacePath = createTempWorkspace();
    const workspaceFolder = createWorkspaceFolder(workspacePath);
    const detector = new ComposerDetector();

    writeFile(workspacePath, LOCK_FILE, '{"packages": []}');
    await new Promise((resolve) => setTimeout(resolve, 20));
    writeFile(workspacePath, AUTOLOAD_FILE, '<?php return [];');
    writeFile(workspacePath, INSTALLED_JSON_FILE, '{"packages": []}');

    const firstCheck = detector.checkWorkspace(workspaceFolder);
    assert.strictEqual(firstCheck.isOutOfSync, false);

    await new Promise((resolve) => setTimeout(resolve, 20));
    writeFile(workspacePath, INSTALLED_JSON_FILE, '{"packages":[{"name":"vendor/pkg"}]}');

    const secondCheck = detector.checkWorkspace(workspaceFolder);
    assert.strictEqual(secondCheck.isOutOfSync, true);
    assert.strictEqual(secondCheck.reason, 'Composer dependencies may be out of sync after switching branches.');
  });

  test('suppresses transient out-of-sync result immediately after install', async () => {
    const workspacePath = createTempWorkspace();
    const workspaceFolder = createWorkspaceFolder(workspacePath);
    const detector = new ComposerDetector();

    writeFile(workspacePath, LOCK_FILE, '{"packages": []}');
    await new Promise((resolve) => setTimeout(resolve, 20));
    writeFile(workspacePath, AUTOLOAD_FILE, '<?php return [];');
    writeFile(workspacePath, INSTALLED_JSON_FILE, '{"packages": []}');

    const firstCheck = detector.checkWorkspace(workspaceFolder);
    assert.strictEqual(firstCheck.isOutOfSync, false);

    await new Promise((resolve) => setTimeout(resolve, 20));
    writeFile(workspacePath, LOCK_FILE, '{"packages": [{"name":"vendor/pkg"}]}');

    detector.markInstall(workspaceFolder);
    const postInstallCheck = detector.checkWorkspace(workspaceFolder);
    assert.strictEqual(postInstallCheck.isOutOfSync, false);
    assert.strictEqual(postInstallCheck.reason, 'Composer install was just executed. Rechecking shortly.');
  });

  test('uses configured composer paths from settings and validates nested workspace files', async () => {
    const workspacePath = fixtureWorkspacePath('nested-composer');
    const workspaceFolder = createWorkspaceFolder(workspacePath);
    const detector = new ComposerDetector();

    await withComposerPathConfig('backend/composer.json', 'backend/composer.lock', async () => {
      const detectorPaths = getDetectorPathsFromConfig();
      const result = detector.checkWorkspace(workspaceFolder, detectorPaths);
      assert.strictEqual(result.isOutOfSync, false);
      assert.strictEqual(result.reason, 'Composer dependencies look in sync.');
    });
  });

  test('reports configured lock path as invalid when composer.json exists but lock is missing', async () => {
    const workspacePath = fixtureWorkspacePath('nested-composer');
    const workspaceFolder = createWorkspaceFolder(workspacePath);
    const detector = new ComposerDetector();

    await withComposerPathConfig('backend/composer.json', 'backend/missing.lock', async () => {
      const detectorPaths = getDetectorPathsFromConfig();
      const result = detector.checkWorkspace(workspaceFolder, detectorPaths);
      assert.strictEqual(result.isOutOfSync, false);
      assert.strictEqual(result.reason, 'backend/missing.lock was not found.');
    });
  });

  test('reports configured composer.json path as invalid when both configured files are missing', async () => {
    const workspacePath = fixtureWorkspacePath('nested-composer');
    const workspaceFolder = createWorkspaceFolder(workspacePath);
    const detector = new ComposerDetector();

    await withComposerPathConfig('missing/composer.json', 'missing/composer.lock', async () => {
      const detectorPaths = getDetectorPathsFromConfig();
      const result = detector.checkWorkspace(workspaceFolder, detectorPaths);
      assert.strictEqual(result.isOutOfSync, false);
      assert.strictEqual(result.reason, 'missing/composer.json was not found.');
    });
  });
});
