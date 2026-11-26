import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  RefreshCw,
  XCircle,
} from "lucide-react";
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
import {
  cancelDistributorOrder,
  confirmDistributorOrder,
  fetchDistributorOrders,
} from "./distributorApi";

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

  const [busyOrderId, setBusyOrderId] = useState(null);
  const [orderToCancel, setOrderToCancel] = useState(null);

  const fgControllerRef = useRef(null);
  const bgControllerRef = useRef(null);
  const markRefreshedRef = useRef(() => {});

  useEffect(() => {
    return () => {
      fgControllerRef.current?.abort();
      bgControllerRef.current?.abort();
    };
  }, []);

  const loadOrders = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) {
        if (fgControllerRef.current) return false;

        bgControllerRef.current?.abort();
        const controller = new AbortController();
        bgControllerRef.current = controller;

        try {
          const list = await fetchDistributorOrders(statusFilter || undefined, {
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
        const list = await fetchDistributorOrders(statusFilter || undefined, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return false;
        setOrders(list);
        markRefreshedRef.current?.();
        return true;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return false;
        setErrorMsg(
          err instanceof Error ? err.message : "تعذر تحميل الطلبيات الواردة"
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
    () => loadOrders({ silent: true }),
    [loadOrders]
  );

  const isAutoRefreshPaused = Boolean(orderToCancel) || Boolean(busyOrderId);

  const { isBackgroundRefreshing, lastRefreshedAt, markRefreshed } =
    useAutoRefresh(handleBackgroundRefresh, {
      enabled: !loading && !isAutoRefreshPaused,
    });

  useEffect(() => {
    markRefreshedRef.current = markRefreshed;
  }, [markRefreshed]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const handleConfirmOrder = async (order) => {
    if (busyOrderId) return;

    setBusyOrderId(order.id);
    try {
      await confirmDistributorOrder(order.id);
      toast.success(
        `تم تأكيد طلبية "${order.counterparty?.name || "الصيدلية"}" بنجاح`
      );
      await loadOrders();
    } catch (err) {
      if (err instanceof ApiError && err.code === "ORDER_EXPIRED") {
        toast.warning("انتهت مهلة الطلبية وتم إلغاؤها تلقائياً");
        await loadOrders();
      } else if (
        err instanceof ApiError &&
        err.code === "INVALID_ORDER_STATE"
      ) {
        toast.warning(err.message);
        await loadOrders();
      } else {
        toast.error(
          err instanceof Error ? err.message : "تعذر تأكيد الطلبية"
        );
      }
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleCancelOrder = async () => {
    if (!orderToCancel || busyOrderId) return;

    setBusyOrderId(orderToCancel.id);
    try {
      await cancelDistributorOrder(orderToCancel.id);
      toast.success("تم إلغاء الطلبية بنجاح");
      setOrderToCancel(null);
      await loadOrders();
    } catch (err) {
      if (err instanceof ApiError && err.code === "ORDER_EXPIRED") {
        toast.warning("انتهت مهلة الطلبية وتم إلغاؤها تلقائياً");
        setOrderToCancel(null);
        await loadOrders();
      } else if (
        err instanceof ApiError &&
        err.code === "INVALID_ORDER_STATE"
      ) {
        toast.warning(err.message);
        setOrderToCancel(null);
        await loadOrders();
      } else {
        toast.error(
          err instanceof Error ? err.message : "تعذر إلغاء الطلبية"
        );
      }
    } finally {
      setBusyOrderId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="portal-page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-slate-900">
            الطلبيات الواردة للمخزن
          </h1>
          <p className="text-sm text-slate-600">
            راجع طلبيات الصيدليات وأكّدها ضمن مهلة الصلاحية المحددة قبل انتهائها
            تلقائياً.
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
            onClick={() => void loadOrders()}
            disabled={loading}
            className="btn btn-outline btn-sm border-base-300 gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* Filter pills */}
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

      {/* Orders List */}
      {loading ? (
        <EmptyState loading title="جارٍ تحميل الطلبيات الواردة..." />
      ) : errorMsg ? (
        <EmptyState
          error
          title="تعذر تحميل الطلبيات"
          description={errorMsg}
          actionLabel="إعادة المحاولة"
          onAction={() => void loadOrders()}
        />
      ) : orders.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="لا توجد طلبيات مطابقة"
          description="عند استلام طلبيات من الصيدليات المصرح لها ستظهر هنا مع كافة تفاصيلها."
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => {
            const isPending = order.status === "PENDING_CONFIRMATION";
            const isBusy = busyOrderId === order.id;
            const items = order.items || [];

            return (
              <div
                key={order.id}
                className="card bg-base-100 border border-base-200 shadow-xs"
              >
                <div className="card-body p-5 space-y-4">
                  {/* Top Info */}
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 border-b border-base-200">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          dir="ltr"
                          className="badge badge-sm badge-ghost font-mono font-bold"
                        >
                          #{order.id.slice(0, 8)}
                        </span>
                        <h3 className="font-extrabold text-base text-slate-900">
                          {order.counterparty?.name || "صيدلية"}
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
                        {order.counterparty?.licenseNumber && (
                          <span className="font-mono">
                            ترخيص: {order.counterparty.licenseNumber}
                          </span>
                        )}
                        <span>تاريخ الطلب: {formatDateTime(order.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="text-start lg:text-end">
                        <span className="text-xs text-slate-500 block">
                          إجمالي الطلبية
                        </span>
                        <span className="text-lg font-extrabold text-emerald-700 tabular-nums">
                          {formatSdg(order.totalSdg)}
                        </span>
                      </div>

                      {isPending && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={Boolean(busyOrderId)}
                            onClick={() => void handleConfirmOrder(order)}
                            className="btn btn-primary btn-xs h-8 px-3 font-bold gap-1"
                          >
                            {isBusy ? (
                              <span className="loading loading-spinner loading-xs" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            <span>تأكيد الطلبية</span>
                          </button>

                          <button
                            type="button"
                            disabled={Boolean(busyOrderId)}
                            onClick={() => setOrderToCancel(order)}
                            className="btn btn-outline btn-error btn-xs h-8 px-2.5 gap-1 font-bold"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>إلغاء</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Line Items */}
                  <div className="overflow-x-auto rounded-xl border border-base-200">
                    <table className="table table-sm">
                      <thead className="bg-slate-50 text-slate-700 text-xs">
                        <tr>
                          <th>الصنف</th>
                          <th>الكمية</th>
                          <th>السعر المثبت للوحدة</th>
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
        title="تأكيد إلغاء الطلبية الواردة"
        message={
          orderToCancel
            ? `هل أنت متأكد من إلغاء الطلبية #${orderToCancel.id.slice(
                0,
                8
              )} الواردة من "${orderToCancel.counterparty?.name}"؟`
            : ""
        }
        confirmLabel="نعم، إلغاء الطلبية"
        cancelLabel="تراجع"
        confirmVariant="btn-error"
        loading={Boolean(busyOrderId && orderToCancel?.id === busyOrderId)}
        onConfirm={() => void handleCancelOrder()}
        onCancel={() => setOrderToCancel(null)}
      />
    </div>
  );
}
