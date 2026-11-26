import { AlertCircle, Inbox } from "lucide-react";

/** Reusable centered loading, empty, or error state card with optional action CTA. */
export default function EmptyState({
  icon: IconComponent,
  title,
  description,
  loading = false,
  error = false,
  actionLabel,
  onAction,
  className = "",
}) {
  if (loading) {
    return (
      <div
        className={`rounded-2xl border border-base-200 bg-base-100 p-10 flex flex-col items-center justify-center text-center gap-3 ${className}`}
      >
        <span className="loading loading-spinner loading-md text-primary" />
        <p className="text-sm font-medium text-slate-600">
          {title || "جارٍ تحميل البيانات..."}
        </p>
      </div>
    );
  }

  const DisplayIcon = IconComponent || (error ? AlertCircle : Inbox);

  return (
    <div
      className={`rounded-2xl border ${
        error ? "border-error/30 bg-error/5" : "border-base-200 bg-base-100"
      } p-8 sm:p-10 flex flex-col items-center justify-center text-center gap-3 ${className}`}
    >
      <div
        className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
          error
            ? "bg-error/15 text-error"
            : "bg-emerald-50 text-emerald-700 border border-emerald-100"
        }`}
      >
        <DisplayIcon className="w-6 h-6" />
      </div>
      {title && (
        <h3 className="text-base font-bold text-slate-900">{title}</h3>
      )}
      {description && (
        <p className="text-sm text-slate-600 max-w-md leading-relaxed">
          {description}
        </p>
      )}
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className={`btn btn-sm mt-1 ${error ? "btn-error" : "btn-primary"}`}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
