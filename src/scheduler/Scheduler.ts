import * as vscode from 'vscode';

export class Scheduler implements vscode.Disposable {
  private timer: NodeJS.Timeout | undefined;

  public start(intervalMinutes: number, job: () => void): void {
    this.stop();

    if (intervalMinutes <= 0) {
      return;
    }

    this.timer = setInterval(job, intervalMinutes * 60 * 1000);
  }

  public stop(): void {
    if (!this.timer) {
      return;
    }

    clearInterval(this.timer);
    this.timer = undefined;
  }

  public dispose(): void {
    this.stop();
  }
}
