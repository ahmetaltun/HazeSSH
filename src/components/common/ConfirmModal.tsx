import { useEffect, useRef } from "react";
import { AlertTriangle, Trash2, Info, Loader2 } from "lucide-react";

export interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "primary";
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // Focus confirm button or trap Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isLoading) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  const getVariantStyles = () => {
    switch (variant) {
      case "danger":
        return {
          icon: <Trash2 className="w-5 h-5 text-error" />,
          iconBg: "bg-error/15 text-error",
          confirmBtn: "btn-error",
        };
      case "warning":
        return {
          icon: <AlertTriangle className="w-5 h-5 text-warning" />,
          iconBg: "bg-warning/15 text-warning",
          confirmBtn: "btn-warning",
        };
      case "primary":
      default:
        return {
          icon: <Info className="w-5 h-5 text-primary" />,
          iconBg: "bg-primary/15 text-primary",
          confirmBtn: "btn-primary",
        };
    }
  };

  const { icon, iconBg, confirmBtn } = getVariantStyles();

  return (
    <div className="modal modal-open z-50">
      <div className="modal-box bg-base-200 border border-base-300 max-w-sm shadow-2xl p-5 select-none animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-start gap-3.5">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-sm text-base-content leading-snug">{title}</h3>
            <div className="text-xs text-base-content/70 mt-1.5 leading-relaxed">{message}</div>
          </div>
        </div>

        <div className="modal-action mt-6 gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="btn btn-xs btn-ghost border border-base-300 text-xs px-3"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmButtonRef}
            type="button"
            onClick={() => void onConfirm()}
            disabled={isLoading}
            className={`btn btn-xs ${confirmBtn} text-xs px-3 gap-1.5 shadow-xs`}
          >
            {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
      <div
        className="modal-backdrop bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={() => {
          if (!isLoading) onCancel();
        }}
      />
    </div>
  );
}
