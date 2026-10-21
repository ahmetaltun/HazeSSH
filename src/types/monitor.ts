import { z } from "zod";

export const ServerMetricsSchema = z.object({
  host_id: z.string(),
  os_name: z.string().nullable().optional(),
  uptime_seconds: z.number().nullable().optional(),
  uptime_formatted: z.string().nullable().optional(),
  cpu_cores: z.number().int().default(1),
  load_1m: z.number().nullable().optional(),
  load_5m: z.number().nullable().optional(),
  load_15m: z.number().nullable().optional(),
  cpu_usage_percent: z.number().nullable().optional(),
  memory_total_bytes: z.number().nullable().optional(),
  memory_used_bytes: z.number().nullable().optional(),
  memory_free_bytes: z.number().nullable().optional(),
  memory_usage_percent: z.number().nullable().optional(),
  disk_total_bytes: z.number().nullable().optional(),
  disk_used_bytes: z.number().nullable().optional(),
  disk_free_bytes: z.number().nullable().optional(),
  disk_usage_percent: z.number().nullable().optional(),
  disk_mount_path: z.string().nullable().optional(),
  timestamp: z.number(),
  error: z.string().nullable().optional(),
});

export type ServerMetrics = z.infer<typeof ServerMetricsSchema>;

export interface HostHealthState {
  metrics?: ServerMetrics;
  isLoading: boolean;
  lastUpdated?: number;
  error?: string;
}
