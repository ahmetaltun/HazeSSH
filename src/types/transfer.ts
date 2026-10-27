export type TransferProtocol = "zmodem" | "trzsz";
export type TransferDirection = "upload" | "download";
export type TransferStatus =
  | "idle"
  | "detecting"
  | "prompting"
  | "transferring"
  | "completed"
  | "cancelled"
  | "error";

export interface TransferSessionState {
  paneId: string;
  protocol: TransferProtocol;
  direction: TransferDirection;
  status: TransferStatus;
  fileName: string;
  fileSize: number;
  transferredBytes: number;
  progressPercent: number;
  speedBytesPerSec: number;
  errorMessage?: string;
  startedAt: number;
  updatedAt: number;
  localPath?: string;
}
