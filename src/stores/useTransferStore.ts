import { create } from "zustand";
import type { TransferSessionState, TransferStatus } from "@/types/transfer";

interface TransferStore {
  readonly transfers: Readonly<Record<string, TransferSessionState>>;
  readonly setTransfer: (state: TransferSessionState) => void;
  readonly updateProgress: (paneId: string, transferredBytes: number, totalBytes?: number) => void;
  readonly setStatus: (paneId: string, status: TransferStatus, errorMessage?: string) => void;
  readonly completeTransfer: (paneId: string) => void;
  readonly cancelTransfer: (paneId: string) => void;
  readonly clearTransfer: (paneId: string) => void;
  readonly getTransfer: (paneId: string) => TransferSessionState | undefined;
}

export const useTransferStore = create<TransferStore>((set, get) => ({
  transfers: {},

  setTransfer: (state: TransferSessionState) => {
    set((prev) => ({
      transfers: {
        ...prev.transfers,
        [state.paneId]: state,
      },
    }));
  },

  updateProgress: (paneId: string, transferredBytes: number, totalBytes?: number) => {
    set((prev) => {
      const current = prev.transfers[paneId];
      if (!current) return prev;

      const now = Date.now();
      const elapsedSec = Math.max(0.001, (now - current.startedAt) / 1000);
      const speed = Math.round(transferredBytes / elapsedSec);
      const targetTotal = totalBytes ?? current.fileSize;
      const progressPercent = targetTotal > 0
        ? Math.min(100, Math.round((transferredBytes / targetTotal) * 100))
        : 0;

      return {
        transfers: {
          ...prev.transfers,
          [paneId]: {
            ...current,
            fileSize: targetTotal,
            transferredBytes,
            progressPercent,
            speedBytesPerSec: speed,
            updatedAt: now,
          },
        },
      };
    });
  },

  setStatus: (paneId: string, status: TransferStatus, errorMessage?: string) => {
    set((prev) => {
      const current = prev.transfers[paneId];
      if (!current) return prev;
      return {
        transfers: {
          ...prev.transfers,
          [paneId]: {
            ...current,
            status,
            errorMessage,
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  completeTransfer: (paneId: string) => {
    set((prev) => {
      const current = prev.transfers[paneId];
      if (!current) return prev;
      return {
        transfers: {
          ...prev.transfers,
          [paneId]: {
            ...current,
            status: "completed",
            progressPercent: 100,
            transferredBytes: current.fileSize,
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  cancelTransfer: (paneId: string) => {
    set((prev) => {
      const current = prev.transfers[paneId];
      if (!current) return prev;
      return {
        transfers: {
          ...prev.transfers,
          [paneId]: {
            ...current,
            status: "cancelled",
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  clearTransfer: (paneId: string) => {
    set((prev) => {
      if (!prev.transfers[paneId]) return prev;
      const updated = { ...prev.transfers };
      delete updated[paneId];
      return { transfers: updated };
    });
  },

  getTransfer: (paneId: string) => {
    return get().transfers[paneId];
  },
}));
