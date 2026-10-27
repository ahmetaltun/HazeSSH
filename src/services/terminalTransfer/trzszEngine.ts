import { api } from "@/services/api";
import { useTransferStore } from "@/stores/useTransferStore";

export class TrzszEngine {
  private paneId: string;
  private sendBytes: (bytes: Uint8Array | number[]) => Promise<void>;
  private isBusy = false;
  private state: "idle" | "downloading" | "uploading" = "idle";
  private buffer: string = "";
  private currentFilePath: string | null = null;
  private currentFileName: string = "";
  private currentFileSize: number = 0;
  private transferredBytes: number = 0;

  constructor(paneId: string, sendBytes: (bytes: Uint8Array | number[]) => Promise<void>) {
    this.paneId = paneId;
    this.sendBytes = sendBytes;
  }

  public isTransferring(): boolean {
    return this.state !== "idle";
  }

  /**
   * Scans incoming bytes for Trzsz initiation headers:
   * ::TRZSZ:TRANSFER:r:... (server runs `trz` - upload to server)
   * ::TRZSZ:TRANSFER:s:... (server runs `tsz` - download to client)
   */
  public detectTrigger(chunk: Uint8Array): "upload" | "download" | null {
    if (this.state !== "idle") return null;
    const str = new TextDecoder().decode(chunk);

    if (str.includes("::TRZSZ:TRANSFER:r:")) {
      return "upload";
    }
    if (str.includes("::TRZSZ:TRANSFER:s:")) {
      return "download";
    }
    return null;
  }

  public async processChunk(chunk: Uint8Array): Promise<void> {
    const text = new TextDecoder().decode(chunk);
    this.buffer += text;

    if (this.isBusy) return;
    this.isBusy = true;

    try {
      if (this.state === "idle") {
        const trigger = this.detectTrigger(chunk);
        if (trigger === "upload") {
          await this.startUploadFlow();
        } else if (trigger === "download") {
          await this.startDownloadFlow();
        }
      } else if (this.state === "uploading") {
        await this.handleUploadFlow();
      } else if (this.state === "downloading") {
        await this.handleDownloadFlow();
      }
    } catch (err: unknown) {
      console.error(`[TRZSZ ${this.paneId}] Transfer error:`, err);
      const msg = err instanceof Error ? err.message : String(err);
      useTransferStore.getState().setStatus(this.paneId, "error", msg);
      await this.abort();
    } finally {
      this.isBusy = false;
    }
  }

  private async startUploadFlow(): Promise<void> {
    this.state = "uploading";
    this.buffer = "";

    useTransferStore.getState().setTransfer({
      paneId: this.paneId,
      protocol: "trzsz",
      direction: "upload",
      status: "prompting",
      fileName: "Selecting local file for trzsz...",
      fileSize: 0,
      transferredBytes: 0,
      progressPercent: 0,
      speedBytesPerSec: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });

    const pickedPath = await api.dialogPickTransferUpload();
    if (!pickedPath) {
      await this.abort();
      return;
    }

    const fileSize = await api.fsGetFileSize(pickedPath);
    const fileName = pickedPath.replace(/\\/g, "/").split("/").pop() || "upload.bin";

    this.currentFilePath = pickedPath;
    this.currentFileName = fileName;
    this.currentFileSize = fileSize;
    this.transferredBytes = 0;

    useTransferStore.getState().setTransfer({
      paneId: this.paneId,
      protocol: "trzsz",
      direction: "upload",
      status: "transferring",
      fileName,
      fileSize,
      transferredBytes: 0,
      progressPercent: 0,
      speedBytesPerSec: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
      localPath: pickedPath,
    });

    // Send JSON protocol response confirming version & buffer
    const confirmation = `::TRZSZ:TRANSFER:ACT:{"version":"1.1.0","buffer":10240}\n`;
    await this.sendBytes(new TextEncoder().encode(confirmation));

    // Stream file data in Base64 JSON chunks
    await this.streamUploadChunks();
  }

  private async streamUploadChunks(): Promise<void> {
    if (!this.currentFilePath) return;

    const CHUNK_SIZE = 8192;
    let offset = 0;

    while (offset < this.currentFileSize && this.state === "uploading") {
      const readLen = Math.min(CHUNK_SIZE, this.currentFileSize - offset);
      const chunkBytes = await api.fsReadBinaryChunk(this.currentFilePath, offset, readLen);
      if (!chunkBytes.length) break;

      // Base64 encode the binary payload
      const binaryString = String.fromCharCode(...chunkBytes);
      const base64Data = btoa(binaryString);

      const packet = `::TRZSZ:TRANSFER:DATA:${JSON.stringify({
        offset,
        data: base64Data,
        eof: offset + chunkBytes.length >= this.currentFileSize,
      })}\n`;

      await this.sendBytes(new TextEncoder().encode(packet));
      offset += chunkBytes.length;
      this.transferredBytes = offset;

      useTransferStore.getState().updateProgress(this.paneId, offset, this.currentFileSize);
    }

    if (this.state === "uploading") {
      const finish = `::TRZSZ:TRANSFER:EXIT:{"status":"ok"}\n`;
      await this.sendBytes(new TextEncoder().encode(finish));
      useTransferStore.getState().completeTransfer(this.paneId);
      this.reset();
    }
  }

  private async startDownloadFlow(): Promise<void> {
    this.state = "downloading";
    this.buffer = "";
    this.transferredBytes = 0;

    useTransferStore.getState().setTransfer({
      paneId: this.paneId,
      protocol: "trzsz",
      direction: "download",
      status: "prompting",
      fileName: "Waiting for server file metadata...",
      fileSize: 0,
      transferredBytes: 0,
      progressPercent: 0,
      speedBytesPerSec: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Confirm readiness
    const confirmation = `::TRZSZ:TRANSFER:ACT:{"version":"1.1.0"}\n`;
    await this.sendBytes(new TextEncoder().encode(confirmation));
  }

  private async handleDownloadFlow(): Promise<void> {
    // Process incoming line delimited envelopes
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.includes("::TRZSZ:TRANSFER:FILE:")) {
        const jsonStr = line.split("::TRZSZ:TRANSFER:FILE:")[1]?.trim();
        if (jsonStr) {
          try {
            const meta = JSON.parse(jsonStr) as { name: string; size: number };
            this.currentFileName = meta.name || "download.bin";
            this.currentFileSize = meta.size || 0;

            const savePath = await api.dialogSaveTransferDownload(this.currentFileName);
            if (!savePath) {
              await this.abort();
              return;
            }

            this.currentFilePath = savePath;
            await api.fsWriteBinaryChunk(savePath, [], false);

            useTransferStore.getState().setTransfer({
              paneId: this.paneId,
              protocol: "trzsz",
              direction: "download",
              status: "transferring",
              fileName: this.currentFileName,
              fileSize: this.currentFileSize,
              transferredBytes: 0,
              progressPercent: 0,
              speedBytesPerSec: 0,
              startedAt: Date.now(),
              updatedAt: Date.now(),
              localPath: savePath,
            });

            // Ack to start streaming
            await this.sendBytes(new TextEncoder().encode(`::TRZSZ:TRANSFER:READY\n`));
          } catch {
            // Ignore parse errors
          }
        }
      } else if (line.includes("::TRZSZ:TRANSFER:DATA:")) {
        const jsonStr = line.split("::TRZSZ:TRANSFER:DATA:")[1]?.trim();
        if (jsonStr && this.currentFilePath) {
          try {
            const payload = JSON.parse(jsonStr) as { data: string; eof?: boolean };
            const binaryStr = atob(payload.data);
            const bytes: number[] = [];
            for (let i = 0; i < binaryStr.length; i++) {
              bytes.push(binaryStr.charCodeAt(i));
            }

            await api.fsWriteBinaryChunk(this.currentFilePath, bytes, true);
            this.transferredBytes += bytes.length;

            useTransferStore.getState().updateProgress(
              this.paneId,
              this.transferredBytes,
              this.currentFileSize || this.transferredBytes
            );

            if (payload.eof) {
              await this.sendBytes(new TextEncoder().encode(`::TRZSZ:TRANSFER:ACK\n`));
              useTransferStore.getState().completeTransfer(this.paneId);
              this.reset();
              return;
            }
          } catch {
            // Ignore decode errors
          }
        }
      } else if (line.includes("::TRZSZ:TRANSFER:EXIT:") || line.includes("::TRZSZ:TRANSFER:CANCEL")) {
        useTransferStore.getState().completeTransfer(this.paneId);
        this.reset();
        return;
      }
    }
  }

  private async handleUploadFlow(): Promise<void> {
    if (this.buffer.includes("::TRZSZ:TRANSFER:CANCEL")) {
      await this.abort();
    }
  }

  public async abort(): Promise<void> {
    try {
      await this.sendBytes(new TextEncoder().encode(`::TRZSZ:TRANSFER:CANCEL\x03\n`));
    } catch {
      // Ignore write errors
    }
    useTransferStore.getState().cancelTransfer(this.paneId);
    this.reset();
  }

  public reset(): void {
    this.state = "idle";
    this.buffer = "";
    this.currentFilePath = null;
    this.currentFileName = "";
    this.currentFileSize = 0;
    this.transferredBytes = 0;
    this.isBusy = false;
  }
}
