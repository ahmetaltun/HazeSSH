import { calculateCrc16, updateCrc16 } from "@/services/terminalTransfer/crc";
import { api } from "@/services/api";
import { useTransferStore } from "@/stores/useTransferStore";

// ZMODEM Framing Constants
export const ZPAD = 0x2a; // '*'
export const ZDLE = 0x18; // Ctrl-X (24)
export const ZDLEE = 0x58; // Escaped ZDLE
export const ZBIN = 0x41; // 'A'
export const ZHEX = 0x42; // 'B'
export const ZBIN32 = 0x43; // 'C'

// ZMODEM Header Types
export const ZRQINIT = 0; // Request receive init (server wants to send file)
export const ZRINIT = 1; // Receiver ready (server waits for file)
export const ZSINIT = 2; // Sender init
export const ZACK = 3; // Acknowledge
export const ZFILE = 4; // File name & metadata
export const ZSKIP = 5; // Skip file
export const ZNAK = 6; // Negative ack
export const ZABORT = 7; // Abort
export const ZFIN = 8; // Finish session
export const ZRPOS = 9; // Resume file at pos
export const ZDATA = 10; // Data subpacket follows
export const ZEOF = 11; // End of file
export const ZFERR = 12; // Fatal error
export const ZCRC = 13; // Request CRC
export const ZCHALLENGE = 14;
export const ZCOMPL = 15;
export const ZCAN = 16; // Cancelled

// Subpacket framing types
export const ZCRCE = 0x68; // End of subpacket, wait for next header
export const ZCRCG = 0x69; // Data continues, no ack needed
export const ZCRCQ = 0x6a; // Data continues, please ack
export const ZCRCW = 0x6b; // Data subpacket, ack required

export const CAN_SEQUENCE = new Uint8Array([
  0x18, 0x18, 0x18, 0x18, 0x18, 0x08, 0x08, 0x08, 0x08, 0x08,
]);

export interface ZmodemParsedHeader {
  type: number;
  f0: number;
  f1: number;
  f2: number;
  f3: number;
  crcValid: boolean;
}

export class ZmodemEngine {
  private paneId: string;
  private sendBytes: (bytes: Uint8Array | number[]) => Promise<void>;
  private isBusy = false;
  private state: "idle" | "downloading" | "uploading" = "idle";
  private buffer: number[] = [];
  private currentFilePath: string | null = null;
  private currentFileName: string = "";
  private currentFileSize: number = 0;
  private receivedBytes: number = 0;
  private uploadOffset: number = 0;

  constructor(paneId: string, sendBytes: (bytes: Uint8Array | number[]) => Promise<void>) {
    this.paneId = paneId;
    this.sendBytes = sendBytes;
  }

  public isTransferring(): boolean {
    return this.state !== "idle";
  }

  /**
   * Scans incoming bytes for Zmodem initiation sequences if idle.
   * - ZRQINIT: server runs `sz` (download to client) -> starts with `**\x18B00` or `rz\r**\x18B00`
   * - ZRINIT: server runs `rz` (upload to server) -> starts with `**\x18B01`
   */
  public detectTrigger(chunk: Uint8Array): "download" | "upload" | null {
    if (this.state !== "idle") return null;

    // Search for '**\x18B' (0x2a, 0x2a, 0x18, 0x42)
    for (let i = 0; i <= chunk.length - 6; i++) {
      if (
        chunk[i] === ZPAD &&
        chunk[i + 1] === ZPAD &&
        chunk[i + 2] === ZDLE &&
        chunk[i + 3] === ZHEX
      ) {
        const hexType = String.fromCharCode(chunk[i + 4], chunk[i + 5]);
        if (hexType === "00") {
          return "download";
        }
        if (hexType === "01") {
          return "upload";
        }
      }
    }
    return null;
  }

  /**
   * Processes chunks when Zmodem transfer is active or was just triggered.
   */
  public async processChunk(chunk: Uint8Array): Promise<void> {
    for (let i = 0; i < chunk.length; i++) {
      this.buffer.push(chunk[i]);
    }

    if (this.isBusy) return;
    this.isBusy = true;

    try {
      if (this.state === "idle") {
        const trigger = this.detectTrigger(chunk);
        if (trigger === "download") {
          await this.startDownloadFlow();
        } else if (trigger === "upload") {
          await this.startUploadFlow();
        }
      } else if (this.state === "downloading") {
        await this.handleDownloadData();
      } else if (this.state === "uploading") {
        await this.handleUploadData();
      }
    } catch (err: unknown) {
      console.error(`[Zmodem ${this.paneId}] Transfer error:`, err);
      const msg = err instanceof Error ? err.message : String(err);
      useTransferStore.getState().setStatus(this.paneId, "error", msg);
      await this.abort();
    } finally {
      this.isBusy = false;
    }
  }

  /**
   * Starts server -> client download flow (`sz` on remote).
   */
  private async startDownloadFlow(): Promise<void> {
    this.state = "downloading";
    this.buffer = [];
    this.receivedBytes = 0;
    this.currentFileName = "remote_file";
    this.currentFileSize = 0;

    useTransferStore.getState().setTransfer({
      paneId: this.paneId,
      protocol: "zmodem",
      direction: "download",
      status: "prompting",
      fileName: "Waiting for server file...",
      fileSize: 0,
      transferredBytes: 0,
      progressPercent: 0,
      speedBytesPerSec: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Send ZRINIT acknowledging readiness (can receive, 0 pos)
    await this.sendHexHeader(ZRINIT, 0, 0, 0, 0x23); // 0x23 = CANFDX | CANOVIO | CANRLE
  }

  /**
   * Starts client -> server upload flow (`rz` on remote).
   */
  private async startUploadFlow(): Promise<void> {
    this.state = "uploading";
    this.buffer = [];

    useTransferStore.getState().setTransfer({
      paneId: this.paneId,
      protocol: "zmodem",
      direction: "upload",
      status: "prompting",
      fileName: "Selecting local file...",
      fileSize: 0,
      transferredBytes: 0,
      progressPercent: 0,
      speedBytesPerSec: 0,
      startedAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Prompt user to pick file to upload
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
    this.uploadOffset = 0;

    useTransferStore.getState().setTransfer({
      paneId: this.paneId,
      protocol: "zmodem",
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

    // Send ZFILE header with file name & size subpacket
    await this.sendZFile(fileName, fileSize);
  }

  /**
   * Processes incoming data while downloading (`sz`).
   */
  private async handleDownloadData(): Promise<void> {
    while (this.buffer.length > 0) {
      // Look for Hex Header
      const headerIdx = this.findHeaderIndex(this.buffer);
      if (headerIdx !== -1) {
        const header = this.parseHexHeader(this.buffer, headerIdx);
        if (header) {
          // Remove processed bytes up to end of header
          this.buffer.splice(0, headerIdx + 20);

          if (header.type === ZFILE) {
            // Read ZFILE data subpacket
            const fileInfoStr = this.readSubpacketString();
            if (fileInfoStr) {
              const parts = fileInfoStr.split("\0");
              const name = parts[0] ? parts[0].replace(/\\/g, "/").split("/").pop() : "download.bin";
              const metaTokens = parts[1] ? parts[1].trim().split(/\s+/) : [];
              const size = metaTokens[0] ? parseInt(metaTokens[0], 10) || 0 : 0;

              this.currentFileName = name || "download.bin";
              this.currentFileSize = size;

              // Prompt user where to save file
              const savePath = await api.dialogSaveTransferDownload(this.currentFileName);
              if (!savePath) {
                await this.abort();
                return;
              }

              this.currentFilePath = savePath;
              // Reset destination file
              await api.fsWriteBinaryChunk(savePath, [], false);

              useTransferStore.getState().setTransfer({
                paneId: this.paneId,
                protocol: "zmodem",
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

              // Request file from offset 0
              await this.sendHexHeader(ZRPOS, 0, 0, 0, 0);
            }
          } else if (header.type === ZDATA) {
            // Next bytes are data subpackets
            await this.consumeDataSubpackets();
          } else if (header.type === ZEOF) {
            // Remote finished sending this file
            await this.sendHexHeader(ZRINIT, 0, 0, 0, 0x23);
          } else if (header.type === ZFIN) {
            // Remote finishes session
            await this.sendHexHeader(ZFIN, 0, 0, 0, 0);
            await this.sendBytes(new Uint8Array([0x4f, 0x4f])); // "OO" (Over and Out)
            useTransferStore.getState().completeTransfer(this.paneId);
            this.reset();
            return;
          }
          continue;
        }
      }

      // If in data mode, try reading subpackets directly
      if (this.currentFilePath) {
        const consumed = await this.consumeDataSubpackets();
        if (consumed) continue;
      }

      break;
    }
  }

  /**
   * Processes incoming responses while uploading (`rz`).
   */
  private async handleUploadData(): Promise<void> {
    const headerIdx = this.findHeaderIndex(this.buffer);
    if (headerIdx === -1) return;

    const header = this.parseHexHeader(this.buffer, headerIdx);
    if (!header) return;

    this.buffer.splice(0, headerIdx + 20);

    if (header.type === ZRPOS) {
      // Remote specifies offset to send from (little endian f0..f3)
      const offset = header.f0 | (header.f1 << 8) | (header.f2 << 16) | (header.f3 << 24);
      this.uploadOffset = Math.max(0, offset);
      await this.streamFileData();
    } else if (header.type === ZRINIT) {
      // Finished file, send ZFIN
      await this.sendHexHeader(ZFIN, 0, 0, 0, 0);
    } else if (header.type === ZFIN) {
      // Acknowledged finish
      await this.sendBytes(new Uint8Array([0x4f, 0x4f])); // "OO"
      useTransferStore.getState().completeTransfer(this.paneId);
      this.reset();
    } else if (header.type === ZSKIP || header.type === ZABORT) {
      await this.abort();
    }
  }

  /**
   * Reads data from local file and streams in ZDATA subpackets.
   */
  private async streamFileData(): Promise<void> {
    if (!this.currentFilePath) return;

    const CHUNK_SIZE = 1024;
    while (this.uploadOffset < this.currentFileSize && this.state === "uploading") {
      const readLen = Math.min(CHUNK_SIZE, this.currentFileSize - this.uploadOffset);
      const chunk = await api.fsReadBinaryChunk(this.currentFilePath, this.uploadOffset, readLen);
      if (!chunk.length) break;

      // Send ZDATA header at current offset
      const f0 = this.uploadOffset & 0xff;
      const f1 = (this.uploadOffset >> 8) & 0xff;
      const f2 = (this.uploadOffset >> 16) & 0xff;
      const f3 = (this.uploadOffset >> 24) & 0xff;
      await this.sendHexHeader(ZDATA, f0, f1, f2, f3);

      // Send binary data subpacket with ZCRCG or ZCRCW
      const isLast = this.uploadOffset + chunk.length >= this.currentFileSize;
      const terminator = isLast ? ZCRCW : ZCRCG;
      await this.sendDataSubpacket(chunk, terminator);

      this.uploadOffset += chunk.length;
      useTransferStore.getState().updateProgress(this.paneId, this.uploadOffset, this.currentFileSize);

      if (isLast) {
        break;
      }
    }

    if (this.state === "uploading") {
      // Send ZEOF header
      const f0 = this.currentFileSize & 0xff;
      const f1 = (this.currentFileSize >> 8) & 0xff;
      const f2 = (this.currentFileSize >> 16) & 0xff;
      const f3 = (this.currentFileSize >> 24) & 0xff;
      await this.sendHexHeader(ZEOF, f0, f1, f2, f3);
    }
  }

  /**
   * Consumes incoming ZDATA binary subpackets and flushes unescaped bytes to file.
   */
  private async consumeDataSubpackets(): Promise<boolean> {
    if (!this.currentFilePath || this.buffer.length < 4) return false;

    const unescaped: number[] = [];
    let i = 0;
    let foundTerminator = false;

    while (i < this.buffer.length) {
      const b = this.buffer[i++];
      if (b === ZDLE) {
        if (i >= this.buffer.length) {
          // Incomplete escape sequence, wait for more data
          return false;
        }
        const next = this.buffer[i++];
        if (next === ZCRCE || next === ZCRCG || next === ZCRCQ || next === ZCRCW) {
          // Subpacket terminator! 2 CRC bytes follow
          if (i + 2 > this.buffer.length) {
            return false;
          }
          i += 2; // Skip CRC16
          foundTerminator = true;
          break;
        } else if (next === (0x40 ^ 0x18) || next === (0x40 ^ 0x10) || next === (0x40 ^ 0x11)) {
          unescaped.push(next ^ 0x40);
        } else {
          unescaped.push(next ^ 0x40);
        }
      } else {
        unescaped.push(b);
      }
    }

    if (unescaped.length > 0) {
      this.buffer.splice(0, i);
      await api.fsWriteBinaryChunk(this.currentFilePath, unescaped, true);
      this.receivedBytes += unescaped.length;
      useTransferStore.getState().updateProgress(
        this.paneId,
        this.receivedBytes,
        this.currentFileSize || this.receivedBytes
      );
      return true;
    }

    return foundTerminator;
  }

  private readSubpacketString(): string | null {
    const raw: number[] = [];
    let i = 0;
    while (i < this.buffer.length) {
      const b = this.buffer[i++];
      if (b === ZDLE) {
        if (i >= this.buffer.length) return null;
        const next = this.buffer[i++];
        if (next === ZCRCE || next === ZCRCG || next === ZCRCQ || next === ZCRCW) {
          // Terminator + 2 CRC bytes
          i += 2;
          this.buffer.splice(0, i);
          return new TextDecoder().decode(new Uint8Array(raw));
        }
        raw.push(next ^ 0x40);
      } else {
        raw.push(b);
      }
    }
    return null;
  }

  private async sendZFile(name: string, size: number): Promise<void> {
    // Send ZFILE hex header
    await this.sendHexHeader(ZFILE, 0, 0, 0, 0);

    // Payload: "filename\0size 0 0\0"
    const payloadStr = `${name}\0${size} 0 0\0`;
    const bytes = Array.from(new TextEncoder().encode(payloadStr));
    await this.sendDataSubpacket(bytes, ZCRCW);
  }

  private async sendDataSubpacket(bytes: number[], terminator: number): Promise<void> {
    const out: number[] = [];
    let crc = 0;

    for (const b of bytes) {
      crc = updateCrc16(crc, b);
      this.escapeByte(out, b);
    }

    // Append terminator and CRC
    crc = updateCrc16(crc, terminator);
    out.push(ZDLE, terminator);

    const crcHi = (crc >> 8) & 0xff;
    const crcLo = crc & 0xff;
    this.escapeByte(out, crcHi);
    this.escapeByte(out, crcLo);

    await this.sendBytes(new Uint8Array(out));
  }

  private escapeByte(out: number[], b: number): void {
    if (
      b === 0x0d ||
      b === 0x8d ||
      b === 0x11 ||
      b === 0x13 ||
      b === 0x91 ||
      b === 0x93 ||
      b === ZDLE ||
      b === 0x7f ||
      b === 0xff
    ) {
      out.push(ZDLE, b ^ 0x40);
    } else {
      out.push(b);
    }
  }

  private async sendHexHeader(
    type: number,
    f0: number,
    f1: number,
    f2: number,
    f3: number
  ): Promise<void> {
    const headerBytes = [type, f0, f1, f2, f3];
    const crc = calculateCrc16(headerBytes);

    const hex = [
      type.toString(16).padStart(2, "0"),
      f0.toString(16).padStart(2, "0"),
      f1.toString(16).padStart(2, "0"),
      f2.toString(16).padStart(2, "0"),
      f3.toString(16).padStart(2, "0"),
      ((crc >> 8) & 0xff).toString(16).padStart(2, "0"),
      (crc & 0xff).toString(16).padStart(2, "0"),
    ].join("");

    const packet = `**\x18B${hex}\r\n`;
    await this.sendBytes(new TextEncoder().encode(packet));
  }

  private findHeaderIndex(buf: number[]): number {
    for (let i = 0; i <= buf.length - 4; i++) {
      if (
        buf[i] === ZPAD &&
        buf[i + 1] === ZPAD &&
        buf[i + 2] === ZDLE &&
        buf[i + 3] === ZHEX
      ) {
        return i;
      }
    }
    return -1;
  }

  private parseHexHeader(buf: number[], startIdx: number): ZmodemParsedHeader | null {
    // Need at least 20 chars: "**\x18B" (4) + 14 hex chars + "\r\n" (2)
    if (buf.length < startIdx + 18) return null;

    const hexStr = String.fromCharCode(...buf.slice(startIdx + 4, startIdx + 18));
    if (!/^[0-9a-fA-F]{14}$/.test(hexStr)) return null;

    const type = parseInt(hexStr.slice(0, 2), 16);
    const f0 = parseInt(hexStr.slice(2, 4), 16);
    const f1 = parseInt(hexStr.slice(4, 6), 16);
    const f2 = parseInt(hexStr.slice(6, 8), 16);
    const f3 = parseInt(hexStr.slice(8, 10), 16);
    const expectedCrc = parseInt(hexStr.slice(10, 14), 16);

    const computedCrc = calculateCrc16([type, f0, f1, f2, f3]);

    return {
      type,
      f0,
      f1,
      f2,
      f3,
      crcValid: computedCrc === expectedCrc,
    };
  }

  public async abort(): Promise<void> {
    try {
      await this.sendBytes(CAN_SEQUENCE);
    } catch {
      // Ignore write errors on cancellation
    }
    useTransferStore.getState().cancelTransfer(this.paneId);
    this.reset();
  }

  public reset(): void {
    this.state = "idle";
    this.buffer = [];
    this.currentFilePath = null;
    this.currentFileName = "";
    this.currentFileSize = 0;
    this.receivedBytes = 0;
    this.uploadOffset = 0;
    this.isBusy = false;
  }
}
