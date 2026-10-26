import React, { useState, useEffect, useRef } from "react";
import { Code2, X, AlertCircle, Plus, Tag, HelpCircle, Terminal } from "lucide-react";
import { useSnippetStore } from "@/stores/useSnippetStore";
import { CreateSnippetInputSchema, UpdateSnippetInputSchema } from "@/types/snippet";
import type { Snippet } from "@/types/snippet";
import { TextInput } from "@/components/common/TextInput";
import { TextArea } from "@/components/common/TextArea";

interface SnippetModalProps {
  readonly isOpen: boolean;
  readonly snippetToEdit?: Snippet | null;
  readonly onClose: () => void;
  readonly onSaved?: (snippet: Snippet) => void;
}

const COMMON_VARIABLES = [
  { token: "{{host.hostname}}", label: "Host IP/Domain" },
  { token: "{{host.username}}", label: "Username" },
  { token: "{{host.port}}", label: "Port" },
  { token: "{{host.label}}", label: "Host Label" },
  { token: "{{prompt:Value}}", label: "Prompt on Run" },
];

export function SnippetModal({
  isOpen,
  snippetToEdit,
  onClose,
  onSaved,
}: SnippetModalProps) {
  const { createSnippet, updateSnippet } = useSnippetStore();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [script, setScript] = useState("");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [runOnConnect, setRunOnConnect] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const prevOpenRef = useRef(false);
  const prevSnippetIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const isOpening = isOpen && !prevOpenRef.current;
    const isSnippetChanging = snippetToEdit?.id !== prevSnippetIdRef.current;

    if (isOpen && (isOpening || isSnippetChanging)) {
      if (snippetToEdit) {
        setTitle(snippetToEdit.title);
        setDescription(snippetToEdit.description || "");
        setScript(snippetToEdit.script);
        setTags([...snippetToEdit.tags]);
        setRunOnConnect(snippetToEdit.run_on_connect);
      } else {
        setTitle("");
        setDescription("");
        setScript("");
        setTags([]);
        setRunOnConnect(false);
      }
      setTagInput("");
      setErrorMsg(null);
    }

    prevOpenRef.current = isOpen;
    prevSnippetIdRef.current = snippetToEdit?.id;
  }, [isOpen, snippetToEdit]);

  if (!isOpen) return null;

  const handleAddTag = () => {
    const trimmed = tagInput.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
      setTagInput("");
    }
  };

  const handleKeyDownTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      handleAddTag();
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const handleInsertToken = (token: string) => {
    setScript((prev) => (prev ? `${prev} ${token}` : token));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      script: script.trim(),
      tags,
      run_on_connect: runOnConnect,
    };

    try {
      setIsSubmitting(true);

      if (snippetToEdit) {
        const updatePayload = {
          id: snippetToEdit.id,
          ...payload,
        };
        const validation = UpdateSnippetInputSchema.safeParse(updatePayload);
        if (!validation.success) {
          setErrorMsg(validation.error.issues[0]?.message || "Invalid snippet input data");
          setIsSubmitting(false);
          return;
        }
        const updated = await updateSnippet(updatePayload);
        onSaved?.(updated);
      } else {
        const validation = CreateSnippetInputSchema.safeParse(payload);
        if (!validation.success) {
          setErrorMsg(validation.error.issues[0]?.message || "Invalid snippet input data");
          setIsSubmitting(false);
          return;
        }
        const created = await createSnippet(payload);
        onSaved?.(created);
      }

      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-base-100 border border-base-300 w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-base-200 flex items-center justify-between bg-base-200/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">
                {snippetToEdit ? "Edit Snippet" : "Create New Snippet"}
              </h3>
              <p className="text-xs text-base-content/60">
                {snippetToEdit
                  ? "Update command script and variable placeholders"
                  : "Save a reusable shell command with dynamic parameter templates"}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-sm btn-circle btn-ghost text-base-content/60 hover:text-base-content"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {errorMsg && (
            <div className="alert alert-error text-xs py-2.5 px-3 rounded-xl flex items-center gap-2 shadow-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Title & Description */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-base-content/70">
                Title <span className="text-error">*</span>
              </label>
              <TextInput
                type="text"
                placeholder="e.g. Restart Docker & Tail Logs"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="input input-sm input-bordered w-full focus:input-primary rounded-lg text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-base-content/70">
                Description
              </label>
              <TextInput
                type="text"
                placeholder="Optional short description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="input input-sm input-bordered w-full focus:input-primary rounded-lg text-sm"
              />
            </div>
          </div>

          {/* Script Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-base-content/70 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-primary" />
                <span>Script Content</span>
                <span className="text-error">*</span>
              </label>
              <span className="text-[11px] text-base-content/50 flex items-center gap-1">
                <HelpCircle className="w-3 h-3" />
                Supports variables like {"{{var}}"}
              </span>
            </div>

            {/* Variable Insertion Pills */}
            <div className="flex flex-wrap items-center gap-1.5 pb-1">
              <span className="text-[11px] text-base-content/50 mr-1">Insert template:</span>
              {COMMON_VARIABLES.map((v) => (
                <button
                  key={v.token}
                  type="button"
                  onClick={() => handleInsertToken(v.token)}
                  className="badge badge-sm badge-outline hover:badge-primary cursor-pointer font-mono text-[11px] py-1 transition-colors"
                  title={v.label}
                >
                  {v.token}
                </button>
              ))}
            </div>

            <TextArea
              rows={7}
              placeholder={`# Example script\nsudo systemctl restart docker\ndocker ps --filter "name={{prompt:Container Name}}"\ncurl -I http://{{host.hostname}}:{{host.port}}`}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              required
              className="textarea textarea-bordered w-full font-mono text-xs leading-relaxed focus:textarea-primary rounded-xl bg-base-200/50 resize-y"
            />
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-base-content/70 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" />
              <span>Tags</span>
            </label>
            <div className="flex gap-2">
              <TextInput
                type="text"
                placeholder="Add tag and press Enter (e.g. docker, logs)"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDownTag}
                className="input input-sm input-bordered flex-1 focus:input-primary rounded-lg text-sm"
              />
              <button
                type="button"
                onClick={handleAddTag}
                className="btn btn-sm btn-ghost border border-base-300 gap-1 rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="badge badge-sm badge-secondary/15 text-secondary border-none gap-1 py-1 px-2.5 rounded-md font-medium"
                  >
                    #{t}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(t)}
                      className="hover:text-error transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Run on Connect Option */}
          <div className="pt-2 border-t border-base-200">
            <label className="flex items-center justify-between cursor-pointer p-3 rounded-xl bg-base-200/30 hover:bg-base-200/60 transition-colors">
              <div className="space-y-0.5">
                <span className="text-sm font-semibold text-base-content">
                  Mark as Default Startup Snippet
                </span>
                <p className="text-xs text-base-content/60">
                  Makes this snippet available to execute automatically upon terminal connection
                </p>
              </div>
              <input
                type="checkbox"
                checked={runOnConnect}
                onChange={(e) => setRunOnConnect(e.target.checked)}
                className="toggle toggle-primary toggle-sm"
              />
            </label>
          </div>
        </form>

        {/* Modal Actions */}
        <div className="px-6 py-4 border-t border-base-200 flex items-center justify-end gap-2.5 bg-base-200/40">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="btn btn-sm btn-ghost rounded-lg"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !title.trim() || !script.trim()}
            className="btn btn-sm btn-primary rounded-lg px-5 shadow-sm"
          >
            {isSubmitting ? (
              <span className="loading loading-spinner loading-xs" />
            ) : snippetToEdit ? (
              "Save Changes"
            ) : (
              "Create Snippet"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
