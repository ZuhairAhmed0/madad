import { useEffect, useRef } from "react";

/** Accessible DaisyUI dialog modal for confirming sensitive or destructive actions. */
export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  confirmVariant = "btn-primary",
  loading = false,
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleDialogCancel = (event) => {
    event.preventDefault();
    if (!loading && onCancel) {
      onCancel();
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={handleDialogCancel}
      className="modal modal-bottom sm:modal-middle"
    >
      <div className="modal-box border border-slate-200/90 p-6">
        <h3 className="font-bold text-lg text-slate-900">{title}</h3>
        {message && (
          <p className="py-3 text-sm text-slate-600 leading-relaxed">
            {message}
          </p>
        )}
        <div className="modal-action">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${confirmVariant}`}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading && <span className="loading loading-spinner loading-xs" />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
      <form
        method="dialog"
        className="modal-backdrop"
        onSubmit={(e) => {
          e.preventDefault();
          if (!loading && onCancel) onCancel();
        }}
      >
        <button type="submit" aria-label="إغلاق">
          close
        </button>
      </form>
    </dialog>
  );
}
