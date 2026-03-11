import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type BranchChangeHandler = (newRef: string, previousRef: string | undefined) => void;

export class GitWatcher implements vscode.Disposable {
  private watchedHeadPath: string | undefined;
  private previousRef: string | undefined;
  private gitSubscription: vscode.Disposable | undefined;
  private debounceTimer: NodeJS.Timeout | undefined;

  public constructor(
    private readonly workspaceFolder: vscode.WorkspaceFolder,
    private readonly output: { appendLine(message: string): void },
  ) {}

  public async start(onBranchChange: BranchChangeHandler): Promise<void> {
    const gitApi = await this.getGitApi();

    if (gitApi) {
      this.output.appendLine('Using VS Code Git API for branch monitoring.');
      const repo = gitApi.repositories
        .filter((candidate) => this.workspaceFolder.uri.fsPath.startsWith(candidate.rootUri.fsPath))
        .sort((left, right) => right.rootUri.fsPath.length - left.rootUri.fsPath.length)[0];

      if (repo) {
        this.previousRef = this.parseHead(repo.state.HEAD?.name ?? repo.state.HEAD?.commit ?? '');
        this.gitSubscription = repo.state.onDidChange(() => {
          const currentRef = this.parseHead(repo.state.HEAD?.name ?? repo.state.HEAD?.commit ?? '');

          if (!currentRef || currentRef === this.previousRef) {
            return;
          }

          const previousRef = this.previousRef;
          this.previousRef = currentRef;
          this.output.appendLine(`Branch changed: ${previousRef ?? 'unknown'} -> ${currentRef}`);
          this.emitBranchChange(onBranchChange, currentRef, previousRef);
        });
        return;
      }
    }

    this.output.appendLine('Git API unavailable. Falling back to watching .git/HEAD.');
    const headPath = this.resolveHeadPath();

    if (!headPath) {
      this.output.appendLine('Unable to resolve git HEAD path for this workspace.');
      return;
    }

    const poll = (): void => {
      try {
        const raw = fs.readFileSync(headPath, 'utf8').trim();
        const value = this.parseHead(raw);

        if (!this.previousRef) {
          this.previousRef = value;
          return;
        }

        if (value !== this.previousRef) {
          const oldValue = this.previousRef;
          this.previousRef = value;
          this.output.appendLine(`Branch changed: ${oldValue} -> ${value}`);
          this.emitBranchChange(onBranchChange, value, oldValue);
        }
      } catch (error) {
        this.output.appendLine(`Failed reading .git/HEAD: ${(error as Error).message}`);
      }
    };

    poll();
    this.watchedHeadPath = headPath;
    fs.watchFile(headPath, { interval: 2000 }, poll);
  }

  public dispose(): void {
    this.gitSubscription?.dispose();
    this.gitSubscription = undefined;
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    if (this.watchedHeadPath) {
      fs.unwatchFile(this.watchedHeadPath);
      this.watchedHeadPath = undefined;
    }
  }

  private async getGitApi(): Promise<GitApi | undefined> {
    const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');

    if (!extension) {
      return undefined;
    }

    const gitExtension = extension.isActive ? extension.exports : await extension.activate();

    return gitExtension?.getAPI(1);
  }

  private resolveHeadPath(): string | undefined {
    const dotGitPath = path.join(this.workspaceFolder.uri.fsPath, '.git');

    try {
      const dotGitStats = fs.statSync(dotGitPath);
      if (dotGitStats.isDirectory()) {
        return path.join(dotGitPath, 'HEAD');
      }

      if (!dotGitStats.isFile()) {
        return undefined;
      }
    } catch {
      return undefined;
    }

    try {
      const pointer = fs.readFileSync(dotGitPath, 'utf8').trim();
      if (!pointer.startsWith('gitdir:')) {
        return undefined;
      }

      const gitDir = pointer.replace('gitdir:', '').trim();
      const resolvedGitDir = path.isAbsolute(gitDir)
        ? gitDir
        : path.resolve(this.workspaceFolder.uri.fsPath, gitDir);

      return path.join(resolvedGitDir, 'HEAD');
    } catch {
      return undefined;
    }
  }

  private parseHead(value: string): string {
    if (value.startsWith('ref:')) {
      return value.replace('ref:', '').trim();
    }

    return value;
  }

  private emitBranchChange(onBranchChange: BranchChangeHandler, currentRef: string, previousRef: string | undefined): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      onBranchChange(currentRef, previousRef);
    }, 500);
  }
}

interface GitExtension {
  getAPI(version: 1): GitApi;
}

interface GitApi {
  repositories: GitRepository[];
}

interface GitRepository {
  rootUri: vscode.Uri;
  state: GitState;
}

interface GitState {
  HEAD?: {
    name?: string;
    commit?: string;
  };
  onDidChange(listener: () => void): vscode.Disposable;
}
