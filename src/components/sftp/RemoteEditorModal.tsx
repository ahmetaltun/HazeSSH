import { useState, useEffect, useMemo, useCallback } from "react";
import { FileCode, Save, X, AlertTriangle, Check, WrapText, RotateCcw, Loader2 } from "lucide-react";
import { api } from "@/services/api";
import { detectLanguageName } from "@/utils/codeLanguages";
import { CodeEditor } from "@/components/common/CodeEditor";
import { LanguagePicker } from "@/components/common/LanguagePicker";

interface RemoteEditorModalProps {
  readonly isOpen: boolean;
  readonly mode?: "remote" | "local";
  readonly hostId?: string;
  readonly hostLabel?: string;
  readonly filePath: string;
  readonly fileName: string;
  readonly onClose: () => void;
  readonly onSaved?: () => void;
}

export function RemoteEditorModal({
  isOpen,
  mode = "remote",
  hostId,
  hostLabel,
  filePath,
  fileName,
  onClose,
  onSaved,
}: RemoteEditorModalProps) {
  const [content, setContent] = useState("");
  const [initialContent, setInitialContent] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [lineWrapping, setLineWrapping] = useState(false);
  const [languageOverride, setLanguageOverride] = useState<string>("auto");
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const [isSavingAndClosing, setIsSavingAndClosing] = useState(false);

  const hasUnsavedChanges = content !== initialContent;

  const activeLanguageName = useMemo(
    () => detectLanguageName(fileName, languageOverride),
    [fileName, languageOverride]
  );

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    setIsLoading(true);
    setErrorMsg(null);
    setSaveSuccess(false);
    setLanguageOverride("auto");
    setCursorPos({ line: 1, col: 1 });
    setShowUnsavedDialog(false);
    setIsSavingAndClosing(false);

    const fetchPromise =
      mode === "local" || !hostId
        ? api.sftpLocalReadFile(filePath)
        : api.sftpReadFile(hostId, filePath);

    fetchPromise
      .then((data) => {
        if (isMounted) {
          setContent(data);
          setInitialContent(data);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setErrorMsg(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, mode, hostId, filePath]);

  const handleSave = useCallback(async (): Promise<boolean> => {
    if (isSaving) return false;
    setIsSaving(true);
    setErrorMsg(null);
    try {
      if (mode === "local" || !hostId) {
        await api.sftpLocalWriteFile(filePath, content);
      } else {
        await api.sftpWriteFile(hostId, filePath, content);
      }
      setInitialContent(content);
      setSaveSuccess(true);
      onSaved?.();
      setTimeout(() => setSaveSuccess(false), 3000);
      return true;
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, mode, hostId, filePath, content, onSaved]);

  const handleSafeClose = useCallback(() => {
    if (hasUnsavedChanges) {
      setShowUnsavedDialog(true);
    } else {
      onClose();
    }
  }, [hasUnsavedChanges, onClose]);

  const handleDiscardAndClose = useCallback(() => {
    setShowUnsavedDialog(false);
    onClose();
  }, [onClose]);

  const handleSaveAndClose = useCallback(async () => {
    setIsSavingAndClosing(true);
    const success = await handleSave();
    setIsSavingAndClosing(false);
    if (success) {
      setShowUnsavedDialog(false);
      onClose();
    }
  }, [handleSave, onClose]);

  const handleRevert = useCallback(() => {
    setContent(initialContent);
    setErrorMsg(null);
  }, [initialContent]);

  // Handle Escape key to either close the unsaved confirmation or close the modal
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showUnsavedDialog) {
          if (!isSavingAndClosing) {
            setShowUnsavedDialog(false);
          }
        } else if (!e.defaultPrevented) {
          handleSafeClose();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, showUnsavedDialog, isSavingAndClosing, handleSafeClose]);

  if (!isOpen) return null;

  return (
    <div className="modal modal-open z-50">
      <div className="modal-box bg-base-200 border border-base-300 w-11/12 max-w-5xl h-[85vh] p-0 flex flex-col shadow-2xl rounded-2xl overflow-hidden">
        {/* Editor Top Bar */}
        <div className="h-12 bg-base-300 px-4 border-b border-base-200 flex items-center justify-between select-none shrink-0">
          <div className="flex items-center gap-2 overflow-hidden">
            <FileCode className="w-4 h-4 text-primary shrink-0" />
            <span className="font-bold text-xs truncate max-w-xs">{fileName}</span>
            <LanguagePicker
              selectedLanguage={languageOverride}
              activeLanguageName={activeLanguageName}
              onSelectLanguage={setLanguageOverride}
            />
            {hasUnsavedChanges && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="badge badge-warning badge-xs text-[10px]">Unsaved *</span>
                <button
                  type="button"
                  onClick={handleRevert}
                  className="btn btn-ghost btn-xs text-[10px] h-5 min-h-0 px-1.5 text-base-content/60 hover:text-base-content gap-1"
                  title="Revert all unsaved changes to original content"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Revert</span>
                </button>
              </div>
            )}
            <span className="text-[11px] text-base-content/50 font-mono truncate hidden md:inline">
              ({mode === "local" || !hostLabel ? `Local: ${filePath}` : `${hostLabel}: ${filePath}`})
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Word Wrap Toggle */}
            <button
              type="button"
              onClick={() => setLineWrapping((w) => !w)}
              className={`btn btn-xs gap-1 ${lineWrapping ? "btn-primary" : "btn-ghost"}`}
              title="Toggle Word Wrap"
            >
              <WrapText className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Wrap</span>
            </button>

            {saveSuccess && (
              <span className="text-xs text-success flex items-center gap-1 font-semibold animate-fade-in">
                <Check className="w-3.5 h-3.5" /> Saved!
              </span>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="btn btn-xs btn-primary gap-1"
              title={mode === "local" ? "Save Local File (Cmd+S)" : "Save Remote File (Cmd+S)"}
            >
              <Save className="w-3 h-3" />
              <span>{isSaving ? "Saving..." : "Save (⌘S)"}</span>
            </button>

            <button
              type="button"
              onClick={handleSafeClose}
              className="btn btn-xs btn-ghost btn-square text-base-content/60 hover:text-base-content"
              title="Close Editor"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Error Banner */}
        {errorMsg && (
          <div className="bg-error/15 border-b border-error/30 text-error px-4 py-2 text-xs flex items-center gap-2 shrink-0">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Editor Body */}
        <div className="flex-1 min-h-0 relative bg-base-100 flex flex-col">
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center space-y-2">
              <span className="loading loading-spinner loading-md text-primary" />
              <span className="text-xs text-base-content/60 font-mono">
                {mode === "local"
                  ? "Loading local file content..."
                  : "Downloading file content from remote server..."}
              </span>
            </div>
          ) : (
            <CodeEditor
              value={content}
              onChange={setContent}
              fileName={fileName}
              language={languageOverride}
              readOnly={false}
              lineWrapping={lineWrapping}
              onSave={handleSave}
              onCursorChange={(line, col) => setCursorPos({ line, col })}
              placeholder="Empty file..."
              autoFocus={true}
              className="flex-1 min-h-0 bg-base-100"
            />
          )}
        </div>

        {/* Editor Status Footer */}
        <div className="h-7 bg-base-300 px-4 border-t border-base-200 flex items-center justify-between text-[11px] text-base-content/60 font-mono select-none shrink-0">
          <div className="flex items-center gap-3">
            <span>
              Ln {cursorPos.line}, Col {cursorPos.col}
            </span>
            <span className="opacity-30">•</span>
            <span>
              Lines: {content ? content.split("\n").length : 0} | Characters: {content.length}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-primary font-semibold">{activeLanguageName}</span>
            <span className="opacity-30">•</span>
            <span>UTF-8</span>
            <span className="opacity-30">•</span>
            <span>Tab: 2 spaces</span>
          </div>
        </div>
      </div>
      <div className="modal-backdrop bg-black/70" onClick={handleSafeClose} />

      {/* In-App Unsaved Changes Confirmation Modal */}
      {showUnsavedDialog && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="bg-base-200 border border-base-300 rounded-2xl p-5 max-w-md w-full shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-xl bg-warning/15 text-warning flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-sm text-base-content leading-snug">
                  Unsaved Changes
                </h3>
                <p className="text-xs text-base-content/70 mt-1.5 leading-relaxed">
                  You have unsaved changes in{" "}
                  <span className="font-mono font-semibold text-base-content">&ldquo;{fileName}&rdquo;</span>.
                  Do you want to save your changes before closing?
                </p>
                <div className="mt-2 text-[11px] font-mono text-base-content/50 truncate">
                  Target: {mode === "local" || !hostLabel ? "Local" : hostLabel} ({filePath})
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowUnsavedDialog(false)}
                disabled={isSavingAndClosing}
                className="btn btn-xs btn-ghost border border-base-300 text-xs px-3"
              >
                Keep Editing
              </button>
              <button
                type="button"
                onClick={handleDiscardAndClose}
                disabled={isSavingAndClosing}
                className="btn btn-xs btn-error btn-outline text-xs px-3"
              >
                Discard & Close
              </button>
              <button
                type="button"
                onClick={handleSaveAndClose}
                disabled={isSavingAndClosing || isSaving}
                className="btn btn-xs btn-primary text-xs px-3 gap-1.5 shadow-xs"
              >
                {isSavingAndClosing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save & Close</span>
                  </>
                )}
              </button>
            </div>
          </div>
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity -z-10"
            onClick={() => {
              if (!isSavingAndClosing) setShowUnsavedDialog(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
