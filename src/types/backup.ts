import { z } from "zod";

export const BackupEnvelopeSchema = z.object({
  format: z.literal("HAZE_BACKUP"),
  version: z.number().int().positive(),
  salt: z.string().min(1),
  nonce: z.string().min(1),
  ciphertext: z.string().min(1),
});

export type BackupEnvelope = z.infer<typeof BackupEnvelopeSchema>;

export const BackupSummarySchema = z.object({
  version: z.number().int(),
  exported_at: z.number().int(),
  groups_count: z.number().int().nonnegative(),
  identities_count: z.number().int().nonnegative(),
  hosts_count: z.number().int().nonnegative(),
  snippets_count: z.number().int().nonnegative(),
  tunnels_count: z.number().int().nonnegative(),
});

export type BackupSummary = z.infer<typeof BackupSummarySchema>;

export type RestoreStrategy = "merge" | "overwrite";
