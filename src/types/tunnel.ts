import { z } from "zod";

export const TunnelSchema = z.object({
  id: z.string(),
  host_id: z.string(),
  name: z.string().min(1, "Tunnel name is required"),
  tunnel_type: z.enum(["local", "remote", "dynamic"]),
  local_host: z.string().default("127.0.0.1"),
  local_port: z.number().int().min(1).max(65535),
  remote_host: z.string().nullable().optional(),
  remote_port: z.number().int().min(1).max(65535).nullable().optional(),
  auto_start: z.boolean().default(false),
  created_at: z.number(),
});

export type Tunnel = z.infer<typeof TunnelSchema>;

export const CreateTunnelInputSchema = z.object({
  host_id: z.string().min(1, "Target host is required"),
  name: z.string().min(1, "Tunnel name is required"),
  tunnel_type: z.enum(["local", "remote", "dynamic"]),
  local_host: z.string().optional().default("127.0.0.1"),
  local_port: z.number().int().min(1).max(65535),
  remote_host: z.string().optional(),
  remote_port: z.number().int().min(1).max(65535).optional(),
  auto_start: z.boolean().optional().default(false),
});

export type CreateTunnelInput = z.infer<typeof CreateTunnelInputSchema>;

export interface TunnelRuntimeStatus {
  tunnel_id: string;
  status: "running" | "stopped" | "error" | "starting";
  bytes_in: number;
  bytes_out: number;
  active_connections: number;
  error_message?: string | null;
}

