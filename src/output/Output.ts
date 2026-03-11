import * as vscode from 'vscode';

export class Output {
  private readonly channel: vscode.OutputChannel;
  private readonly listeners = new Set<(line: string) => void>();

  public constructor() {
    this.channel = vscode.window.createOutputChannel('Composer Sync Check');
  }

  public appendLine(message: string): void {
    this.channel.appendLine(message);
    for (const listener of this.listeners) {
      listener(message);
    }
  }

  public onDidAppendLine(listener: (line: string) => void): vscode.Disposable {
    this.listeners.add(listener);
    return new vscode.Disposable(() => {
      this.listeners.delete(listener);
    });
  }

  public show(preserveFocus = false): void {
    this.channel.show(preserveFocus);
  }

  public dispose(): void {
    this.listeners.clear();
    this.channel.dispose();
  }
}
