import { useEffect, useState } from "react";
import { AlertTriangle, Clock } from "lucide-react";
import { getCountdownState } from "../../lib/format";

/** Live 1-second countdown badge displaying remaining order confirmation window. */
export default function CountdownTimer({ expiresAt, className = "" }) {
  const [countdown, setCountdown] = useState(() => getCountdownState(expiresAt));

  useEffect(() => {
    const initial = getCountdownState(expiresAt);
    setCountdown(initial);

    if (initial.expired) {
      return undefined;
    }

    const timer = setInterval(() => {
      const next = getCountdownState(expiresAt);
      setCountdown(next);
      if (next.expired) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt]);

  if (countdown.expired) {
    return (
      <span
        className={`badge badge-sm badge-neutral gap-1 whitespace-nowrap ${className}`}
      >
        <Clock className="w-3 h-3" />
        <span>{countdown.text}</span>
      </span>
    );
  }

  return (
    <span
      className={`badge badge-sm rounded-full ring-1 ring-inset ring-current/15 gap-1.5 whitespace-nowrap font-semibold ${
        countdown.urgent ? "badge-error" : "badge-warning"
      } ${className}`}
    >
      {countdown.urgent ? (
        <AlertTriangle className="w-3 h-3" />
      ) : (
        <Clock className="w-3 h-3" />
      )}
      <span dir="ltr" className="tabular-nums">
        {countdown.text}
      </span>
    </span>
  );
}
