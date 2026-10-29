import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'up-to-date'
  | 'available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  date?: string;
  body?: string;
}

export interface UpdateProgress {
  downloadedBytes: number;
  totalBytes: number;
  percentage: number;
}

class UpdateService {
  private activeUpdate: Update | null = null;
  private listeners = new Set<(status: UpdateStatus, info?: UpdateInfo, progress?: UpdateProgress, error?: string) => void>();

  private status: UpdateStatus = 'idle';
  private updateInfo: UpdateInfo | null = null;
  private progress: UpdateProgress = { downloadedBytes: 0, totalBytes: 0, percentage: 0 };
  private errorMessage: string | null = null;

  public getStatus() {
    return this.status;
  }

  public getUpdateInfo() {
    return this.updateInfo;
  }

  public getProgress() {
    return this.progress;
  }

  public getErrorMessage() {
    return this.errorMessage;
  }

  public subscribe(listener: (status: UpdateStatus, info?: UpdateInfo, progress?: UpdateProgress, error?: string) => void) {
    this.listeners.add(listener);
    listener(this.status, this.updateInfo || undefined, this.progress, this.errorMessage || undefined);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.status, this.updateInfo || undefined, this.progress, this.errorMessage || undefined);
    }
  }

  /**
   * Check if a new version is available on GitHub Releases
   */
  public async checkForUpdates(silent: boolean = false): Promise<UpdateInfo | null> {
    this.status = 'checking';
    this.errorMessage = null;
    this.notify();

    try {
      const update = await check();
      if (update) {
        this.activeUpdate = update;
        this.updateInfo = {
          version: update.version,
          currentVersion: update.currentVersion,
          date: update.date,
          body: update.body,
        };
        this.status = 'available';
        this.notify();
        return this.updateInfo;
      } else {
        this.activeUpdate = null;
        this.updateInfo = null;
        this.status = 'up-to-date';
        this.notify();
        return null;
      }
    } catch (err: unknown) {
      this.activeUpdate = null;
      const message = err instanceof Error ? err.message : String(err);
      // If silent check fails (e.g. offline / DNS issue), treat gracefully
      if (silent) {
        this.status = 'idle';
      } else {
        this.status = 'error';
        this.errorMessage = `Failed to check for updates: ${message}`;
      }
      this.notify();
      return null;
    }
  }

  /**
   * Download and install the update, then prompt to restart
   */
  public async downloadAndInstall(): Promise<void> {
    if (!this.activeUpdate) {
      throw new Error('No active update available to download');
    }

    this.status = 'downloading';
    this.progress = { downloadedBytes: 0, totalBytes: 0, percentage: 0 };
    this.errorMessage = null;
    this.notify();

    let downloaded = 0;
    let contentLength = 0;

    try {
      await this.activeUpdate.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength ?? 0;
            this.progress = {
              downloadedBytes: 0,
              totalBytes: contentLength,
              percentage: 0,
            };
            this.notify();
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            this.progress = {
              downloadedBytes: downloaded,
              totalBytes: contentLength,
              percentage: contentLength > 0 ? Math.min(100, Math.round((downloaded / contentLength) * 100)) : 0,
            };
            this.notify();
            break;
          case 'Finished':
            this.progress = {
              downloadedBytes: contentLength,
              totalBytes: contentLength,
              percentage: 100,
            };
            this.status = 'downloaded';
            this.notify();
            break;
        }
      });

      this.status = 'downloaded';
      this.notify();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.status = 'error';
      this.errorMessage = `Failed to download update: ${message}`;
      this.notify();
      throw err;
    }
  }

  /**
   * Relaunches the app to apply the newly installed update
   */
  public async restartAndApply(): Promise<void> {
    await relaunch();
  }
}

export const updateService = new UpdateService();
