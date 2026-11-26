import { useCallback, useEffect, useRef, useState } from "react";
import { AUTO_REFRESH_INTERVAL_MS } from "../lib/constants";

/**
 * Low-bandwidth-safe periodic background refresh hook.
 *
 * - Polls every `intervalMs` (defaults to 2 minutes / 120,000 ms) ONLY when `enabled`,
 *   the tab is visible, and the browser reports connectivity.
 * - Optionally refreshes when returning to the tab (`visibilitychange` / `focus`) or
 *   regaining connectivity (`online`), deduplicated by `minGapMs` (default 5,000 ms).
 * - Guarantees no overlapping in-flight requests and always resets `inFlightRef` in `finally`.
 */
export function useAutoRefresh(
  refreshFn,
  {
    intervalMs = AUTO_REFRESH_INTERVAL_MS,
    enabled = true,
    refreshOnFocus = true,
    minGapMs = 5_000,
  } = {}
) {
  const fnRef = useRef(refreshFn);
  const enabledRef = useRef(enabled);
  const inFlightRef = useRef(false);
  const lastTriggeredRef = useRef(Date.now());
  const mountedRef = useRef(true);

  const [isBackgroundRefreshing, setIsBackgroundRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState(() => new Date());

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    fnRef.current = refreshFn;
  }, [refreshFn]);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const markRefreshed = useCallback((timestamp = Date.now()) => {
    lastTriggeredRef.current = timestamp;
    if (mountedRef.current) {
      setLastRefreshedAt(new Date(timestamp));
    }
  }, []);

  const runRefresh = useCallback(
    async ({ ignoreGap = false } = {}) => {
      if (!enabledRef.current) return false;
      if (
        typeof document !== "undefined" &&
        document.visibilityState !== "visible"
      ) {
        return false;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return false;
      }
      if (inFlightRef.current) return false;

      const now = Date.now();
      if (!ignoreGap && now - lastTriggeredRef.current < minGapMs) {
        return false;
      }

      inFlightRef.current = true;
      lastTriggeredRef.current = now;
      if (mountedRef.current) {
        setIsBackgroundRefreshing(true);
      }

      try {
        const result = await fnRef.current?.();
        if (result !== false && mountedRef.current) {
          setLastRefreshedAt(new Date());
        }
        return result !== false;
      } catch {
        // Silent background refresh must never surface unhandled rejections or crash timers.
        return false;
      } finally {
        inFlightRef.current = false;
        if (mountedRef.current) {
          setIsBackgroundRefreshing(false);
        }
      }
    },
    [minGapMs]
  );

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return undefined;
    }

    const timer = window.setInterval(() => {
      void runRefresh({ ignoreGap: false });
    }, intervalMs);

    if (!refreshOnFocus || typeof document === "undefined") {
      return () => {
        window.clearInterval(timer);
      };
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void runRefresh({ ignoreGap: false });
      }
    };

    const handleFocus = () => {
      void runRefresh({ ignoreGap: false });
    };

    const handleOnline = () => {
      void runRefresh({ ignoreGap: true });
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleFocus);
    window.addEventListener("online", handleOnline);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleFocus);
      window.removeEventListener("online", handleOnline);
    };
  }, [enabled, intervalMs, refreshOnFocus, runRefresh]);

  return {
    isBackgroundRefreshing,
    lastRefreshedAt,
    markRefreshed,
  };
}
