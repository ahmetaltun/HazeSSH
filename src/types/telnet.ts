import { z } from "zod";

export const TelnetConnectOptionsSchema = z.object({
  host: z.string().min(1, "Hostname or IP address is required"),
  port: z.number().int().min(1).max(65535).default(23),
  terminal_type: z.string().default("xterm-256color").optional(),
  cols: z.number().int().optional(),
  rows: z.number().int().optional(),
});

export type TelnetConnectOptions = z.infer<typeof TelnetConnectOptionsSchema>;
