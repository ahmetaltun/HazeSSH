import { useState, useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  X,
  FileCode,
  FileText,
  Image as ImageIcon,
  FileQuestion,
  FilePenLine,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Copy,
  Check,
  Download,
  AlertTriangle,
  File,
  Eye,
  Code,
} from "lucide-react";
import { api } from "@/services/api";
import type { FileEntry } from "@/types/sftp";
import {
  getFileCategory,
  getLanguageLabel,
  getMimeType,
  isEditableText,
} from "@/utils/fileTypes";

interface FilePreviewModalProps {
  readonly isOpen: boolean;
  readonly file: FileEntry | null;
  readonly mode: "remote" | "local";
  readonly hostId?: string;
  readonly hostLabel?: string;
  readonly onClose: () => void;
  readonly onOpenInEditor?: (file: FileEntry) => void;
  readonly onTransfer?: (file: FileEntry) => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

function formatDate(epochSec: number): string {
  if (!epochSec) return "-";
  return new Date(epochSec * 1000).toLocaleString();
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const byteChars = atob(base64);
  const byteNums = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) {
    byteNums[i] = byteChars.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNums);
  return new Blob([byteArray], { type: mimeType });
}

// Lightweight, safe React Markdown parser without external dependencies
function renderSimpleMarkdown(md: string): ReactNode[] {
  const lines = md.split("\n");
  const nodes: ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeLang = "";

  lines.forEach((line, index) => {
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        nodes.push(
          <div key={`codeblock-${index}`} className="my-2 rounded bg-base-300 p-3 font-mono text-xs overflow-x-auto text-base-content border border-base-content/10">
            {codeLang && <div className="text-[10px] text-base-content/50 uppercase font-bold mb-1">{codeLang}</div>}
            <pre><code>{codeBuffer.join("\n")}</code></pre>
          </div>
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLang = line.trim().slice(3).trim();
      }
      return;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      return;
    }

    // Headers
    if (line.startsWith("# ")) {
      nodes.push(<h1 key={index} className="text-xl font-bold border-b border-base-300 pb-1 mt-4 mb-2 text-primary">{line.slice(2)}</h1>);
      return;
    }
    if (line.startsWith("## ")) {
      nodes.push(<h2 key={index} className="text-lg font-bold border-b border-base-300/50 pb-1 mt-3 mb-2">{line.slice(3)}</h2>);
      return;
    }
    if (line.startsWith("### ")) {
      nodes.push(<h3 key={index} className="text-base font-semibold mt-2 mb-1 text-secondary">{line.slice(4)}</h3>);
      return;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      nodes.push(
        <blockquote key={index} className="border-l-4 border-primary/50 pl-3 py-1 my-1 italic text-base-content/80 bg-base-200/40 rounded-r">
          {line.slice(2)}
        </blockquote>
      );
      return;
    }

    // List item
    if (line.trim().startsWith("- ") || line.trim().startsWith("* ")) {
      nodes.push(
        <li key={index} className="ml-5 list-disc my-0.5 text-xs text-base-content/90">
          {renderInlineFormatting(line.trim().slice(2))}
        </li>
      );
      return;
    }

    // Empty lines
    if (!line.trim()) {
      nodes.push(<div key={index} className="h-2" />);
      return;
    }

    // Normal paragraph
    nodes.push(
      <p key={index} className="my-1 text-xs leading-relaxed text-base-content/90">
        {renderInlineFormatting(line)}
      </p>
    );
  });

  return nodes;
}

function renderInlineFormatting(text: string): ReactNode {
  // Simple inline code & bold rendering
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return (
        <code key={i} className="px-1 py-0.5 bg-base-300 rounded font-mono text-[11px] text-primary">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="font-semibold text-base-content">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

interface CodeViewerProps {
  readonly content: string;
}

function CodeViewer({ content }: CodeViewerProps) {
  const lines = useMemo(() => content.split("\n"), [content]);

  return (
    <div className="flex-1 min-h-0 font-mono text-xs overflow-auto bg-base-200/30 rounded-xl border border-base-300">
      <div className="flex min-w-full w-max">
        {/* Sticky line numbers column */}
        <div className="sticky left-0 z-10 py-3 pl-3 pr-2.5 select-none text-right text-base-content/30 border-r border-base-300 bg-base-200 text-[11px] leading-5 shrink-0 tabular-nums">
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
        {/* Code text */}
        <pre
          className="py-3 pl-4 pr-6 select-text whitespace-pre leading-5 flex-1 text-base-content/90 font-mono text-xs m-0 bg-transparent"
          style={{ tabSize: 2 }}
        >
          {content}
        </pre>
      </div>
    </div>
  );
}

export function FilePreviewModal({
  isOpen,
  file,
  mode,
  hostId,
  hostLabel,
  onClose,
  onOpenInEditor,
  onTransfer,
}: FilePreviewModalProps) {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // Markdown view state
  const [mdViewMode, setMdViewMode] = useState<"rendered" | "raw">("rendered");

  // Image controls
  const [imgZoom, setImgZoom] = useState(1);
  const [imgDimensions, setImgDimensions] = useState<{ w: number; h: number } | null>(null);

  const previewType = useMemo(() => (file ? getFileCategory(file.name) : "binary"), [file]);
  const mimeType = useMemo(() => (file ? getMimeType(file.name) : ""), [file]);
  const languageLabel = useMemo(() => (file ? getLanguageLabel(file.name) : ""), [file]);
  const isEditable = useMemo(() => (file ? isEditableText(file.name) : false), [file]);

  const activeUrlRef = useRef<string | null>(null);

  // Cleanup object URLs to avoid memory leaks
  useEffect(() => {
    return () => {
      if (activeUrlRef.current) {
        URL.revokeObjectURL(activeUrlRef.current);
        activeUrlRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isOpen || !file) return;

    // Reset state
    setLoading(true);
    setErrorMsg(null);
    setImgZoom(1);
    setImgDimensions(null);
    if (activeUrlRef.current) {
      URL.revokeObjectURL(activeUrlRef.current);
      activeUrlRef.current = null;
      setBlobUrl(null);
    }

    if (previewType === "binary") {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const loadContent = async () => {
      try {
        if (previewType === "image" || previewType === "pdf" || previewType === "media") {
          const base64 =
            mode === "remote" && hostId
              ? await api.sftpReadBinary(hostId, file.path)
              : await api.sftpLocalReadBinary(file.path);

          if (!isMounted) return;
          const blob = base64ToBlob(base64, mimeType);
          const url = URL.createObjectURL(blob);
          activeUrlRef.current = url;
          setBlobUrl(url);
          setLoading(false);
        } else {
          // Code / Markdown / Text
          let text = "";
          if (mode === "remote" && hostId) {
            text = await api.sftpReadFile(hostId, file.path);
          } else {
            text = await api.sftpLocalReadFile(file.path);
          }
          if (!isMounted) return;
          setTextContent(text);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setErrorMsg(err instanceof Error ? err.message : String(err));
          setLoading(false);
        }
      }
    };

    loadContent();

    return () => {
      isMounted = false;
    };
  }, [isOpen, file, mode, hostId, previewType, mimeType]);

  if (!isOpen || !file) return null;

  const handleCopyText = async () => {
    if (textContent) {
      await navigator.clipboard.writeText(textContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-base-100 border border-base-300 w-full max-w-4xl h-[85vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="h-14 px-4 bg-base-200/70 border-b border-base-300 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="p-2 bg-primary/10 rounded-lg text-primary shrink-0">
              {previewType === "image" ? (
                <ImageIcon className="w-5 h-5" />
              ) : previewType === "pdf" ? (
                <File className="w-5 h-5 text-error" />
              ) : previewType === "markdown" ? (
                <FileText className="w-5 h-5 text-secondary" />
              ) : previewType === "code" ? (
                <FileCode className="w-5 h-5 text-info" />
              ) : (
                <FileQuestion className="w-5 h-5 text-base-content/60" />
              )}
            </div>
            <div className="flex flex-col overflow-hidden">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm truncate">{file.name}</span>
                {languageLabel && (
                  <span className="badge badge-sm badge-outline font-mono text-[10px] text-primary border-primary/30 shrink-0">
                    {languageLabel}
                  </span>
                )}
              </div>
              <span className="text-[10px] text-base-content/50 truncate font-mono">
                {mode === "remote" && hostLabel ? `[${hostLabel}] ` : ""}
                {file.path} • {formatBytes(file.size)}
                {imgDimensions ? ` • ${imgDimensions.w} × ${imgDimensions.h} px` : ""}
                {(previewType === "code" || (previewType === "markdown" && mdViewMode === "raw")) && textContent ? ` • ${textContent.split("\n").length} lines` : ""}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {/* Markdown View Toggle */}
            {previewType === "markdown" && (
              <div className="join mr-2">
                <button
                  type="button"
                  onClick={() => setMdViewMode("rendered")}
                  className={`btn btn-xs join-item ${mdViewMode === "rendered" ? "btn-primary" : "btn-ghost"}`}
                >
                  <Eye className="w-3 h-3 mr-1" />
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => setMdViewMode("raw")}
                  className={`btn btn-xs join-item ${mdViewMode === "raw" ? "btn-primary" : "btn-ghost"}`}
                >
                  <Code className="w-3 h-3 mr-1" />
                  Source
                </button>
              </div>
            )}

            {/* Image Zoom Controls */}
            {previewType === "image" && blobUrl && (
              <div className="flex items-center gap-1 mr-2 bg-base-300/40 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setImgZoom((z) => Math.max(0.25, z - 0.25))}
                  className="btn btn-ghost btn-xs btn-square"
                  title="Zoom Out"
                >
                  <ZoomOut className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] font-mono w-10 text-center">
                  {Math.round(imgZoom * 100)}%
                </span>
                <button
                  type="button"
                  onClick={() => setImgZoom((z) => Math.min(4, z + 0.25))}
                  className="btn btn-ghost btn-xs btn-square"
                  title="Zoom In"
                >
                  <ZoomIn className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setImgZoom(1)}
                  className="btn btn-ghost btn-xs btn-square"
                  title="Reset Zoom"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Copy Text Action */}
            {(previewType === "code" || (previewType === "markdown" && mdViewMode === "raw")) && textContent && (
              <button
                type="button"
                onClick={handleCopyText}
                className="btn btn-ghost btn-xs gap-1"
                title="Copy contents"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
              </button>
            )}

            {/* Open in Editor button */}
            {isEditable && onOpenInEditor && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenInEditor(file);
                }}
                className="btn btn-info btn-xs gap-1"
              >
                <FilePenLine className="w-3.5 h-3.5" />
                <span>Open in Editor</span>
              </button>
            )}

            {/* Transfer / Download button */}
            {onTransfer && (
              <button
                type="button"
                onClick={() => onTransfer(file)}
                className="btn btn-ghost btn-xs btn-square"
                title={mode === "remote" ? "Download file" : "Upload file"}
              >
                <Download className="w-3.5 h-3.5 text-secondary" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="btn btn-ghost btn-xs btn-square ml-1"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 min-h-0 p-4 bg-base-100 flex flex-col relative overflow-hidden">
          {loading ? (
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center space-y-3">
              <span className="loading loading-spinner loading-md text-primary" />
              <span className="text-xs text-base-content/60 font-mono">Loading preview...</span>
            </div>
          ) : errorMsg ? (
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 text-center">
              <AlertTriangle className="w-10 h-10 text-error mb-2 opacity-80" />
              <p className="text-sm font-semibold text-error mb-1">Cannot Preview File</p>
              <p className="text-xs text-base-content/60 max-w-md font-mono">{errorMsg}</p>
            </div>
          ) : previewType === "image" && blobUrl ? (
            <div className="flex-1 min-h-0 flex items-center justify-center overflow-auto">
              <img
                src={blobUrl}
                alt={file.name}
                style={{ transform: `scale(${imgZoom})`, transformOrigin: "center" }}
                className="max-h-[70vh] max-w-full object-contain rounded-lg shadow-md transition-transform duration-100"
                onLoad={(e) => {
                  const target = e.currentTarget;
                  setImgDimensions({ w: target.naturalWidth, h: target.naturalHeight });
                }}
              />
            </div>
          ) : previewType === "pdf" && blobUrl ? (
            <div className="flex-1 min-h-0 w-full h-full rounded-xl overflow-hidden border border-base-300">
              <object
                data={blobUrl}
                type="application/pdf"
                className="w-full h-full"
              >
                <div className="flex flex-col items-center justify-center h-full p-4 space-y-2">
                  <p className="text-xs text-base-content/60">PDF viewer could not embed directly.</p>
                  <a href={blobUrl} download={file.name} className="btn btn-primary btn-xs">
                    Download PDF
                  </a>
                </div>
              </object>
            </div>
          ) : previewType === "media" && blobUrl ? (
            <div className="flex-1 min-h-0 flex items-center justify-center p-4">
              {mimeType.startsWith("video") ? (
                <video
                  controls
                  src={blobUrl}
                  className="max-h-[65vh] max-w-full rounded-xl shadow-lg border border-base-300"
                />
              ) : (
                <div className="bg-base-200 p-6 rounded-2xl border border-base-300 flex flex-col items-center space-y-4">
                  <span className="text-xs font-mono text-base-content/60">{file.name}</span>
                  <audio controls src={blobUrl} className="w-72" />
                </div>
              )}
            </div>
          ) : previewType === "markdown" ? (
            mdViewMode === "rendered" ? (
              <div className="flex-1 min-h-0 overflow-y-auto w-full">
                <div className="max-w-3xl mx-auto w-full prose prose-sm dark:prose-invert py-2 px-4 font-sans">
                  {renderSimpleMarkdown(textContent)}
                </div>
              </div>
            ) : (
              <CodeViewer content={textContent} />
            )
          ) : previewType === "code" ? (
            <CodeViewer content={textContent} />
          ) : (
            /* Unsupported / Binary fallback */
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 text-center space-y-4 overflow-y-auto">
              <div className="p-4 bg-base-200 rounded-full border border-base-300">
                <FileQuestion className="w-12 h-12 text-base-content/40" />
              </div>
              <div>
                <h4 className="font-bold text-sm">{file.name}</h4>
                <p className="text-xs text-base-content/50 mt-1">
                  Preview is not available for this binary format ({file.name.split(".").pop() || "unknown"}).
                </p>
              </div>

              <div className="bg-base-200/60 rounded-xl p-3 border border-base-300 text-left text-xs font-mono space-y-1.5 w-full max-w-sm">
                <div className="flex justify-between">
                  <span className="text-base-content/50">File Size:</span>
                  <span>{formatBytes(file.size)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-content/50">Permissions:</span>
                  <span>{file.permissions}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-base-content/50">Last Modified:</span>
                  <span>{formatDate(file.modified)}</span>
                </div>
              </div>

              {onTransfer && (
                <button
                  type="button"
                  onClick={() => onTransfer(file)}
                  className="btn btn-primary btn-sm gap-2"
                >
                  <Download className="w-4 h-4" />
                  <span>{mode === "remote" ? "Download to View" : "Upload to Remote"}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
