import { z } from "zod";

export const VaultStatusSchema = z.object({
  is_locked: z.boolean(),
  has_master_password: z.boolean(),
});

export type VaultStatus = z.infer<typeof VaultStatusSchema>;
