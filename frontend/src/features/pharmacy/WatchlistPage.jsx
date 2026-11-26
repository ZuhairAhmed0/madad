import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Edit3,
  Plus,
  RefreshCw,
  Trash2,
  TrendingUp,
} from "lucide-react";
import AutoRefreshBadge from "../../components/ui/AutoRefreshBadge";
import ConfirmModal from "../../components/ui/ConfirmModal";
import EmptyState from "../../components/ui/EmptyState";
import StatusBadge from "../../components/ui/StatusBadge";
import { useToast } from "../../context/ToastContext";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { PRICING_POLICY } from "../../lib/constants";
import {
  formatPercent,
  formatRelativeTime,
  formatSdg,
} from "../../lib/format";
import {
  acknowledgeWatchlistItem,
  addWatchlistItem,
  deleteWatchlistItem,
  fetchDistributors,
  fetchMasterDrugs,
  fetchPriceAlerts,
  fetchWatchlist,
  updateWatchlistItem,
} from "./pharmacyApi";

function AddWatchlistModal({ open, distributors, onClose, onCreated }) {
  const toast = useToast();
  const dialogRef = useRef(null);

  const [drugQuery, setDrugQuery] = useState("");
  const [drugOptions, setDrugOptions] = useState([]);
  const [loadingDrugs, setLoadingDrugs] = useState(false);
  const [selectedDrugId, setSelectedDrugId] = useState("");
  const [pricingPolicy, setPricingPolicy] = useState("HIGHEST_AUTHORIZED");
  const [preferredDistributorId, setPreferredDistributorId] = useState("");
  const [profitMarginPercent, setProfitMarginPercent] = useState("20");
  const [autoCalcEnabled, setAutoCalcEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoadingDrugs(true);
      try {
        const drugs = await fetchMasterDrugs(
          { q: drugQuery.trim() || undefined },
          { signal: controller.signal }
        );
        if (!controller.signal.aborted) {
          setDrugOptions(drugs);
          if (
            drugs.length > 0 &&
            !drugs.some((d) => d.id === selectedDrugId)
          ) {
            setSelectedDrugId(drugs[0].id);
          }
        }
      } catch (err) {
        if (!(err instanceof Error && err.name === "AbortError")) {
          toast.error("تعذر البحث في قائمة الأدوية المرجعية");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingDrugs(false);
        }
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, drugQuery, selectedDrugId, toast]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    if (!selectedDrugId) {
      toast.warning("يرجى اختيار الدواء المراد مراقبته");
      return;
    }

    const parsedMargin = Number(profitMarginPercent);
    if (!Number.isFinite(parsedMargin) || parsedMargin < 0 || parsedMargin > 500) {
      toast.warning("نسبة هامش الربح يجب أن تكون بين 0 و 500");
      return;
    }

    if (
      pricingPolicy === "PREFERRED_DISTRIBUTOR" &&
      !preferredDistributorId
    ) {
      toast.warning("يرجى اختيار الموزّع المفضل");
      return;
    }

    setSubmitting(true);
    try {
      await addWatchlistItem({
        drugId: selectedDrugId,
        pricingPolicy,
        preferredDistributorId:
          pricingPolicy === "PREFERRED_DISTRIBUTOR"
            ? preferredDistributorId
            : null,
        profitMarginPercent: parsedMargin,
        autoCalcEnabled,
      });
      toast.success("تمت إضافة الصنف إلى رادار الأسعار");
      onCreated();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "تعذر إضافة الصنف إلى الرادار"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        if (!submitting) onClose();
      }}
      className="modal modal-bottom sm:modal-middle"
    >
      <div className="modal-box max-w-lg border border-base-200 space-y-4">
        <h3 className="font-extrabold text-lg text-slate-900">
          إضافة صنف إلى رادار الأسعار
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text font-semibold text-slate-700">
                البحث عن الدواء (الاسم التجاري أو المادة الفعالة)
              </span>
            </label>
            <input
              type="search"
              value={drugQuery}
              onChange={(e) => setDrugQuery(e.target.value)}
              placeholder="مثال: Augmentin أو Paracetamol..."
              className="input input-bordered input-sm w-full h-10"
            />
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text font-semibold text-slate-700">
                الصنف المرجعي *
              </span>
              {loadingDrugs && (
                <span className="loading loading-spinner loading-xs text-primary" />
              )}
            </label>
            <select
              value={selectedDrugId}
              onChange={(e) => setSelectedDrugId(e.target.value)}
              className="select select-bordered select-sm w-full h-10"
              required
            >
              {drugOptions.length === 0 ? (
                <option value="">لا توجد نتائج مطابقة</option>
              ) : (
                drugOptions.map((drug) => (
                  <option key={drug.id} value={drug.id}>
                    {drug.tradeName} ({drug.strength}) — {drug.genericName}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold text-slate-700">
                  سياسة احتساب الجملة
                </span>
              </label>
              <select
                value={pricingPolicy}
                onChange={(e) => setPricingPolicy(e.target.value)}
                className="select select-bordered select-sm w-full h-10"
              >
                <option value="HIGHEST_AUTHORIZED">أعلى سعر مصرح به</option>
                <option value="PREFERRED_DISTRIBUTOR">موزّع مفضل</option>
              </select>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold text-slate-700">
                  هامش الربح (%)
                </span>
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={500}
                value={profitMarginPercent}
                onChange={(e) => setProfitMarginPercent(e.target.value)}
                className="input input-bordered input-sm w-full h-10 tabular-nums"
                required
              />
            </div>
          </div>

          {pricingPolicy === "PREFERRED_DISTRIBUTOR" && (
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold text-slate-700">
                  الموزّع المفضل *
                </span>
              </label>
              <select
                value={preferredDistributorId}
                onChange={(e) => setPreferredDistributorId(e.target.value)}
                className="select select-bordered select-sm w-full h-10"
                required
              >
                <option value="">اختر الموزّع...</option>
                {distributors.map((dist) => (
                  <option key={dist.id} value={dist.id}>
                    {dist.name} ({dist.region})
                  </option>
                ))}
              </select>
            </div>
          )}

          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              checked={autoCalcEnabled}
              onChange={(e) => setAutoCalcEnabled(e.target.checked)}
              className="checkbox checkbox-primary checkbox-sm"
            />
            <span className="label-text text-sm text-slate-700">
              احتساب سعر الرف المقترح تلقائياً عند اعتماد تغيّر الجملة
            </span>
          </label>

          <div className="modal-action">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn btn-ghost btn-sm"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedDrugId}
              className="btn btn-primary btn-sm font-bold gap-1.5"
            >
              {submitting && (
                <span className="loading loading-spinner loading-xs" />
              )}
              <span>إضافة للرادار</span>
            </button>
          </div>
        </form>
      </div>

      <form
        method="dialog"
        className="modal-backdrop"
        onSubmit={(e) => {
          e.preventDefault();
          if (!submitting) onClose();
        }}
      >
        <button type="submit" aria-label="إغلاق">
          close
        </button>
      </form>
    </dialog>
  );
}

function EditWatchlistModal({ item, distributors, onClose, onSaved }) {
  const toast = useToast();
  const dialogRef = useRef(null);

  const [pricingPolicy, setPricingPolicy] = useState("HIGHEST_AUTHORIZED");
  const [preferredDistributorId, setPreferredDistributorId] = useState("");
  const [profitMarginPercent, setProfitMarginPercent] = useState("20");
  const [autoCalcEnabled, setAutoCalcEnabled] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (item) {
      setPricingPolicy(item.pricingPolicy || "HIGHEST_AUTHORIZED");
      setPreferredDistributorId(item.preferredDistributorId || "");
      setProfitMarginPercent(String(Number(item.profitMarginPercent ?? 20)));
      setAutoCalcEnabled(Boolean(item.autoCalcEnabled));
    }
  }, [item]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (item && !dialog.open) {
      dialog.showModal();
    } else if (!item && dialog.open) {
      dialog.close();
    }
  }, [item]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!item || submitting) return;

    const parsedMargin = Number(profitMarginPercent);
    if (!Number.isFinite(parsedMargin) || parsedMargin < 0 || parsedMargin > 500) {
      toast.warning("نسبة هامش الربح يجب أن تكون بين 0 و 500");
      return;
    }

    if (
      pricingPolicy === "PREFERRED_DISTRIBUTOR" &&
      !preferredDistributorId
    ) {
      toast.warning("يرجى اختيار الموزّع المفضل");
      return;
    }

    setSubmitting(true);
    try {
      await updateWatchlistItem(item.id, {
        pricingPolicy,
        preferredDistributorId:
          pricingPolicy === "PREFERRED_DISTRIBUTOR"
            ? preferredDistributorId
            : null,
        profitMarginPercent: parsedMargin,
        autoCalcEnabled,
      });
      toast.success("تم تحديث إعدادات المراقبة");
      onSaved();
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "تعذر تحديث إعدادات العنصر"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        if (!submitting) onClose();
      }}
      className="modal modal-bottom sm:modal-middle"
    >
      <div className="modal-box max-w-lg border border-base-200 space-y-4">
        <h3 className="font-extrabold text-lg text-slate-900">
          تعديل إعدادات: {item?.drug?.tradeName}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold text-slate-700">
                  سياسة احتساب الجملة
                </span>
              </label>
              <select
                value={pricingPolicy}
                onChange={(e) => setPricingPolicy(e.target.value)}
                className="select select-bordered select-sm w-full h-10"
              >
                <option value="HIGHEST_AUTHORIZED">أعلى سعر مصرح به</option>
                <option value="PREFERRED_DISTRIBUTOR">موزّع مفضل</option>
              </select>
            </div>

            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold text-slate-700">
                  هامش الربح (%)
                </span>
              </label>
              <input
                type="number"
                step="0.01"
                min={0}
                max={500}
                value={profitMarginPercent}
                onChange={(e) => setProfitMarginPercent(e.target.value)}
                className="input input-bordered input-sm w-full h-10 tabular-nums"
                required
              />
            </div>
          </div>

          {pricingPolicy === "PREFERRED_DISTRIBUTOR" && (
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold text-slate-700">
                  الموزّع المفضل *
                </span>
              </label>
              <select
                value={preferredDistributorId}
                onChange={(e) => setPreferredDistributorId(e.target.value)}
                className="select select-bordered select-sm w-full h-10"
                required
              >
                <option value="">اختر الموزّع...</option>
                {distributors.map((dist) => (
                  <option key={dist.id} value={dist.id}>
                    {dist.name} ({dist.region})
                  </option>
                ))}
              </select>
            </div>
          )}

          <label className="label cursor-pointer justify-start gap-3">
            <input
              type="checkbox"
              checked={autoCalcEnabled}
              onChange={(e) => setAutoCalcEnabled(e.target.checked)}
              className="checkbox checkbox-primary checkbox-sm"
            />
            <span className="label-text text-sm text-slate-700">
              تحديث سعر الرف المقترح تلقائياً عند الاعتماد
            </span>
          </label>

          <div className="modal-action">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="btn btn-ghost btn-sm"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-primary btn-sm font-bold"
            >
              {submitting && (
                <span className="loading loading-spinner loading-xs" />
              )}
              <span>حفظ التغييرات</span>
            </button>
          </div>
        </form>
      </div>

      <form
        method="dialog"
        className="modal-backdrop"
        onSubmit={(e) => {
          e.preventDefault();
          if (!submitting) onClose();
        }}
      >
        <button type="submit" aria-label="إغلاق">
          close
        </button>
      </form>
    </dialog>
  );
}

export default function WatchlistPage() {
  const toast = useToast();

  const [activeTab, setActiveTab] = useState("radar");
  const [watchlist, setWatchlist] = useState({ items: [], alertsCount: 0 });
  const [loadingWatchlist, setLoadingWatchlist] = useState(true);
  const [watchlistError, setWatchlistError] = useState(null);

  const [alerts, setAlerts] = useState([]);
  const [watchedOnly, setWatchedOnly] = useState(true);
  const [loadingAlerts, setLoadingAlerts] = useState(false);

  const [distributors, setDistributors] = useState([]);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [deletingItem, setDeletingItem] = useState(null);
  const [deletingSubmitting, setDeletingSubmitting] = useState(false);

  const [customShelfInputs, setCustomShelfInputs] = useState({});
  const [ackingId, setAckingId] = useState(null);

  const radarFgControllerRef = useRef(null);
  const radarBgControllerRef = useRef(null);
  const alertsFgControllerRef = useRef(null);
  const alertsBgControllerRef = useRef(null);
  const markRefreshedRef = useRef(() => {});

  useEffect(() => {
    return () => {
      radarFgControllerRef.current?.abort();
      radarBgControllerRef.current?.abort();
      alertsFgControllerRef.current?.abort();
      alertsBgControllerRef.current?.abort();
    };
  }, []);

  const loadWatchlistData = useCallback(async ({ silent = false } = {}) => {
    if (silent) {
      if (radarFgControllerRef.current) return false;

      radarBgControllerRef.current?.abort();
      const controller = new AbortController();
      radarBgControllerRef.current = controller;

      try {
        const data = await fetchWatchlist({ signal: controller.signal });
        if (controller.signal.aborted) return false;
        setWatchlist({
          items: data?.items || [],
          alertsCount: data?.alertsCount || 0,
        });
        return true;
      } catch {
        return false;
      } finally {
        if (radarBgControllerRef.current === controller) {
          radarBgControllerRef.current = null;
        }
      }
    }

    radarBgControllerRef.current?.abort();
    radarBgControllerRef.current = null;
    radarFgControllerRef.current?.abort();
    const controller = new AbortController();
    radarFgControllerRef.current = controller;

    setLoadingWatchlist(true);
    setWatchlistError(null);
    try {
      const data = await fetchWatchlist({ signal: controller.signal });
      if (controller.signal.aborted) return false;
      setWatchlist({
        items: data?.items || [],
        alertsCount: data?.alertsCount || 0,
      });
      markRefreshedRef.current?.();
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return false;
      setWatchlistError(
        err instanceof Error ? err.message : "تعذر تحميل قائمة المتابعة"
      );
      return false;
    } finally {
      if (radarFgControllerRef.current === controller) {
        radarFgControllerRef.current = null;
      }
      if (!controller.signal.aborted) {
        setLoadingWatchlist(false);
      }
    }
  }, []);

  const loadPriceAlertsData = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) {
        if (alertsFgControllerRef.current) return false;

        alertsBgControllerRef.current?.abort();
        const controller = new AbortController();
        alertsBgControllerRef.current = controller;

        try {
          const rows = await fetchPriceAlerts(
            { limit: 30, watchedOnly },
            { signal: controller.signal }
          );
          if (controller.signal.aborted) return false;
          setAlerts(rows);
          return true;
        } catch {
          return false;
        } finally {
          if (alertsBgControllerRef.current === controller) {
            alertsBgControllerRef.current = null;
          }
        }
      }

      alertsBgControllerRef.current?.abort();
      alertsBgControllerRef.current = null;
      alertsFgControllerRef.current?.abort();
      const controller = new AbortController();
      alertsFgControllerRef.current = controller;

      setLoadingAlerts(true);
      try {
        const rows = await fetchPriceAlerts(
          { limit: 30, watchedOnly },
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return false;
        setAlerts(rows);
        markRefreshedRef.current?.();
        return true;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return false;
        toast.error(
          err instanceof Error ? err.message : "تعذر تحميل سجل تنبيهات الأسعار"
        );
        return false;
      } finally {
        if (alertsFgControllerRef.current === controller) {
          alertsFgControllerRef.current = null;
        }
        if (!controller.signal.aborted) {
          setLoadingAlerts(false);
        }
      }
    },
    [watchedOnly, toast]
  );

  const hasUnsavedCustomShelf = Object.values(customShelfInputs).some(
    (val) => String(val ?? "").trim().length > 0
  );
  const isAutoRefreshPaused =
    addModalOpen ||
    Boolean(editingItem) ||
    Boolean(deletingItem) ||
    hasUnsavedCustomShelf ||
    Boolean(ackingId) ||
    deletingSubmitting;
  const isActiveTabLoading =
    activeTab === "radar" ? loadingWatchlist : loadingAlerts;

  const handleBackgroundRefresh = useCallback(async () => {
    return activeTab === "radar"
      ? loadWatchlistData({ silent: true })
      : loadPriceAlertsData({ silent: true });
  }, [activeTab, loadWatchlistData, loadPriceAlertsData]);

  const { isBackgroundRefreshing, lastRefreshedAt, markRefreshed } =
    useAutoRefresh(handleBackgroundRefresh, {
      enabled: !isAutoRefreshPaused && !isActiveTabLoading,
    });

  useEffect(() => {
    markRefreshedRef.current = markRefreshed;
  }, [markRefreshed]);

  useEffect(() => {
    void loadWatchlistData();
    fetchDistributors()
      .then((list) => setDistributors(list))
      .catch(() => {});
  }, [loadWatchlistData]);

  useEffect(() => {
    if (activeTab === "alerts") {
      void loadPriceAlertsData();
    }
  }, [activeTab, loadPriceAlertsData]);

  const handleAcknowledge = async (item) => {
    if (item.effectiveWholesaleSdg === null || ackingId) return;

    const rawCustom = (customShelfInputs[item.id] ?? "").trim();
    const payload = {};

    if (rawCustom.length > 0) {
      const parsed = Number(rawCustom);
      if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 2_147_483_647) {
        toast.warning("سعر الرف المخصص يجب أن يكون عدداً صحيحاً موجباً بالجنيه");
        return;
      }
      payload.customShelfPriceSdg = parsed;
    }

    setAckingId(item.id);
    try {
      await acknowledgeWatchlistItem(item.id, payload);
      setCustomShelfInputs((prev) => ({ ...prev, [item.id]: "" }));
      toast.success(`تم اعتماد سعر الرف لصنف "${item.drug?.tradeName}"`);
      await loadWatchlistData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "تعذر اعتماد سعر الرف"
      );
    } finally {
      setAckingId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingItem || deletingSubmitting) return;

    setDeletingSubmitting(true);
    try {
      await deleteWatchlistItem(deletingItem.id);
      toast.success(`تم حذف "${deletingItem.drug?.tradeName}" من الرادار`);
      setDeletingItem(null);
      await loadWatchlistData();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "تعذر حذف الصنف من الرادار"
      );
    } finally {
      setDeletingSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="portal-page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-slate-900">
            رادار الأسعار وحاسبة هامش الربح
          </h1>
          <p className="text-sm text-slate-600">
            راقب تغيّرات أسعار الجملة المصرح بها واحسب سعر البيع المقترح على
            الرف تلقائياً.
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
            disabled={isActiveTabLoading}
            onClick={() =>
              activeTab === "radar"
                ? void loadWatchlistData()
                : void loadPriceAlertsData()
            }
            className="btn btn-outline btn-sm border-base-300 gap-1.5"
          >
            <RefreshCw
              className={`w-4 h-4 ${isActiveTabLoading ? "animate-spin" : ""}`}
            />
            <span>تحديث</span>
          </button>

          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="btn btn-primary btn-sm font-bold gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة صنف للرادار</span>
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="card bg-base-100 border border-base-200 shadow-xs">
          <div className="card-body p-5 flex-row items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">
                إجمالي الأصناف المراقبة
              </p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
                {watchlist.items.length}
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center">
              <TrendingUp className="w-5 h-5" />
            </div>
          </div>
        </div>

        <div
          className={`card border shadow-xs ${
            watchlist.alertsCount > 0
              ? "bg-amber-50/70 border-amber-300"
              : "bg-base-100 border-base-200"
          }`}
        >
          <div className="card-body p-5 flex-row items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-600">
                أصناف ارتفع سعرها وتحتاج تحديث سعر الرف
              </p>
              <p
                className={`text-2xl font-extrabold mt-1 tabular-nums ${
                  watchlist.alertsCount > 0 ? "text-error" : "text-emerald-700"
                }`}
              >
                {watchlist.alertsCount}
              </p>
            </div>
            <div
              className={`w-11 h-11 rounded-xl flex items-center justify-center ${
                watchlist.alertsCount > 0
                  ? "bg-error/15 text-error"
                  : "bg-emerald-50 text-emerald-700 border border-emerald-100"
              }`}
            >
              {watchlist.alertsCount > 0 ? (
                <AlertTriangle className="w-5 h-5" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" className="tabs tabs-box bg-base-200/70 p-1 w-fit">
        <button
          type="button"
          role="tab"
          onClick={() => setActiveTab("radar")}
          className={`tab font-bold gap-1.5 ${
            activeTab === "radar" ? "tab-active text-emerald-800" : ""
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>رادار الأصناف وهامش الربح</span>
        </button>
        <button
          type="button"
          role="tab"
          onClick={() => setActiveTab("alerts")}
          className={`tab font-bold gap-1.5 ${
            activeTab === "alerts" ? "tab-active text-emerald-800" : ""
          }`}
        >
          <Bell className="w-4 h-4" />
          <span>سجل تنبيهات الأسعار</span>
        </button>
      </div>

      {/* Tab 1: Radar */}
      {activeTab === "radar" && (
        <>
          {loadingWatchlist ? (
            <EmptyState loading title="جارٍ تحميل رادار الأسعار..." />
          ) : watchlistError ? (
            <EmptyState
              error
              title="تعذر تحميل الرادار"
              description={watchlistError}
              actionLabel="إعادة المحاولة"
              onAction={() => void loadWatchlistData()}
            />
          ) : watchlist.items.length === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="قائمة المراقبة فارغة"
              description="أضف الأصناف الحساسة لتغيرات الأسعار من هنا أو مباشرة من الكتالوج الموحّد."
              actionLabel="إضافة صنف للرادار"
              onAction={() => setAddModalOpen(true)}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {watchlist.items.map((item) => {
                const hasAuthorized = item.effectiveWholesaleSdg !== null;
                const isIncrease = item.hasPriceIncrease;

                return (
                  <div
                    key={item.id}
                    className={`card bg-base-100 border shadow-xs ${
                      isIncrease
                      ? "price-increase-alert border-error/50 ring-1 ring-error/20"
                        : "border-base-200"
                    }`}
                  >
                    <div className="card-body p-5 space-y-4">
                      {/* Card Top */}
                      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-extrabold text-base text-slate-900">
                              {item.drug?.tradeName}{" "}
                              <span className="text-sm font-semibold text-emerald-700">
                                {item.drug?.strength}
                              </span>
                            </h3>
                            <StatusBadge
                              map={PRICING_POLICY}
                              value={item.pricingPolicy}
                            />
                            {isIncrease && (
                                <span className="badge badge-error badge-sm font-bold gap-1 tabular-nums">
                                <AlertTriangle className="w-3 h-3" />
                                <span>
                                  ارتفع{" "}
                                  {formatPercent(item.priceDeltaPercent)} (+
                                  {formatSdg(item.priceDeltaSdg)})
                                </span>
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500">
                            {item.drug?.genericName} · {item.drug?.dosageForm} ·{" "}
                            {item.drug?.manufacturer}
                          </p>
                          <p className="text-xs text-slate-600">
                            الموزّع المرجعي:{" "}
                            <span className="font-semibold text-slate-900">
                              {item.referenceDistributor?.name ||
                                "لا يوجد مصدر مصرح به حالياً"}
                            </span>
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setEditingItem(item)}
                            className="btn btn-ghost btn-xs gap-1 text-slate-600"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            <span>تعديل</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingItem(item)}
                            className="btn btn-ghost btn-xs gap-1 text-error"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>حذف</span>
                          </button>
                        </div>
                      </div>

                      {/* Price Metrics Grid */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 rounded-xl bg-slate-50 border border-base-200 p-3.5 text-sm">
                        <div>
                          <span className="text-xs text-slate-500 block">
                            آخر جملة معتمدة
                          </span>
                          <span className="font-bold text-slate-700 tabular-nums">
                            {formatSdg(item.lastAcknowledgedWholesaleSdg)}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 block">
                            الجملة المصرح بها حالياً
                          </span>
                          <span
                            className={`font-extrabold tabular-nums ${
                              hasAuthorized
                                ? isIncrease
                                  ? "text-error"
                                  : "text-slate-900"
                                : "text-slate-400"
                            }`}
                          >
                            {hasAuthorized
                              ? formatSdg(item.effectiveWholesaleSdg)
                              : "غير متاح (بانتظار التصريح)"}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 block">
                            سعر الرف الحالي
                          </span>
                          <span className="font-bold text-slate-700 tabular-nums">
                            {formatSdg(item.currentShelfPriceSdg)}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-slate-500 block">
                            المقترح (هامش {Number(item.profitMarginPercent)}%)
                          </span>
                          <span className="font-extrabold text-emerald-700 tabular-nums">
                            {formatSdg(item.suggestedShelfPriceSdg)}
                          </span>
                        </div>
                      </div>

                      {/* Acknowledge Controls */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
                        <div className="flex items-center gap-2 flex-1 max-w-xs">
                          <input
                            type="number"
                            min={1}
                            disabled={!hasAuthorized || ackingId === item.id}
                            value={customShelfInputs[item.id] ?? ""}
                            onChange={(e) =>
                              setCustomShelfInputs((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            placeholder={
                              hasAuthorized
                                ? `سعر رف مخصص (افتراضي ${
                                    item.suggestedShelfPriceSdg ?? "—"
                                  })`
                                : "لا يوجد سعر مصرح به"
                            }
                            className="input input-bordered input-xs h-9 w-full tabular-nums"
                          />
                        </div>

                        <button
                          type="button"
                          disabled={!hasAuthorized || ackingId === item.id}
                          onClick={() => void handleAcknowledge(item)}
                          className={`btn btn-sm font-bold gap-1.5 ${
                            isIncrease ? "btn-primary" : "btn-outline btn-primary"
                          }`}
                        >
                          {ackingId === item.id ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          <span>
                            {hasAuthorized
                              ? "اعتماد سعر الرف"
                              : "لا يوجد سعر مصرح به"}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Tab 2: Price Alerts Log */}
      {activeTab === "alerts" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 bg-base-100 border border-base-200 rounded-xl px-4 py-3">
            <span className="text-sm font-semibold text-slate-700">
              عرض تغييرات أسعار الموزعين المصرح بهم فقط
            </span>
            <label className="label cursor-pointer gap-2 p-0">
              <input
                type="checkbox"
                checked={watchedOnly}
                onChange={(e) => setWatchedOnly(e.target.checked)}
                className="toggle toggle-primary toggle-sm"
              />
              <span className="label-text text-xs font-bold text-slate-700">
                أصناف الرادار فقط
              </span>
            </label>
          </div>

          {loadingAlerts ? (
            <EmptyState loading title="جارٍ تحميل سجل تغيرات الأسعار..." />
          ) : alerts.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="لا توجد تنبيهات أسعار مسجلة"
              description={
                watchedOnly
                  ? "لم تتغير أسعار الأصناف الموجودة في قائمة متابعتك مؤخراً."
                  : "لا توجد تغييرات أسعار مسجلة لدى الموزعين المصرح بهم حالياً."
              }
            />
          ) : (
            <div className="card bg-base-100 border border-base-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table table-zebra">
                  <thead className="bg-slate-50 text-slate-700 text-xs">
                    <tr>
                      <th>الصنف</th>
                      <th>الموزّع</th>
                      <th>السعر السابق</th>
                      <th>السعر الجديد</th>
                      <th>نسبة التغيير</th>
                      <th>التوقيت</th>
                    </tr>
                  </thead>
                  <tbody>
                    {alerts.map((alert) => {
                      const pctNum = Number(alert.percentChange);
                      const isUp = pctNum > 0;
                      return (
                        <tr key={alert.id}>
                          <td>
                            <div className="font-bold text-slate-900">
                              {alert.drug?.tradeName}{" "}
                              <span className="text-xs font-normal text-slate-500">
                                {alert.drug?.strength}
                              </span>
                            </div>
                            <div className="text-xs text-slate-500">
                              {alert.manufacturer}
                            </div>
                          </td>
                          <td className="text-sm font-semibold text-slate-700">
                            {alert.distributorName}
                          </td>
                          <td className="text-slate-500 line-through tabular-nums">
                            {formatSdg(alert.oldPriceSdg)}
                          </td>
                          <td className="font-bold text-slate-900 tabular-nums">
                            {formatSdg(alert.newPriceSdg)}
                          </td>
                          <td>
                            <span
                              className={`badge badge-sm font-bold tabular-nums ${
                                isUp ? "badge-error" : "badge-success"
                              }`}
                            >
                              {formatPercent(alert.percentChange)}
                            </span>
                          </td>
                          <td className="text-xs text-slate-500">
                            {formatRelativeTime(alert.changedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <AddWatchlistModal
        open={addModalOpen}
        distributors={distributors}
        onClose={() => setAddModalOpen(false)}
        onCreated={() => void loadWatchlistData()}
      />

      <EditWatchlistModal
        item={editingItem}
        distributors={distributors}
        onClose={() => setEditingItem(null)}
        onSaved={() => void loadWatchlistData()}
      />

      <ConfirmModal
        open={Boolean(deletingItem)}
        title="حذف صنف من رادار الأسعار"
        message={
          deletingItem
            ? `هل أنت متأكد من إزالة "${deletingItem.drug?.tradeName}" من قائمة المراقبة؟`
            : ""
        }
        confirmLabel="حذف الصنف"
        cancelLabel="تراجع"
        confirmVariant="btn-error"
        loading={deletingSubmitting}
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setDeletingItem(null)}
      />
    </div>
  );
}
