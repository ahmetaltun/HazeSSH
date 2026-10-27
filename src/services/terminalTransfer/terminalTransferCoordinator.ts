import { ZmodemEngine } from "@/services/terminalTransfer/zmodemEngine";
import { TrzszEngine } from "@/services/terminalTransfer/trzszEngine";
import { useTransferStore } from "@/stores/useTransferStore";

export class TerminalTransferCoordinator {
  private paneId: string;
  private zmodem: ZmodemEngine;
  private trzsz: TrzszEngine;

  constructor(paneId: string, sendBytes: (bytes: Uint8Array | number[]) => Promise<void>) {
    this.paneId = paneId;
    this.zmodem = new ZmodemEngine(paneId, sendBytes);
    this.trzsz = new TrzszEngine(paneId, sendBytes);
  }

  public isTransferring(): boolean {
    return this.zmodem.isTransferring() || this.trzsz.isTransferring();
  }

  /**
   * Evaluates an incoming stream chunk from SSH / PTY / Serial / Telnet.
   * If an in-terminal transfer is detected or in progress, the chunk is consumed
   * by the appropriate protocol engine and should NOT be passed to xterm.js.
   */
  public async processIncomingChunk(chunk: Uint8Array): Promise<boolean> {
    // 1. If Zmodem is already transferring, route to it
    if (this.zmodem.isTransferring()) {
      await this.zmodem.processChunk(chunk);
      return false; // Intercepted: do not passthrough to xterm
    }

    // 2. If Trzsz is already transferring, route to it
    if (this.trzsz.isTransferring()) {
      await this.trzsz.processChunk(chunk);
      return false; // Intercepted: do not passthrough to xterm
    }

    // 3. Check for Zmodem trigger
    if (this.zmodem.detectTrigger(chunk)) {
      await this.zmodem.processChunk(chunk);
      return false;
    }

    // 4. Check for Trzsz trigger
    if (this.trzsz.detectTrigger(chunk)) {
      await this.trzsz.processChunk(chunk);
      return false;
    }

    // Normal terminal data chunk
    return true; // Passthrough to xterm
  }

  public async cancelActiveTransfer(): Promise<void> {
    if (this.zmodem.isTransferring()) {
      await this.zmodem.abort();
    }
    if (this.trzsz.isTransferring()) {
      await this.trzsz.abort();
    }
    useTransferStore.getState().cancelTransfer(this.paneId);
  }

  public dispose(): void {
    void this.cancelActiveTransfer();
    useTransferStore.getState().clearTransfer(this.paneId);
  }
}
