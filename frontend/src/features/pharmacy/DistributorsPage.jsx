import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Clock,
  KeyRound,
  MapPin,
  Package,
  RefreshCw,
} from "lucide-react";
import AutoRefreshBadge from "../../components/ui/AutoRefreshBadge";
import EmptyState from "../../components/ui/EmptyState";
import StatusBadge from "../../components/ui/StatusBadge";
import { useToast } from "../../context/ToastContext";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { PERMISSION_STATUS, SALES_STATUS } from "../../lib/constants";
import { fetchDistributors, requestPriceAccess } from "./pharmacyApi";

export default function DistributorsPage() {
  const toast = useToast();

  const [distributors, setDistributors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [requestingId, setRequestingId] = useState(null);

  const fgControllerRef = useRef(null);
  const bgControllerRef = useRef(null);
  const markRefreshedRef = useRef(() => {});

  useEffect(() => {
    return () => {
      fgControllerRef.current?.abort();
      bgControllerRef.current?.abort();
    };
  }, []);

  const loadDistributorsData = useCallback(async ({ silent = false } = {}) => {
    if (silent) {
      if (fgControllerRef.current) return false;

      bgControllerRef.current?.abort();
      const controller = new AbortController();
      bgControllerRef.current = controller;

      try {
        const list = await fetchDistributors({ signal: controller.signal });
        if (controller.signal.aborted) return false;
        setDistributors(list);
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
      const list = await fetchDistributors({ signal: controller.signal });
      if (controller.signal.aborted) return false;
      setDistributors(list);
      markRefreshedRef.current?.();
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return false;
      setErrorMsg(
        err instanceof Error ? err.message : "تعذر تحميل دليل الموزعين"
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
  }, []);

  const handleBackgroundRefresh = useCallback(
    () => loadDistributorsData({ silent: true }),
    [loadDistributorsData]
  );

  const { isBackgroundRefreshing, lastRefreshedAt, markRefreshed } =
    useAutoRefresh(handleBackgroundRefresh, {
      enabled: !loading && !requestingId,
    });

  useEffect(() => {
    markRefreshedRef.current = markRefreshed;
  }, [markRefreshed]);

  useEffect(() => {
    void loadDistributorsData();
  }, [loadDistributorsData]);

  const handleRequestAccess = async (distributor) => {
    if (requestingId) return;

    setRequestingId(distributor.id);
    try {
      const res = await requestPriceAccess(distributor.id);
      const nextStatus = res?.permission?.status || "PENDING";
      setDistributors((prev) =>
        prev.map((d) =>
          d.id === distributor.id ? { ...d, permissionStatus: nextStatus } : d
        )
      );
      toast.success(
        nextStatus === "APPROVED"
          ? `الصلاحية مفعّلة لدى "${distributor.name}"`
          : `تم إرسال طلب صلاحية الأسعار إلى "${distributor.name}"`
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "تعذر إرسال طلب صلاحية الأسعار"
      );
    } finally {
      setRequestingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="portal-page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-slate-900">
            دليل الموزعين الموثّقين
          </h1>
          <p className="text-sm text-slate-600">
            تواصل مع مخازن الأدوية المعتمدة في أمدرمان واطلب صلاحية الاطلاع على
            قوائم الجملة.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          <AutoRefreshBadge
            isRefreshing={isBackgroundRefreshing}
            lastUpdatedAt={lastRefreshedAt}
            paused={Boolean(requestingId)}
          />

          <button
            type="button"
            onClick={() => void loadDistributorsData()}
            disabled={loading}
            className="btn btn-outline btn-sm border-base-300 gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span>تحديث الدليل</span>
          </button>
        </div>
      </div>

      {loading ? (
        <EmptyState loading title="جارٍ تحميل دليل الموزعين..." />
      ) : errorMsg ? (
        <EmptyState
          error
          title="تعذر تحميل الدليل"
          description={errorMsg}
          actionLabel="إعادة المحاولة"
          onAction={() => void loadDistributorsData()}
        />
      ) : distributors.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="لا يوجد موزعون موثّقون حالياً"
          description="سيظهر هنا الموزعون المعتمدون من قبل إدارة منصة مدد."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {distributors.map((dist) => {
            const canRequest =
              dist.permissionStatus === "NONE" ||
              dist.permissionStatus === "REVOKED";
            const isRequestingThis = requestingId === dist.id;

            return (
              <div
                key={dist.id}
                className="card bg-base-100 border border-base-200 shadow-xs hover:border-emerald-200 transition-colors"
              >
                <div className="card-body p-5 justify-between gap-4">
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <StatusBadge
                        map={SALES_STATUS}
                        value={dist.salesStatus}
                      />
                      <StatusBadge
                        map={PERMISSION_STATUS}
                        value={dist.permissionStatus}
                      />
                    </div>

                    <div>
                      <h3 className="font-extrabold text-base text-slate-900">
                        {dist.name}
                      </h3>
                      <div className="flex items-center gap-1 text-xs text-slate-500 mt-1">
                        <MapPin className="w-3.5 h-3.5 shrink-0" />
                        <span>{dist.region}</span>
                      </div>
                    </div>

                    <div className="rounded-xl bg-slate-50 border border-base-200 p-3 space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5">
                          <Package className="w-3.5 h-3.5 text-emerald-700" />
                          <span>الأصناف المتوفرة</span>
                        </span>
                        <span className="font-bold text-slate-900 tabular-nums">
                          {dist.activeListingsCount} صنف متوفر
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span>مهلة التأكيد</span>
                        </span>
                        <span className="font-bold text-slate-900 tabular-nums">
                          {dist.orderExpiryMinutes} دقيقة
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2 border-t border-base-200">
                    {canRequest && (
                      <button
                        type="button"
                        disabled={isRequestingThis}
                        onClick={() => void handleRequestAccess(dist)}
                        className="btn btn-outline btn-primary btn-sm flex-1 gap-1.5 font-bold"
                      >
                        {isRequestingThis ? (
                          <span className="loading loading-spinner loading-xs" />
                        ) : (
                          <KeyRound className="w-3.5 h-3.5" />
                        )}
                        <span>طلب صلاحية الأسعار</span>
                      </button>
                    )}

                    <Link
                      to={`/pharmacy/distributors/${dist.id}`}
                      className={`btn btn-primary btn-sm font-bold gap-1 ${
                        canRequest ? "" : "flex-1"
                      }`}
                    >
                      <span>عرض الأصناف</span>
                      <ArrowLeft className="w-4 h-4" />
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
