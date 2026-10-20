import { z } from "zod";

export const GeneratedKeyPairSchema = z.object({
  algorithm: z.string(),
  public_key: z.string(),
  private_key: z.string(),
  fingerprint: z.string(),
});

export type GeneratedKeyPair = z.infer<typeof GeneratedKeyPairSchema>;
