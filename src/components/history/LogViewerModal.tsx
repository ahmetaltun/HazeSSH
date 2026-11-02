import { useState, useEffect, useMemo } from "react";
import {
  X,
  FileText,
  Copy,
  Check,
  FolderOpen,
  Loader2,
  WrapText,
  Code,
  Download,
} from "lucide-react";
import { api } from "@/services/api";
import { SearchInput } from "@/components/common/SearchInput";
import type { AuditLogFileInfo } from "@/types/sessionHistory";

// Standard regex to match ANSI 7-bit and 8-bit escape sequences
const ANSI_REGEX =
  // eslint-disable-next-line no-control-regex
  /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

interface LogViewerModalProps {
  readonly logFile: AuditLogFileInfo | null;
  readonly onClose: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function LogViewerModal({ logFile, onClose }: LogViewerModalProps) {
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [stripAnsi, setStripAnsi] = useState(true);
  const [wrapLines, setWrapLines] = useState(true);
  const [copied, setCopied] = useState(false);
  const [exported, setExported] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    if (!logFile) {
      setContent("");
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);
    setSearchQuery("");

    api
      .auditLogRead(logFile.file_path, 3000)
      .then((data) => {
        setContent(data);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Failed to read audit log:", err);
        setError(String(err));
        setIsLoading(false);
      });
  }, [logFile]);

  // Trap Escape key to close
  useEffect(() => {
    if (!logFile) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [logFile, onClose]);

  const processedLines = useMemo(() => {
    if (!content) return [];
    const text = stripAnsi ? content.replace(ANSI_REGEX, "") : content;
    return text.split("\n");
  }, [content, stripAnsi]);

  const filteredLines = useMemo(() => {
    if (!searchQuery.trim()) {
      return processedLines.map((line, idx) => ({ line, originalIndex: idx + 1 }));
    }
    const q = searchQuery.toLowerCase();
    const result: Array<{ line: string; originalIndex: number }> = [];
    processedLines.forEach((line, idx) => {
      if (line.toLowerCase().includes(q)) {
        result.push({ line, originalIndex: idx + 1 });
      }
    });
    return result;
  }, [processedLines, searchQuery]);

  const handleCopy = async () => {
    try {
      const textToCopy = stripAnsi ? content.replace(ANSI_REGEX, "") : content;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy log text:", err);
    }
  };

  const handleExport = async () => {
    if (!logFile || !content || isExporting) return;
    setIsExporting(true);
    try {
      const textToExport = stripAnsi ? content.replace(ANSI_REGEX, "") : content;
      const savedPath = await api.auditLogExportDialog(logFile.filename, textToExport);
      if (savedPath) {
        setExported(true);
        setTimeout(() => setExported(false), 2000);
      }
    } catch (err) {
      console.error("Failed to export log file:", err);
    } finally {
      setIsExporting(false);
    }
  };

  if (!logFile) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150 select-none">
      <div className="bg-base-100 rounded-2xl border border-base-300 shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-base-200 flex items-center justify-between shrink-0 bg-base-200/40 select-none">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-info/10 text-info flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0 select-none">
              <h3 className="font-bold text-sm text-base-content truncate select-none">
                {logFile.filename}
              </h3>
              <div className="flex items-center gap-2 text-xs text-base-content/60 select-none">
                <span>{formatBytes(logFile.size_bytes)}</span>
                <span>•</span>
                <span>{processedLines.length} lines</span>
                <span>•</span>
                <span>{new Date(logFile.modified_at).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0 select-none">
            <button
              type="button"
              onClick={() => api.openDirectoryInOs(logFile.file_path)}
              className="btn btn-xs btn-ghost gap-1 text-base-content/70 hover:text-base-content"
              title="Reveal in Finder / File Explorer"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Reveal</span>
            </button>

            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting || !content}
              className="btn btn-xs btn-ghost gap-1 text-base-content/70 hover:text-base-content"
              title="Export Log File to OS"
            >
              {exported ? (
                <Check className="w-3.5 h-3.5 text-success" />
              ) : isExporting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">{exported ? "Exported" : "Export"}</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className="btn btn-xs btn-ghost gap-1 text-base-content/70 hover:text-base-content"
              title="Copy entire log to clipboard"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="btn btn-xs btn-circle btn-ghost ml-1"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-5 py-2.5 border-b border-base-200 bg-base-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex-1 min-w-[200px] max-w-md">
            <SearchInput
              inputSize="xs"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onClear={() => setSearchQuery("")}
              placeholder="Filter log lines..."
              className="w-full"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStripAnsi(!stripAnsi)}
              className={`btn btn-xs gap-1.5 rounded-lg ${
                stripAnsi ? "btn-primary" : "btn-ghost border border-base-300"
              }`}
              title="Strip ANSI escape sequences for plain text readability"
            >
              <Code className="w-3 h-3" />
              <span>Clean Text</span>
            </button>

            <button
              type="button"
              onClick={() => setWrapLines(!wrapLines)}
              className={`btn btn-xs gap-1.5 rounded-lg ${
                wrapLines ? "btn-primary" : "btn-ghost border border-base-300"
              }`}
              title="Toggle line wrapping"
            >
              <WrapText className="w-3 h-3" />
              <span>Wrap Lines</span>
            </button>
          </div>
        </div>

        {/* Content Viewer Area */}
        <div className="flex-1 min-h-0 bg-base-300/40 overflow-auto font-mono text-[12px] p-4 select-text">
          {isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-base-content/50 gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
              <p className="text-xs">Loading audit log...</p>
            </div>
          ) : error ? (
            <div className="h-full flex flex-col items-center justify-center text-error gap-2 p-6 text-center">
              <p className="font-semibold text-sm">Failed to read log</p>
              <p className="text-xs max-w-md">{error}</p>
            </div>
          ) : filteredLines.length === 0 ? (
            <div className="h-full flex items-center justify-center text-base-content/40 text-xs">
              {searchQuery ? "No matching lines found." : "This log file is empty."}
            </div>
          ) : (
            <div className="space-y-0.5">
              {filteredLines.map(({ line, originalIndex }) => (
                <div
                  key={originalIndex}
                  className={`flex items-start gap-4 hover:bg-base-200/60 px-1.5 py-0.5 rounded ${
                    wrapLines ? "break-all" : "whitespace-pre"
                  }`}
                >
                  <span className="text-[10px] text-base-content/30 select-none text-right shrink-0 w-10 pt-0.5">
                    {originalIndex}
                  </span>
                  <span className="text-base-content/90 flex-1 leading-relaxed">
                    {line || "\u00A0"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
