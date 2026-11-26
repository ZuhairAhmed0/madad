import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Eye,
  KeyRound,
  Lock,
  PackageSearch,
  RefreshCw,
  ShoppingCart,
  WifiOff,
} from "lucide-react";
import AutoRefreshBadge from "../../components/ui/AutoRefreshBadge";
import EmptyState from "../../components/ui/EmptyState";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { ApiError } from "../../lib/api";
import {
  loadCatalogSnapshot,
  saveCatalogSnapshot,
} from "../../lib/catalogCache";
import { PERMISSION_STATUS, SALES_STATUS } from "../../lib/constants";
import { formatRelativeTime, formatSdg } from "../../lib/format";
import { usePharmacyCart } from "./PharmacyCartContext";
import {
  addWatchlistItem,
  fetchCatalog,
  fetchManufacturers,
  requestPriceAccess,
} from "./pharmacyApi";

const PAGE_LIMIT = 20;

export default function CatalogPage() {
  const { organization } = useAuth();
  const toast = useToast();
  const { addItem, openCart, totalCount, isOffline, setOfflineMode } =
    usePharmacyCart();

  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [sort, setSort] = useState("latest");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [reloadTick, setReloadTick] = useState(0);

  const [manufacturers, setManufacturers] = useState([]);
  const [catalog, setCatalog] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [offlineSnapshot, setOfflineSnapshot] = useState(null);

  const [requestingDistId, setRequestingDistId] = useState(null);
  const [watchingDrugId, setWatchingDrugId] = useState(null);
  const [watchedDrugIds, setWatchedDrugIds] = useState(() => new Set());
  const debouncedQRef = useRef("");
  const fgControllerRef = useRef(null);
  const bgControllerRef = useRef(null);
  const markRefreshedRef = useRef(() => {});

  useEffect(() => {
    return () => {
      bgControllerRef.current?.abort();
    };
  }, []);

  const buildQueryPayload = useCallback(
    () => ({
      q: debouncedQ || undefined,
      manufacturer: manufacturer || undefined,
      availableOnly,
      sort,
      page,
      limit: PAGE_LIMIT,
    }),
    [debouncedQ, manufacturer, availableOnly, sort, page]
  );

  // Debounce search input (300ms) and reset page to 1 cleanly without mutating state in an updater.
  useEffect(() => {
    const timer = setTimeout(() => {
      const trimmed = searchInput.trim();
      if (debouncedQRef.current !== trimmed) {
        debouncedQRef.current = trimmed;
        setDebouncedQ(trimmed);
        setPage(1);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    fetchManufacturers()
      .then((list) => {
        if (active) setManufacturers(list);
      })
      .catch(() => {
        // Non-blocking: catalog still works without manufacturer dropdown values.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // Any user-initiated search/filter/reload aborts in-flight silent background refreshes first.
    bgControllerRef.current?.abort();
    bgControllerRef.current = null;

    const controller = new AbortController();
    fgControllerRef.current = controller;
    const queryPayload = buildQueryPayload();
    const queryKey = JSON.stringify(queryPayload);

    setLoading(true);
    setErrorMsg(null);

    (async () => {
      try {
        const data = await fetchCatalog(queryPayload, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        setCatalog(data);
        setOfflineSnapshot(null);
        setOfflineMode(false);
        saveCatalogSnapshot(organization?.id, queryKey, data);
        markRefreshedRef.current?.();
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }

        if (err instanceof ApiError && err.status === 0) {
          const cached = loadCatalogSnapshot(organization?.id, queryKey);
          setOfflineMode(true);
          if (cached?.payload) {
            setCatalog(cached.payload);
            setOfflineSnapshot({ savedAt: cached.savedAt });
            setErrorMsg(null);
          } else {
            setOfflineSnapshot(null);
            setErrorMsg(err.message);
          }
        } else {
          setOfflineSnapshot(null);
          setErrorMsg(
            err instanceof Error
              ? err.message
              : "تعذر تحميل بيانات الكتالوج الموحّد"
          );
        }
      } finally {
        if (fgControllerRef.current === controller) {
          fgControllerRef.current = null;
        }
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    })();

    return () => {
      controller.abort();
      if (fgControllerRef.current === controller) {
        fgControllerRef.current = null;
      }
    };
  }, [buildQueryPayload, reloadTick, organization?.id, setOfflineMode]);

  const handleBackgroundRefresh = useCallback(async () => {
    // Never preempt a foreground user search/filter request.
    if (fgControllerRef.current) return false;

    bgControllerRef.current?.abort();
    const controller = new AbortController();
    bgControllerRef.current = controller;

    const queryPayload = buildQueryPayload();
    const queryKey = JSON.stringify(queryPayload);

    try {
      const data = await fetchCatalog(queryPayload, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return false;

      setCatalog(data);
      setOfflineSnapshot(null);
      setErrorMsg(null);
      setOfflineMode(false);
      saveCatalogSnapshot(organization?.id, queryKey, data);
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return false;
      }
      // Keep current catalog or offline snapshot visible without flashing errors on background sync failure.
      return false;
    } finally {
      if (bgControllerRef.current === controller) {
        bgControllerRef.current = null;
      }
    }
  }, [buildQueryPayload, organization?.id, setOfflineMode]);

  const { isBackgroundRefreshing, lastRefreshedAt, markRefreshed } =
    useAutoRefresh(handleBackgroundRefresh, {
      enabled: !loading,
    });

  useEffect(() => {
    markRefreshedRef.current = markRefreshed;
  }, [markRefreshed]);

  const handleRequestPermission = useCallback(
    async (distributorId, distributorName) => {
      if (isOffline || offlineSnapshot || requestingDistId) return;

      setRequestingDistId(distributorId);
      try {
        const res = await requestPriceAccess(distributorId);
        const nextStatus = res?.permission?.status || "PENDING";

        // Update all visible rows from this distributor immediately for instant feedback.
        setCatalog((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            items: prev.items.map((item) =>
              item.distributor?.id === distributorId
                ? { ...item, permissionStatus: nextStatus }
                : item
            ),
          };
        });

        toast.success(
          nextStatus === "APPROVED"
            ? `الصلاحية مفعّلة بالفعل لدى "${distributorName}"`
            : `تم إرسال طلب صلاحية الأسعار إلى "${distributorName}"`
        );

        if (nextStatus === "APPROVED") {
          setReloadTick((t) => t + 1);
        }
      } catch (err) {
        toast.error(
          err instanceof Error
            ? err.message
            : "تعذر إرسال طلب صلاحية الأسعار"
        );
      } finally {
        setRequestingDistId(null);
      }
    },
    [isOffline, offlineSnapshot, requestingDistId, toast]
  );

  const handleWatchDrug = useCallback(
    async (item) => {
      if (watchingDrugId || isOffline || offlineSnapshot) return;

      setWatchingDrugId(item.drugId);
      try {
        await addWatchlistItem({
          drugId: item.drugId,
          pricingPolicy: "HIGHEST_AUTHORIZED",
          preferredDistributorId: null,
          profitMarginPercent: 20,
          autoCalcEnabled: true,
        });
        setWatchedDrugIds((prev) => new Set(prev).add(item.drugId));
        toast.success(`تمت إضافة "${item.tradeName}" إلى رادار الأسعار (هامش 20%)`);
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) {
          setWatchedDrugIds((prev) => new Set(prev).add(item.drugId));
          toast.info(`"${item.tradeName}" موجود مسبقاً في رادار الأسعار`);
        } else {
          toast.error(
            err instanceof Error
              ? err.message
              : "تعذر إضافة الصنف إلى رادار الأسعار"
          );
        }
      } finally {
        setWatchingDrugId(null);
      }
    },
    [watchingDrugId, isOffline, offlineSnapshot, toast]
  );

  const items = catalog?.items || [];
  const pagination = catalog?.pagination || { page: 1, totalPages: 0, total: 0 };
  const meta = catalog?.meta;
  const actionsDisabled = Boolean(offlineSnapshot) || isOffline;

  return (
    <div className="space-y-6">
      {/* Header + Cart Trigger */}
      <div className="portal-page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl font-extrabold text-slate-900">
              الكتالوج الموحّد والأسعار
            </h1>
            {meta && !offlineSnapshot && (
              <span className="badge badge-sm badge-ghost gap-1 text-slate-600">
                <span
                  className={`w-2 h-2 rounded-full ${
                    meta.fromCache ? "bg-sky-500" : "bg-emerald-500"
                  }`}
                />
                <span>{meta.fromCache ? "من الكاش" : "مباشر"}</span>
                <span>· {formatRelativeTime(meta.fetchedAt)}</span>
              </span>
            )}
          </div>
          <p className="text-sm text-slate-600">
            استعرض توفر الأصناف لدى الموزعين الموثقين وقارن أسعار الجملة المصرح
            بها.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
          <AutoRefreshBadge
            isRefreshing={isBackgroundRefreshing}
            lastUpdatedAt={lastRefreshedAt}
            paused={actionsDisabled}
          />

          <button
            type="button"
            onClick={() => setReloadTick((t) => t + 1)}
            disabled={loading}
            className="btn btn-outline btn-sm border-base-300 gap-1.5"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
            />
            <span>تحديث</span>
          </button>

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

      {/* Offline Fallback Banner */}
      {offlineSnapshot && (
        <div className="alert alert-warning items-start shadow-xs">
          <WifiOff className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="text-sm space-y-0.5">
            <p className="font-bold">
              وضع عدم الاتصال — يتم عرض آخر أسعار محفوظة{" "}
              {offlineSnapshot.savedAt
                ? formatRelativeTime(offlineSnapshot.savedAt)
                : ""}{" "}
              (للعرض فقط)
            </p>
            <p className="text-xs opacity-90">
              تم تعطيل إرسال الطلبيات وطلبات الصلاحية حتى يعود الاتصال بالخادم.
            </p>
          </div>
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="card bg-base-100 border border-base-200 shadow-xs">
        <div className="card-body p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
          <div className="lg:col-span-5">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ابحث بالاسم التجاري، المادة الفعالة (مثل Amoxicillin)، أو الشركة المنتجة..."
              className="input input-bordered input-sm w-full h-10"
            />
          </div>

          <div className="lg:col-span-3">
            <select
              value={manufacturer}
              onChange={(e) => {
                setManufacturer(e.target.value);
                setPage(1);
              }}
              className="select select-bordered select-sm w-full h-10"
            >
              <option value="">كل الشركات المنتجة</option>
              {manufacturers.map((mfr) => (
                <option key={mfr} value={mfr}>
                  {mfr}
                </option>
              ))}
            </select>
          </div>

          <div className="lg:col-span-2">
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setPage(1);
              }}
              className="select select-bordered select-sm w-full h-10"
            >
              <option value="latest">الأحدث تحديثاً</option>
              <option value="cheapest">الأرخص أولاً</option>
            </select>
          </div>

          <div className="lg:col-span-2 flex items-center justify-end">
            <label className="label cursor-pointer gap-2 p-0">
              <input
                type="checkbox"
                checked={availableOnly}
                onChange={(e) => {
                  setAvailableOnly(e.target.checked);
                  setPage(1);
                }}
                className="toggle toggle-primary toggle-sm"
              />
              <span className="label-text text-xs font-bold text-slate-700">
                المتوفر فقط
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading && !catalog ? (
        <EmptyState loading title="جارٍ تحميل الكتالوج الموحّد..." />
      ) : errorMsg ? (
        <EmptyState
          error
          title="تعذر تحميل الكتالوج"
          description={errorMsg}
          actionLabel="إعادة المحاولة"
          onAction={() => setReloadTick((t) => t + 1)}
        />
      ) : items.length === 0 ? (
        <EmptyState
          icon={PackageSearch}
          title="لا توجد أصناف مطابقة"
          description="جرّب تغيير عبارة البحث أو إزالة بعض الفلاتر لعرض جميع الأصناف."
          actionLabel={
            searchInput || manufacturer || availableOnly
              ? "إعادة ضبط الفلاتر"
              : undefined
          }
          onAction={() => {
            debouncedQRef.current = "";
            setSearchInput("");
            setDebouncedQ("");
            setManufacturer("");
            setAvailableOnly(false);
            setPage(1);
          }}
        />
      ) : (
        <>
          <div className="card bg-base-100 border border-base-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table table-zebra align-middle">
                <thead className="bg-slate-50 text-slate-700 text-xs">
                  <tr>
                    <th>الصنف والمادة الفعالة</th>
                    <th>الموزّع</th>
                    <th>التوفر والتحديث</th>
                    <th>سعر الجملة</th>
                    <th className="text-end">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => {
                    const isPaused =
                      item.distributor?.salesStatus === "PAUSED_REPRICING";
                    const isReqPending =
                      item.permissionStatus === "PENDING";
                    const isRequestingThis =
                      requestingDistId === item.distributor?.id;
                    const isWatched = watchedDrugIds.has(item.drugId);

                    return (
                      <tr key={item.listingId}>
                        <td className="min-w-52">
                          <div className="space-y-0.5">
                            <div className="font-bold text-slate-900">
                              {item.tradeName}{" "}
                              <span className="text-xs font-semibold text-emerald-700">
                                {item.strength}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500">
                              {item.genericName} · {item.dosageForm}
                            </div>
                            <div className="text-xs text-slate-400">
                              {item.manufacturer}
                            </div>
                          </div>
                        </td>

                        <td className="min-w-44">
                          <div className="space-y-1">
                            <p className="font-semibold text-sm text-slate-800">
                              {item.distributor?.name}
                            </p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-xs text-slate-500">
                                {item.distributor?.region}
                              </span>
                              {isPaused && (
                                <StatusBadge
                                  map={SALES_STATUS}
                                  value="PAUSED_REPRICING"
                                />
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="min-w-32">
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

                        <td className="min-w-48">
                          {item.priceLocked ? (
                            <div className="space-y-1.5">
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
                              <button
                                type="button"
                                disabled={
                                  actionsDisabled ||
                                  isReqPending ||
                                  isRequestingThis
                                }
                                onClick={() =>
                                  void handleRequestPermission(
                                    item.distributor.id,
                                    item.distributor.name
                                  )
                                }
                                className="btn btn-xs btn-outline btn-primary gap-1"
                              >
                                {isRequestingThis ? (
                                  <span className="loading loading-spinner loading-xs" />
                                ) : (
                                  <KeyRound className="w-3 h-3" />
                                )}
                                <span>
                                  {isReqPending
                                    ? "بانتظار الموافقة"
                                    : "طلب صلاحية السعر"}
                                </span>
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <p className="font-extrabold text-sm text-emerald-800 tabular-nums">
                                {formatSdg(item.wholesalePriceSdg)}
                              </p>
                              <span className="text-[11px] font-mono text-slate-400">
                                v{item.priceVersion}
                              </span>
                            </div>
                          )}
                        </td>

                        <td className="text-end min-w-48">
                          <div className="flex items-center justify-end gap-1.5 flex-wrap">
                            {!item.priceLocked && (
                              <button
                                type="button"
                                disabled={
                                  actionsDisabled ||
                                  !item.isAvailable ||
                                  isPaused
                                }
                                onClick={() =>
                                  addItem(item, item.distributor)
                                }
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
                            )}

                            <button
                              type="button"
                              disabled={
                                actionsDisabled ||
                                watchingDrugId === item.drugId
                              }
                              onClick={() => void handleWatchDrug(item)}
                              title="راقب هذا الصنف في رادار الأسعار"
                              className={`btn btn-xs ${
                                isWatched
                                  ? "btn-ghost text-emerald-700"
                                  : "btn-outline border-base-300 text-slate-700"
                              } gap-1`}
                            >
                              {watchingDrugId === item.drugId ? (
                                <span className="loading loading-spinner loading-xs" />
                              ) : (
                                <Eye className="w-3 h-3" />
                              )}
                              <span>
                                {isWatched ? "مراقب" : "راقب في الرادار"}
                              </span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs text-slate-500">
                إجمالي النتائج: {pagination.total} صنف — صفحة {pagination.page}{" "}
                من {pagination.totalPages}
              </span>
              <div className="join">
                <button
                  type="button"
                  disabled={pagination.page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="btn btn-sm join-item"
                >
                  السابق
                </button>
                <button
                  type="button"
                  disabled={
                    pagination.page >= pagination.totalPages || loading
                  }
                  onClick={() => setPage((p) => p + 1)}
                  className="btn btn-sm join-item"
                >
                  التالي
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
