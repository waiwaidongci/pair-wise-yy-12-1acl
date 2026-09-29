import { useEffect } from "react";

export type ToastKind = "success" | "error" | "info";

export interface ToastData {
  id: number;
  kind: ToastKind;
  message: string;
}

export function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: ToastData[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toast-stack">
      {toasts.map((t) => (
        <Toast key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastData;
  onDismiss: (id: number) => void;
}) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(toast.id), 4200);
    return () => clearTimeout(timer);
  }, [toast.id, onDismiss]);

  return (
    <div className={`toast toast-${toast.kind}`} role="status">
      <span className="toast-icon">
        {toast.kind === "success" ? "✓" : toast.kind === "error" ? "!" : "i"}
      </span>
      <span className="toast-msg">{toast.message}</span>
      <button
        className="toast-close"
        onClick={() => onDismiss(toast.id)}
        aria-label="关闭提示"
      >
        ×
      </button>
    </div>
  );
}
