import { useCallback, useEffect, useRef, useState } from "react";
import { ClipboardList, MapPin, RefreshCw, XCircle } from "lucide-react";
import AutoRefreshBadge from "../../components/ui/AutoRefreshBadge";
import ConfirmModal from "../../components/ui/ConfirmModal";
import CountdownTimer from "../../components/ui/CountdownTimer";
import EmptyState from "../../components/ui/EmptyState";
import StatusBadge from "../../components/ui/StatusBadge";
import { useToast } from "../../context/ToastContext";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { ApiError } from "../../lib/api";
import { ORDER_STATUS } from "../../lib/constants";
import { formatDateTime, formatSdg } from "../../lib/format";
import { cancelOrder, fetchOrders } from "./pharmacyApi";

const STATUS_FILTERS = [
  { value: "", label: "الكل" },
  { value: "PENDING_CONFIRMATION", label: "بانتظار التأكيد" },
  { value: "CONFIRMED", label: "مؤكدة" },
  { value: "EXPIRED_CANCELLED", label: "منتهية المهلة" },
  { value: "CANCELLED", label: "ملغاة" },
];

export default function OrdersPage() {
  const toast = useToast();

  const [statusFilter, setStatusFilter] = useState("");
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const [orderToCancel, setOrderToCancel] = useState(null);
  const [cancelling, setCancelling] = useState(false);

  const fgControllerRef = useRef(null);
  const bgControllerRef = useRef(null);
  const markRefreshedRef = useRef(() => {});

  useEffect(() => {
    return () => {
      fgControllerRef.current?.abort();
      bgControllerRef.current?.abort();
    };
  }, []);

  const loadOrdersData = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) {
        if (fgControllerRef.current) return false;

        bgControllerRef.current?.abort();
        const controller = new AbortController();
        bgControllerRef.current = controller;

        try {
          const list = await fetchOrders(statusFilter || undefined, {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return false;
          setOrders(list);
          return true;
        } catch {
          return false;
        } finally {
          if (bgControllerRef.current === controller) {
            bgControllerRef.current = null;
          }
        }
      }

      bgControllerRef.current?.abort();
      bgControllerRef.current = null;
      fgControllerRef.current?.abort();
      const controller = new AbortController();
      fgControllerRef.current = controller;

      setLoading(true);
      setErrorMsg(null);
      try {
        const list = await fetchOrders(statusFilter || undefined, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return false;
        setOrders(list);
        markRefreshedRef.current?.();
        return true;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return false;
        setErrorMsg(
          err instanceof Error ? err.message : "تعذر تحميل قائمة الطلبيات"
        );
        return false;
      } finally {
        if (fgControllerRef.current === controller) {
          fgControllerRef.current = null;
        }
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [statusFilter]
  );

  const handleBackgroundRefresh = useCallback(
    () => loadOrdersData({ silent: true }),
    [loadOrdersData]
  );

  const isAutoRefreshPaused = Boolean(orderToCancel) || cancelling;

  const { isBackgroundRefreshing, lastRefreshedAt, markRefreshed } =
    useAutoRefresh(handleBackgroundRefresh, {
      enabled: !loading && !isAutoRefreshPaused,
    });

  useEffect(() => {
    markRefreshedRef.current = markRefreshed;
  }, [markRefreshed]);

  useEffect(() => {
    void loadOrdersData();
  }, [loadOrdersData]);

  const handleConfirmCancel = async () => {
    if (!orderToCancel || cancelling) return;

    setCancelling(true);
    try {
      await cancelOrder(orderToCancel.id);
      toast.success("تم إلغاء الطلبية بنجاح");
      setOrderToCancel(null);
      await loadOrdersData();
    } catch (err) {
      if (
        err instanceof ApiError &&
        (err.code === "ORDER_EXPIRED" || err.code === "INVALID_ORDER_STATE")
      ) {
        toast.warning(err.message);
        setOrderToCancel(null);
        await loadOrdersData();
      } else {
        toast.error(
          err instanceof Error ? err.message : "تعذر إلغاء الطلبية"
        );
      }
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="portal-page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-slate-900">
            طلبيات الصيدلية
          </h1>
          <p className="text-sm text-slate-600">
            تابع حالة الطلبيات المرسلة، لقطات الأسعار المثبتة، والمهلة المتبقية
            للتأكيد.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          <AutoRefreshBadge
            isRefreshing={isBackgroundRefreshing}
            lastUpdatedAt={lastRefreshedAt}
            paused={isAutoRefreshPaused}
          />

          <button
            type="button"
            onClick={() => void loadOrdersData()}
            disabled={loading}
            className="btn btn-outline btn-sm border-base-300 gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span>تحديث الطلبيات</span>
          </button>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_FILTERS.map((filter) => {
          const isActive = statusFilter === filter.value;
          return (
            <button
              key={filter.value || "ALL"}
              type="button"
              onClick={() => setStatusFilter(filter.value)}
              className={`btn btn-sm rounded-full ${
                isActive
                  ? "btn-primary font-bold"
                  : "btn-ghost bg-base-100 border border-base-200 text-slate-700"
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {loading ? (
        <EmptyState loading title="جارٍ تحميل الطلبيات..." />
      ) : errorMsg ? (
        <EmptyState
          error
          title="تعذر تحميل الطلبيات"
          description={errorMsg}
          actionLabel="إعادة المحاولة"
          onAction={() => void loadOrdersData()}
        />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="لا توجد طلبيات مطابقة"
          description="عند إرسال طلبية جديدة من الكتالوج الموحّد ستظهر تفاصيلها هنا."
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const isPending = order.status === "PENDING_CONFIRMATION";
            const items = order.items || [];

            return (
              <div
                key={order.id}
                className="card bg-base-100 border border-base-200 shadow-xs"
              >
                <div className="card-body p-5 space-y-4">
                  {/* Order header */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-base-200">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          dir="ltr"
                          className="badge badge-sm badge-ghost font-mono font-bold"
                        >
                          #{order.id.slice(0, 8)}
                        </span>
                        <h3 className="font-extrabold text-base text-slate-900">
                          {order.counterparty?.name || "موزّع دوائي"}
                        </h3>
                        <StatusBadge map={ORDER_STATUS} value={order.status} />
                        {isPending && (
                          <CountdownTimer expiresAt={order.expiresAt} />
                        )}
                      </div>

                      <div className="flex items-center gap-3 flex-wrap text-xs text-slate-500">
                        {order.counterparty?.region && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>{order.counterparty.region}</span>
                          </span>
                        )}
                        <span>تاريخ الإنشاء: {formatDateTime(order.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 self-start sm:self-center">
                      <div className="text-start sm:text-end">
                        <span className="text-xs text-slate-500 block">
                          إجمالي الطلبية
                        </span>
                        <span className="text-lg font-extrabold text-emerald-700 tabular-nums">
                          {formatSdg(order.totalSdg)}
                        </span>
                      </div>

                      {isPending && (
                        <button
                          type="button"
                          onClick={() => setOrderToCancel(order)}
                          className="btn btn-outline btn-error btn-xs gap-1 font-bold"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>إلغاء الطلبية</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Line items table */}
                  <div className="overflow-x-auto rounded-xl border border-base-200">
                    <table className="table table-sm">
                      <thead className="bg-slate-50 text-slate-700 text-xs">
                        <tr>
                          <th>الصنف</th>
                          <th>الكمية</th>
                          <th>سعر موثّق للوحدة</th>
                          <th className="text-end">المجموع الفرعي</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <span className="font-bold text-slate-900">
                                {item.drug?.tradeName}
                              </span>{" "}
                              <span className="text-xs text-slate-500">
                                {item.drug?.strength} · {item.drug?.dosageForm}
                              </span>
                            </td>
                            <td className="font-semibold tabular-nums">
                              {item.quantity}
                            </td>
                            <td className="tabular-nums text-slate-700">
                              <span>{formatSdg(item.unitPriceSnapshotSdg)}</span>{" "}
                              <span className="text-[11px] font-mono text-slate-400">
                                (v{item.capturedPriceVersion})
                              </span>
                            </td>
                            <td className="text-end font-bold text-slate-900 tabular-nums">
                              {formatSdg(
                                item.unitPriceSnapshotSdg * item.quantity
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={Boolean(orderToCancel)}
        title="تأكيد إلغاء الطلبية"
        message={
          orderToCancel
            ? `هل تريد إلغاء الطلبية #${orderToCancel.id.slice(0, 8)} لدى "${
                orderToCancel.counterparty?.name
              }"؟`
            : ""
        }
        confirmLabel="نعم، إلغاء الطلبية"
        cancelLabel="تراجع"
        confirmVariant="btn-error"
        loading={cancelling}
        onConfirm={() => void handleConfirmCancel()}
        onCancel={() => setOrderToCancel(null)}
      />
    </div>
  );
}
