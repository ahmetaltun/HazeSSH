import { useState, useRef, type ChangeEvent, type DragEvent } from "react";
import { Upload, FileKey, X, Lock } from "lucide-react";
import { inspectKeyFormat, type KeyInspectionResult } from "@/utils/keyUtils";

interface KeyFileDropzoneProps {
  readonly onKeyLoaded: (content: string, filename: string, inspection: KeyInspectionResult) => void;
  readonly onError: (errorMsg: string) => void;
  readonly selectedFileName?: string | null;
  readonly formatLabel?: string;
  readonly isEncrypted?: boolean;
  readonly onClear?: () => void;
}

export function KeyFileDropzone({
  onKeyLoaded,
  onError,
  selectedFileName,
  formatLabel,
  isEncrypted,
  onClear,
}: KeyFileDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processFile = (file: File) => {
    // 500 KB limit for an SSH key is plenty (normal keys are 0.5KB - 4KB)
    if (file.size > 500 * 1024) {
      onError("The selected file is too large to be an SSH private key (max 500KB).");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) {
        onError("Failed to read the file content. Please try another file.");
        return;
      }

      const inspection = inspectKeyFormat(content, file.name);
      if (!inspection.isValid) {
        onError(inspection.error || "The selected file is not a valid SSH private key.");
        return;
      }

      onKeyLoaded(content, file.name, inspection);
    };

    reader.onerror = () => {
      onError("An error occurred while reading the file. Please check file permissions.");
    };

    reader.readAsText(file);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
    // Reset file input so selecting the same file again triggers change event
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  if (selectedFileName) {
    return (
      <div className="flex items-center justify-between p-3 rounded-xl bg-base-100 border border-base-300">
        <div className="flex items-center gap-2.5 overflow-hidden">
          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <FileKey className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold truncate font-mono text-base-content">
                {selectedFileName}
              </span>
              {isEncrypted && (
                <span className="badge badge-warning badge-xs gap-1 py-1 font-sans">
                  <Lock className="w-2.5 h-2.5" />
                  Passphrase Protected
                </span>
              )}
            </div>
            {formatLabel && (
              <span className="text-[11px] text-base-content/60 block">
                {formatLabel}
              </span>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={onClear}
          className="btn btn-ghost btn-xs btn-circle text-base-content/60 hover:text-error"
          title="Remove file"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
      className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
        isDragging
          ? "border-primary bg-primary/10"
          : "border-base-300 hover:border-primary/50 hover:bg-base-100/50"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        onChange={handleFileChange}
        className="hidden"
        accept=".pem,.key,.priv,.txt,*"
      />
      <div className="flex flex-col items-center justify-center gap-1.5">
        <div className="w-8 h-8 rounded-full bg-base-300/60 text-base-content/70 flex items-center justify-center">
          <Upload className="w-4 h-4" />
        </div>
        <div className="text-xs">
          <span className="font-semibold text-primary">Click to browse</span> or drag & drop key file
        </div>
        <div className="text-[11px] text-base-content/50">
          OpenSSH, PEM, PKCS#8 (<span className="font-mono">.pem</span>, <span className="font-mono">.key</span>, <span className="font-mono">id_ed25519</span>, etc.)
        </div>
      </div>
    </div>
  );
}
