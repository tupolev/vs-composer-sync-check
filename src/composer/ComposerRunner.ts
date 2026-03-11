import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { Output } from '../output/Output';

export class ComposerRunner {
  public constructor(private readonly output: Output) {}

  public run(command: string, workspaceFolder: vscode.WorkspaceFolder): Promise<number> {
    return new Promise((resolve) => {
      const cwd = workspaceFolder.uri.fsPath;
      const startedAt = new Date().toISOString();

      this.output.appendLine(`[${startedAt}] Running command: ${command}`);
      this.output.appendLine(`[${startedAt}] Working directory: ${cwd}`);

      const child = spawn(command, {
        cwd,
        shell: true,
      });

      child.stdout.on('data', (chunk: Buffer) => {
        this.output.appendLine(`[stdout] ${chunk.toString().trimEnd()}`);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        this.output.appendLine(`[stderr] ${chunk.toString().trimEnd()}`);
      });

      child.on('error', (error: Error) => {
        this.output.appendLine(`[error] ${error.message}`);
      });

      child.on('close', (code: number | null) => {
        const exitCode = code ?? -1;
        this.output.appendLine(`[exit] ${exitCode}`);

        resolve(exitCode);
      });
    });
  }

  public static getWorkspaceRoot(): vscode.WorkspaceFolder | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined;
    }

    return workspaceFolders[0];
  }

  public static resolveWorkspacePath(workspaceFolder: vscode.WorkspaceFolder, relativePath: string): string {
    return path.join(workspaceFolder.uri.fsPath, relativePath);
  }
}
