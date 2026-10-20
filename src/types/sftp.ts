import { z } from "zod";

export const FileEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  is_dir: z.boolean(),
  is_symlink: z.boolean(),
  size: z.number(),
  modified: z.number(),
  permissions: z.string(),
});

export type FileEntry = z.infer<typeof FileEntrySchema>;

export interface TransferTask {
  readonly id: string;
  readonly filename: string;
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly direction: "upload" | "download";
  readonly size: number;
  readonly status: "queued" | "transferring" | "completed" | "error";
  readonly progress: number; // 0 to 100
  readonly errorMessage?: string;
}
