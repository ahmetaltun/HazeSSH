import { z } from "zod";
import { CreateSnippetInputSchema, type CreateSnippetInput } from "@/types/snippet";

export const SshConfigHostCandidateSchema = z.object({
  label: z.string(),
  hostname: z.string(),
  port: z.number().int().positive(),
  username: z.string().nullable().optional(),
  identity_file: z.string().nullable().optional(),
  proxy_jump: z.string().nullable().optional(),
  group_name: z.string().nullable().optional(),
  is_duplicate: z.boolean(),
  is_known_host: z.boolean(),
});

export type SshConfigHostCandidate = z.infer<typeof SshConfigHostCandidateSchema>;

export const SshConfigParseResultSchema = z.object({
  config_path: z.string(),
  found_config: z.boolean(),
  found_known_hosts: z.boolean(),
  candidates: z.array(SshConfigHostCandidateSchema),
});

export type SshConfigParseResult = z.infer<typeof SshConfigParseResultSchema>;

export const ImportSshHostsInputSchema = z.object({
  candidates: z.array(SshConfigHostCandidateSchema),
  import_keys_as_identities: z.boolean(),
});

export type ImportSshHostsInput = z.infer<typeof ImportSshHostsInputSchema>;

export const ImportResultSummarySchema = z.object({
  imported_hosts_count: z.number().int().nonnegative(),
  imported_groups_count: z.number().int().nonnegative(),
  imported_identities_count: z.number().int().nonnegative(),
});

export type ImportResultSummary = z.infer<typeof ImportResultSummarySchema>;

export const TermiusParseResultSchema = z.object({
  candidates: z.array(SshConfigHostCandidateSchema),
  snippets: z.array(CreateSnippetInputSchema),
});

export type TermiusParseResult = {
  candidates: SshConfigHostCandidate[];
  snippets: CreateSnippetInput[];
};

export const ImportTermiusInputSchema = z.object({
  candidates: z.array(SshConfigHostCandidateSchema),
  snippets: z.array(CreateSnippetInputSchema),
  import_keys_as_identities: z.boolean(),
});

export type ImportTermiusInput = {
  candidates: SshConfigHostCandidate[];
  snippets: CreateSnippetInput[];
  import_keys_as_identities: boolean;
};
