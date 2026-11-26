const sdgNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  numberingSystem: "latn",
});

const percentNumberFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 2,
  numberingSystem: "latn",
});

const dateTimeFormatter = new Intl.DateTimeFormat("ar-SD", {
  dateStyle: "medium",
  timeStyle: "short",
  numberingSystem: "latn",
});

function padTwoDigits(num) {
  return String(num).padStart(2, "0");
}

/** Format an integer SDG amount with Western thousands separators and currency suffix. */
export function formatSdg(amount) {
  if (amount === null || amount === undefined || amount === "") {
    return "—";
  }

  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) {
    return "—";
  }

  return `${sdgNumberFormatter.format(Math.round(numeric))} ج.س`;
}

/** Format a percentage number/string with an explicit positive sign when > 0. */
export function formatPercent(value) {
  if (value === null || value === undefined || value === "") {
    return "—";
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "—";
  }

  if (Object.is(numeric, -0) || numeric === 0) {
    return "0%";
  }

  const prefix = numeric > 0 ? "+" : "";
  return `${prefix}${percentNumberFormatter.format(numeric)}%`;
}

/** Format a timestamp into a concise Arabic relative string using Western digits. */
export function formatRelativeTime(dateInput) {
  if (!dateInput) {
    return "—";
  }

  const parsed = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const timeMs = parsed.getTime();
  if (Number.isNaN(timeMs)) {
    return "—";
  }

  const diffSeconds = Math.max(0, Math.floor((Date.now() - timeMs) / 1000));
  if (diffSeconds < 60) {
    return "الآن";
  }

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) {
    if (diffMinutes === 1) return "منذ دقيقة";
    if (diffMinutes === 2) return "منذ دقيقتين";
    if (diffMinutes <= 10) return `منذ ${diffMinutes} دقائق`;
    return `منذ ${diffMinutes} دقيقة`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    if (diffHours === 1) return "منذ ساعة";
    if (diffHours === 2) return "منذ ساعتين";
    if (diffHours <= 10) return `منذ ${diffHours} ساعات`;
    return `منذ ${diffHours} ساعة`;
  }

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "منذ يوم";
  if (diffDays === 2) return "منذ يومين";
  if (diffDays <= 10) return `منذ ${diffDays} أيام`;
  return `منذ ${diffDays} يوماً`;
}

/** Format a date/time with Arabic month labels and Western Latin numerals. */
export function formatDateTime(dateInput) {
  if (!dateInput) {
    return "—";
  }

  const parsed = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }

  return dateTimeFormatter.format(parsed);
}

/** Compute remaining countdown clock string and urgency flag (< 10 minutes remaining). */
export function getCountdownState(expiresAt) {
  if (!expiresAt) {
    return {
      expired: true,
      text: "منتهية المهلة",
      urgent: false,
      remainingMs: 0,
    };
  }

  const targetMs = new Date(expiresAt).getTime();
  if (Number.isNaN(targetMs)) {
    return {
      expired: true,
      text: "منتهية المهلة",
      urgent: false,
      remainingMs: 0,
    };
  }

  const remainingMs = targetMs - Date.now();
  if (remainingMs <= 0) {
    return {
      expired: true,
      text: "منتهية المهلة",
      urgent: false,
      remainingMs: 0,
    };
  }

  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const text =
    hours > 0
      ? `${padTwoDigits(hours)}:${padTwoDigits(minutes)}:${padTwoDigits(seconds)}`
      : `${padTwoDigits(minutes)}:${padTwoDigits(seconds)}`;

  return {
    expired: false,
    text,
    urgent: remainingMs < 10 * 60 * 1000,
    remainingMs,
  };
}
