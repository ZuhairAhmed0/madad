import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  KeyRound,
  Lock,
  MapPin,
  PackageSearch,
  ShoppingCart,
} from "lucide-react";
import AutoRefreshBadge from "../../components/ui/AutoRefreshBadge";
import EmptyState from "../../components/ui/EmptyState";
import StatusBadge from "../../components/ui/StatusBadge";
import { useToast } from "../../context/ToastContext";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { PERMISSION_STATUS, SALES_STATUS } from "../../lib/constants";
import { formatRelativeTime, formatSdg } from "../../lib/format";
import { usePharmacyCart } from "./PharmacyCartContext";
import { fetchDistributorDetail, requestPriceAccess } from "./pharmacyApi";

export default function DistributorDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { addItem, openCart, totalCount, isOffline } = usePharmacyCart();

  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [requesting, setRequesting] = useState(false);

  const [query, setQuery] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);

  const fgControllerRef = useRef(null);
  const bgControllerRef = useRef(null);
  const markRefreshedRef = useRef(() => {});

  useEffect(() => {
    return () => {
      fgControllerRef.current?.abort();
      bgControllerRef.current?.abort();
    };
  }, []);

  const loadDetail = useCallback(
    async ({ silent = false } = {}) => {
      if (!id) return false;

      if (silent) {
        if (fgControllerRef.current) return false;

        bgControllerRef.current?.abort();
        const controller = new AbortController();
        bgControllerRef.current = controller;

        try {
          const data = await fetchDistributorDetail(id, {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return false;
          setDetail(data);
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
        const data = await fetchDistributorDetail(id, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return false;
        setDetail(data);
        markRefreshedRef.current?.();
        return true;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return false;
        setErrorMsg(
          err instanceof Error ? err.message : "تعذر تحميل ملف الموزّع"
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
    [id]
  );

  const handleBackgroundRefresh = useCallback(
    () => loadDetail({ silent: true }),
    [loadDetail]
  );

  const { isBackgroundRefreshing, lastRefreshedAt, markRefreshed } =
    useAutoRefresh(handleBackgroundRefresh, {
      enabled: !loading && !requesting,
    });

  useEffect(() => {
    markRefreshedRef.current = markRefreshed;
  }, [markRefreshed]);

  useEffect(() => {
    void loadDetail();
  }, [loadDetail]);

  const handleRequestPermission = async () => {
    if (!detail?.distributor || requesting || isOffline) return;

    setRequesting(true);
    try {
      const res = await requestPriceAccess(detail.distributor.id);
      const nextStatus = res?.permission?.status || "PENDING";
      setDetail((prev) =>
        prev
          ? {
              ...prev,
              permissionStatus: nextStatus,
              listings: prev.listings.map((l) => ({
                ...l,
                permissionStatus: nextStatus,
              })),
            }
          : prev
      );
      toast.success(
        nextStatus === "APPROVED"
          ? "الصلاحية مفعّلة بالفعل"
          : `تم إرسال طلب صلاحية الأسعار إلى "${detail.distributor.name}"`
      );
      if (nextStatus === "APPROVED") {
        await loadDetail();
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "تعذر إرسال طلب الصلاحية"
      );
    } finally {
      setRequesting(false);
    }
  };

  const filteredListings = useMemo(() => {
    const rows = detail?.listings || [];
    const term = query.trim().toLowerCase();

    return rows.filter((item) => {
      if (availableOnly && !item.isAvailable) return false;
      if (!term) return true;
      return (
        item.tradeName.toLowerCase().includes(term) ||
        item.genericName.toLowerCase().includes(term) ||
        item.manufacturer.toLowerCase().includes(term)
      );
    });
  }, [detail?.listings, query, availableOnly]);

  if (loading) {
    return <EmptyState loading title="جارٍ تحميل قائمة الموزّع..." />;
  }

  if (errorMsg || !detail) {
    return (
      <EmptyState
        error
        title="تعذر تحميل ملف الموزّع"
        description={errorMsg || "لم يتم العثور على الموزّع المطلوب."}
        actionLabel="العودة لدليل الموزعين"
        onAction={() => navigate("/pharmacy/distributors")}
      />
    );
  }

  const { distributor, permissionStatus } = detail;
  const isPaused = distributor.salesStatus === "PAUSED_REPRICING";
  const canRequest =
    permissionStatus === "NONE" || permissionStatus === "REVOKED";

  return (
    <div className="space-y-6">
      <div className="portal-page-header flex items-center justify-between gap-3 flex-wrap">
        <Link
          to="/pharmacy/distributors"
          className="btn btn-ghost btn-sm gap-1.5 text-slate-600"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة إلى دليل الموزعين</span>
        </Link>

        <div className="flex items-center gap-2 flex-wrap">
          <AutoRefreshBadge
            isRefreshing={isBackgroundRefreshing}
            lastUpdatedAt={lastRefreshedAt}
            paused={requesting || isOffline}
          />

          <button
            type="button"
            onClick={openCart}
            className="btn btn-primary btn-sm font-bold gap-2"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>سلة الطلبية</span>
            {totalCount > 0 && (
              <span className="badge badge-sm bg-white text-emerald-800 border-0 font-extrabold">
                {totalCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Distributor Profile Header */}
      <div className="card bg-base-100 border border-base-200 shadow-xs">
        <div className="card-body p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-extrabold text-slate-900">
                {distributor.name}
              </h1>
              <StatusBadge map={SALES_STATUS} value={distributor.salesStatus} />
              <StatusBadge
                map={PERMISSION_STATUS}
                value={permissionStatus}
              />
            </div>
            <div className="flex items-center gap-4 flex-wrap text-xs text-slate-600">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5" />
                <span>{distributor.region}</span>
              </span>
              <span>مهلة تأكيد الطلبية: {distributor.orderExpiryMinutes} دقيقة</span>
              <span>إجمالي الأصناف النشطة: {detail.listings.length}</span>
            </div>
          </div>

          {canRequest && (
            <button
              type="button"
              disabled={requesting || isOffline}
              onClick={() => void handleRequestPermission()}
              className="btn btn-primary btn-sm font-bold gap-1.5 self-start sm:self-center"
            >
              {requesting ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                <KeyRound className="w-4 h-4" />
              )}
              <span>طلب صلاحية الأسعار</span>
            </button>
          )}
        </div>
      </div>

      {/* Local Search & Filter */}
      <div className="card bg-base-100 border border-base-200 shadow-xs">
        <div className="card-body p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث داخل قائمة هذا الموزّع..."
            className="input input-bordered input-sm flex-1 h-10"
          />

          <label className="label cursor-pointer gap-2 p-0">
            <input
              type="checkbox"
              checked={availableOnly}
              onChange={(e) => setAvailableOnly(e.target.checked)}
              className="toggle toggle-primary toggle-sm"
            />
            <span className="label-text text-xs font-bold text-slate-700">
              المتوفر فقط
            </span>
          </label>
        </div>
      </div>

      {/* Listings Table */}
      {filteredListings.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="لا توجد أصناف مطابقة"
          description="جرّب تغيير عبارة البحث أو عرض الأصناف غير المتوفرة أيضاً."
        />
      ) : (
        <div className="card bg-base-100 border border-base-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table table-zebra align-middle">
              <thead className="bg-slate-50 text-slate-700 text-xs">
                <tr>
                  <th>الصنف والمادة الفعالة</th>
                  <th>الشركة المنتجة</th>
                  <th>التوفر والتحديث</th>
                  <th>سعر الجملة</th>
                  <th className="text-end">الطلب</th>
                </tr>
              </thead>
              <tbody>
                {filteredListings.map((item) => (
                  <tr key={item.listingId}>
                    <td>
                      <div className="font-bold text-slate-900">
                        {item.tradeName}{" "}
                        <span className="text-xs font-semibold text-emerald-700">
                          {item.strength}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        {item.genericName} · {item.dosageForm}
                      </div>
                    </td>
                    <td className="text-xs text-slate-600">{item.manufacturer}</td>
                    <td>
                      <div className="space-y-1">
                        <span
                          className={`badge badge-sm font-semibold ${
                            item.isAvailable
                              ? "badge-success"
                              : "badge-ghost text-slate-500"
                          }`}
                        >
                          {item.isAvailable ? "متوفر" : "غير متوفر"}
                        </span>
                        <p className="text-xs text-slate-400">
                          {formatRelativeTime(item.updatedAt)}
                        </p>
                      </div>
                    </td>
                    <td>
                      {item.priceLocked ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="price-locked text-xs">
                            <Lock className="w-3.5 h-3.5" />
                            <span>السعر مخفي</span>
                          </span>
                          <StatusBadge
                            map={PERMISSION_STATUS}
                            value={item.permissionStatus}
                          />
                        </div>
                      ) : (
                        <div>
                          <p className="font-extrabold text-sm text-emerald-800 tabular-nums">
                            {formatSdg(item.wholesalePriceSdg)}
                          </p>
                          <span className="text-[11px] font-mono text-slate-400">
                            v{item.priceVersion}
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="text-end">
                      {!item.priceLocked ? (
                        <button
                          type="button"
                          disabled={
                            isOffline || !item.isAvailable || isPaused
                          }
                          onClick={() => addItem(item, distributor)}
                          className="btn btn-xs btn-primary font-bold gap-1"
                        >
                          {isPaused ? (
                            <>
                              <AlertTriangle className="w-3 h-3" />
                              <span>الموزع يعيد التسعير</span>
                            </>
                          ) : (
                            <>
                              <ShoppingCart className="w-3 h-3" />
                              <span>أضف للسلة</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
