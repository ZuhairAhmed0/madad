import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";

const ToastContext = createContext(null);

const ALERT_CLASS_BY_TYPE = {
  success: "alert-success",
  error: "alert-error",
  warning: "alert-warning",
  info: "alert-info",
};

const ICON_BY_TYPE = {
  success: CheckCircle2,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

const DEFAULT_TOAST_DURATION_MS = 4000;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idCounterRef = useRef(0);
  const timersRef = useRef(new Map());

  const dismissToast = useCallback((id) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const addToast = useCallback(
    (type, message, durationMs = DEFAULT_TOAST_DURATION_MS) => {
      if (!message) return null;

      idCounterRef.current += 1;
      const id = `toast-${Date.now()}-${idCounterRef.current}`;

      setToasts((prev) => [...prev, { id, type, message }]);

      if (durationMs > 0) {
        const timer = setTimeout(() => {
          timersRef.current.delete(id);
          setToasts((prev) => prev.filter((item) => item.id !== id));
        }, durationMs);
        timersRef.current.set(id, timer);
      }

      return id;
    },
    []
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      toasts,
      addToast,
      dismissToast,
      success: (msg, ms) => addToast("success", msg, ms),
      error: (msg, ms) => addToast("error", msg, ms),
      warning: (msg, ms) => addToast("warning", msg, ms),
      info: (msg, ms) => addToast("info", msg, ms),
    }),
    [toasts, addToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="toast toast-bottom toast-end z-50 max-w-sm"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const alertClass =
            ALERT_CLASS_BY_TYPE[toast.type] || ALERT_CLASS_BY_TYPE.info;
          const IconComponent = ICON_BY_TYPE[toast.type] || Info;

          return (
            <div
              key={toast.id}
              role="status"
              className={`alert ${alertClass} shadow-lg flex items-start gap-2.5 text-sm`}
            >
              <IconComponent className="w-5 h-5 shrink-0 mt-0.5" />
              <span className="flex-1 leading-relaxed">{toast.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="btn btn-ghost btn-xs btn-circle shrink-0"
                aria-label="إغلاق التنبيه"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

/** Access application toast notification helpers. */
export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}
