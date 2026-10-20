import { z } from "zod";

export const SnippetSchema = z.object({
  id: z.string(),
  title: z.string().min(1, "Snippet title is required"),
  script: z.string().min(1, "Script content is required"),
  description: z.string().nullable().optional(),
  tags: z.array(z.string()).default([]),
  run_on_connect: z.boolean().default(false),
  created_at: z.number(),
});

export type Snippet = z.infer<typeof SnippetSchema>;

export const CreateSnippetInputSchema = z.object({
  title: z.string().min(1, "Snippet title is required"),
  script: z.string().min(1, "Script content is required"),
  description: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  run_on_connect: z.boolean().optional().default(false),
});

export type CreateSnippetInput = z.infer<typeof CreateSnippetInputSchema>;

export const UpdateSnippetInputSchema = z.object({
  id: z.string().min(1, "Snippet ID is required"),
  title: z.string().min(1, "Snippet title is required"),
  script: z.string().min(1, "Script content is required"),
  description: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  run_on_connect: z.boolean().optional().default(false),
});

export type UpdateSnippetInput = z.infer<typeof UpdateSnippetInputSchema>;
