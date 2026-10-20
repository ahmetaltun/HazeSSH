import { useState, useEffect, useMemo } from "react";
import {
  Code2,
  Plus,
  Search,
  Tag,
  Copy,
  Check,
  Edit2,
  Trash2,
  Terminal,
  Sparkles,
  Zap,
  Play,
  Layers,
} from "lucide-react";
import { useSnippetStore } from "@/stores/useSnippetStore";
import { SnippetModal } from "@/components/snippets/SnippetModal";
import { SnippetRunnerModal } from "@/components/snippets/SnippetRunnerModal";
import { BatchSnippetModal } from "@/components/snippets/BatchSnippetModal";
import type { Snippet } from "@/types/snippet";

export function SnippetsView() {
  const {
    snippets,
    isLoading,
    error,
    searchQuery,
    selectedTag,
    fetchSnippets,
    deleteSnippet,
    setSearchQuery,
    setSelectedTag,
  } = useSnippetStore();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [snippetToEdit, setSnippetToEdit] = useState<Snippet | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [isRunnerOpen, setIsRunnerOpen] = useState(false);
  const [runnerSnippet, setRunnerSnippet] = useState<Snippet | null>(null);

  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchSnippet, setBatchSnippet] = useState<Snippet | null>(null);

  useEffect(() => {
    fetchSnippets();
  }, [fetchSnippets]);

  // Extract all unique tags across all snippets
  const allTags = useMemo(() => {
    const set = new Set<string>();
    snippets.forEach((s) => {
      s.tags.forEach((t) => set.add(t));
    });
    return Array.from(set).sort();
  }, [snippets]);

  // Filter snippets by query and selected tag
  const filteredSnippets = useMemo(() => {
    return snippets.filter((s) => {
      const matchesTag = !selectedTag || s.tags.includes(selectedTag);
      if (!matchesTag) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        s.title.toLowerCase().includes(q) ||
        (s.description && s.description.toLowerCase().includes(q)) ||
        s.script.toLowerCase().includes(q) ||
        s.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [snippets, searchQuery, selectedTag]);

  const handleCopyScript = async (snippet: Snippet) => {
    try {
      await navigator.clipboard.writeText(snippet.script);
      setCopiedId(snippet.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error("Failed to copy snippet script to clipboard:", err);
    }
  };

  const handleOpenRunner = (snippet: Snippet) => {
    setRunnerSnippet(snippet);
    setIsRunnerOpen(true);
  };

  const handleOpenCreate = () => {
    setSnippetToEdit(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (snippet: Snippet) => {
    setSnippetToEdit(snippet);
    setIsModalOpen(true);
  };

  const handleDelete = async (snippet: Snippet) => {
    const confirmed = window.confirm(
      `Are you sure you want to delete snippet "${snippet.title}"? This cannot be undone.`
    );
    if (!confirmed) return;

    try {
      setDeletingId(snippet.id);
      await deleteSnippet(snippet.id);
    } catch (err) {
      console.error("Failed to delete snippet:", err);
    } finally {
      setDeletingId(null);
    }
  };

  // Helper to extract placeholder tokens like {{var}}
  const extractPlaceholders = (text: string): string[] => {
    const matches = text.match(/\{\{([^}]+)\}\}/g);
    return matches ? Array.from(new Set(matches)) : [];
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-base-100 overflow-hidden">
      {/* Top Header */}
      <div className="h-16 border-b border-base-200 px-6 flex items-center justify-between shrink-0 bg-base-200/30">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold">Snippets & Automation</h2>
            <span className="badge badge-sm badge-ghost font-mono text-[11px]">
              {snippets.length} {snippets.length === 1 ? "snippet" : "snippets"}
            </span>
          </div>
          <p className="text-xs text-base-content/60">
            Reusable shell scripts with dynamic variables and batch execution
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setBatchSnippet(null);
              setIsBatchModalOpen(true);
            }}
            disabled={snippets.length === 0}
            className="btn btn-sm btn-outline border-base-300 gap-1.5 shadow-xs"
          >
            <Layers className="w-4 h-4 text-secondary" />
            <span>Batch Run</span>
          </button>

          <button
            type="button"
            onClick={handleOpenCreate}
            className="btn btn-sm btn-primary gap-1.5 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>New Snippet</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="px-6 py-3 border-b border-base-200 bg-base-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
          <input
            type="text"
            placeholder="Search snippets by name, command, or tag..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input input-sm input-bordered w-full pl-9 rounded-lg text-xs focus:input-primary"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-base-content/40 hover:text-base-content"
            >
              Clear
            </button>
          )}
        </div>

        {/* Tag Filter Carousel */}
        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
            <button
              type="button"
              onClick={() => setSelectedTag(null)}
              className={`badge badge-sm cursor-pointer py-1.5 px-3 transition-colors ${
                selectedTag === null
                  ? "badge-primary font-medium"
                  : "badge-ghost hover:badge-neutral"
              }`}
            >
              All Tags
            </button>
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                className={`badge badge-sm cursor-pointer py-1.5 px-3 transition-colors gap-1 ${
                  selectedTag === tag
                    ? "badge-primary font-medium"
                    : "badge-ghost hover:badge-neutral"
                }`}
              >
                <Tag className="w-2.5 h-2.5 opacity-60" />
                <span>#{tag}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-6 overflow-y-auto">
        {error && (
          <div className="alert alert-error text-xs mb-4 py-2.5 px-4 rounded-xl shadow-sm">
            <span>{error}</span>
          </div>
        )}

        {isLoading && snippets.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-base-content/50">
            <span className="loading loading-spinner loading-md mr-2" />
            <span className="text-sm">Loading snippets...</span>
          </div>
        ) : filteredSnippets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center py-16">
            {snippets.length === 0 ? (
              <div className="border-2 border-dashed border-base-300 rounded-3xl p-12 flex flex-col items-center justify-center text-center space-y-4 max-w-md">
                <div className="w-14 h-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
                  <Code2 className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold">No snippets saved yet</h3>
                  <p className="text-xs text-base-content/60 mt-1.5 leading-relaxed">
                    Store recurring shell scripts and automate deployments. Support dynamic variables like{" "}
                    <code className="text-primary font-mono bg-primary/10 px-1 py-0.5 rounded">
                      {"{{host.hostname}}"}
                    </code>{" "}
                    or{" "}
                    <code className="text-secondary font-mono bg-secondary/10 px-1 py-0.5 rounded">
                      {"{{prompt:Branch}}"}
                    </code>
                    .
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenCreate}
                  className="btn btn-sm btn-primary gap-1.5 rounded-xl shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create First Snippet</span>
                </button>
              </div>
            ) : (
              <div className="text-center space-y-3">
                <p className="text-sm text-base-content/60">
                  No snippets found matching your filters.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedTag(null);
                  }}
                  className="btn btn-xs btn-ghost border border-base-300 rounded-lg"
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSnippets.map((snippet) => {
              const placeholders = extractPlaceholders(snippet.script);

              return (
                <div
                  key={snippet.id}
                  className="card bg-base-200/50 hover:bg-base-200/70 border border-base-300 rounded-2xl p-4.5 transition-all flex flex-col justify-between group shadow-sm hover:shadow"
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-sm text-base-content truncate">
                            {snippet.title}
                          </h4>
                          {snippet.run_on_connect && (
                            <span className="badge badge-xs badge-info/15 text-info border-none gap-0.5 font-medium px-2 py-1">
                              <Zap className="w-2.5 h-2.5" />
                              Startup
                            </span>
                          )}
                        </div>
                        {snippet.description && (
                          <p className="text-xs text-base-content/60 mt-0.5 line-clamp-1">
                            {snippet.description}
                          </p>
                        )}
                      </div>

                      {/* Top Action Menu */}
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopyScript(snippet)}
                          className="btn btn-xs btn-circle btn-ghost text-base-content/60 hover:text-base-content"
                          title="Copy script to clipboard"
                        >
                          {copiedId === snippet.id ? (
                            <Check className="w-3.5 h-3.5 text-success" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(snippet)}
                          className="btn btn-xs btn-circle btn-ghost text-base-content/60 hover:text-base-content"
                          title="Edit snippet"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(snippet)}
                          disabled={deletingId === snippet.id}
                          className="btn btn-xs btn-circle btn-ghost text-base-content/60 hover:text-error"
                          title="Delete snippet"
                        >
                          {deletingId === snippet.id ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : (
                            <Trash2 className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Script Code Block */}
                    <div className="relative group/code rounded-xl overflow-hidden border border-base-300 bg-base-300/60 p-3">
                      <pre className="font-mono text-[11px] text-base-content/90 overflow-x-auto whitespace-pre-wrap break-all line-clamp-4 leading-relaxed">
                        {snippet.script}
                      </pre>
                    </div>

                    {/* Tags */}
                    {snippet.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {snippet.tags.map((tag) => (
                          <span
                            key={tag}
                            className="badge badge-xs badge-ghost text-base-content/70 px-2 py-0.5 rounded font-mono text-[10px]"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Card Bottom / Footer */}
                  <div className="pt-3 mt-3 border-t border-base-300/60 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-base-content/50">
                      {placeholders.length > 0 ? (
                        <span className="badge badge-xs badge-warning/20 text-warning border-none gap-1 font-mono text-[10px] px-1.5 py-0.5">
                          <Sparkles className="w-2.5 h-2.5" />
                          {placeholders.length} {placeholders.length === 1 ? "variable" : "variables"}
                        </span>
                      ) : (
                        <span className="text-[11px] text-base-content/40 flex items-center gap-1">
                          <Terminal className="w-3 h-3" />
                          Direct script
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleCopyScript(snippet)}
                        className="btn btn-xs btn-ghost border border-base-300 rounded-lg gap-1 font-medium text-xs"
                      >
                        {copiedId === snippet.id ? (
                          <>
                            <Check className="w-3 h-3 text-success" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setBatchSnippet(snippet);
                          setIsBatchModalOpen(true);
                        }}
                        className="btn btn-xs btn-ghost border border-base-300 rounded-lg gap-1 font-medium text-xs text-base-content/70 hover:text-base-content"
                        title="Run across multiple hosts"
                      >
                        <Layers className="w-3 h-3 text-secondary" />
                        <span>Batch</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenRunner(snippet)}
                        className="btn btn-xs btn-primary gap-1 font-medium text-xs shadow-sm"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        <span>Run</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Snippet Create / Edit Modal */}
      <SnippetModal
        isOpen={isModalOpen}
        snippetToEdit={snippetToEdit}
        onClose={() => setIsModalOpen(false)}
      />

      {/* Snippet Runner & Interpolation Modal */}
      <SnippetRunnerModal
        isOpen={isRunnerOpen}
        snippet={runnerSnippet}
        onClose={() => setIsRunnerOpen(false)}
      />

      {/* Multi-Host Batch Execution Modal */}
      <BatchSnippetModal
        isOpen={isBatchModalOpen}
        initialSnippet={batchSnippet}
        onClose={() => setIsBatchModalOpen(false)}
      />
    </div>
  );
}
