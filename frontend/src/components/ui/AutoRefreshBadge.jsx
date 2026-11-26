import { RefreshCw } from "lucide-react";

const clockFormatter = new Intl.DateTimeFormat("ar-SD", {
  hour: "2-digit",
  minute: "2-digit",
  numberingSystem: "latn",
});

function formatClock(dateInput) {
  if (!dateInput) return null;
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  return clockFormatter.format(date);
}

/**
 * Subtle header indicator communicating automatic background sync status without layout shift.
 */
export default function AutoRefreshBadge({
  isRefreshing = false,
  lastUpdatedAt = null,
  paused = false,
  className = "",
}) {
  const timeText = formatClock(lastUpdatedAt);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium whitespace-nowrap ${
        isRefreshing
          ? "border-emerald-200 bg-emerald-50/80 text-emerald-800"
          : paused
            ? "border-amber-200 bg-amber-50/70 text-amber-800"
            : "border-base-200 bg-base-100/90 text-slate-500"
      } ${className}`}
    >
      {isRefreshing ? (
        <>
          <RefreshCw className="w-3 h-3 animate-spin text-emerald-600 shrink-0" />
          <span>جارٍ المزامنة...</span>
        </>
      ) : paused ? (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
          <span>المزامنة متوقفة مؤقتاً</span>
        </>
      ) : (
        <>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
          <span>تحديث تلقائي كل دقيقتين</span>
          {timeText && (
            <span className="text-slate-400 tabular-nums">· {timeText}</span>
          )}
        </>
      )}
    </span>
  );
}
