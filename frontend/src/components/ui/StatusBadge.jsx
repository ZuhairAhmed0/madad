/** Render a localized DaisyUI status badge from a constants lookup map. */
export default function StatusBadge({
  map,
  value,
  fallbackLabel = "—",
  className = "",
}) {
  const entry = map?.[value];
  const label = entry?.label || value || fallbackLabel;
  const badgeClass = entry?.badgeClass || "badge-ghost";

  return (
    <span
      className={`badge badge-sm rounded-full ring-1 ring-inset ring-current/10 font-semibold whitespace-nowrap ${badgeClass} ${className}`}
    >
      {label}
    </span>
  );
}
