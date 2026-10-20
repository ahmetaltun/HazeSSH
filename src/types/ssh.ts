import { z } from "zod";

export const SshStatusChangeSchema = z.object({
  status: z.string(),
  message: z.string().optional(),
});

export const SshExitSchema = z.object({
  code: z.number(),
});

export type SshEvent =
  | { type: "Data"; payload: number[] }
  | { type: "StatusChange"; payload: { status: string; message?: string } }
  | { type: "Exit"; payload: { code: number } }
  | { type: "Error"; payload: string };
