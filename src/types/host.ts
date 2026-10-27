import { z } from "zod";

export const HostGroupSchema = z.object({
  id: z.string(),
  parent_id: z.string().nullable().optional(),
  name: z.string().min(1, "Group name is required"),
  color: z.string().nullable().optional(),
  created_at: z.number(),
});

export type HostGroup = z.infer<typeof HostGroupSchema>;

export const CreateGroupInputSchema = z.object({
  parent_id: z.string().optional(),
  name: z.string().min(1, "Group name is required"),
  color: z.string().optional(),
});

export type CreateGroupInput = z.infer<typeof CreateGroupInputSchema>;

export const IdentitySchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Identity name is required"),
  identity_type: z.enum(["password", "key", "cert"]),
  username: z.string().nullable().optional(),
  has_secret: z.boolean(),
  created_at: z.number(),
});

export type Identity = z.infer<typeof IdentitySchema>;

export const CreateIdentityInputSchema = z.object({
  name: z.string().min(1, "Identity name is required"),
  identity_type: z.enum(["password", "key", "cert"]),
  username: z.string().optional(),
  secret: z.string().min(1, "Password or private key content is required"),
  passphrase: z.string().optional(),
});

export type CreateIdentityInput = z.infer<typeof CreateIdentityInputSchema>;

export const HostSchema = z.object({
  id: z.string(),
  group_id: z.string().nullable().optional(),
  label: z.string().min(1, "Host label is required"),
  hostname: z.string().min(1, "Hostname or IP is required"),
  port: z.number().int().min(1).max(65535).default(22),
  username: z.string().nullable().optional(),
  auth_type: z.enum(["password", "identity", "interactive", "agent", "telnet"]).default("password"),
  identity_id: z.string().nullable().optional(),
  jump_host_id: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  color: z.string().nullable().optional(),
  terminal_theme: z.string().nullable().optional(),
  startup_snippet_id: z.string().nullable().optional(),
  enable_audit_log: z.boolean().nullable().optional(),
  created_at: z.number(),
  updated_at: z.number(),
});

export type Host = z.infer<typeof HostSchema>;

export const CreateHostInputSchema = z.object({
  group_id: z.string().optional(),
  label: z.string().min(1, "Host label is required"),
  hostname: z.string().min(1, "Hostname or IP address is required"),
  port: z.number().int().min(1).max(65535).optional().default(22),
  username: z.string().optional(),
  auth_type: z.enum(["password", "identity", "interactive", "agent", "telnet"]).optional().default("password"),
  identity_id: z.string().optional(),
  jump_host_id: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  color: z.string().optional(),
  terminal_theme: z.string().optional(),
  startup_snippet_id: z.string().optional(),
  enable_audit_log: z.boolean().optional(),
});

export type CreateHostInput = z.infer<typeof CreateHostInputSchema>;

export const UpdateHostInputSchema = HostSchema;
export type UpdateHostInput = z.infer<typeof UpdateHostInputSchema>;
