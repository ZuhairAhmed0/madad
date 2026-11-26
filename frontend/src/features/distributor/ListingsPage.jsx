import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Clock,
  Edit3,
  PauseCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Tags,
  X,
} from "lucide-react";
import AutoRefreshBadge from "../../components/ui/AutoRefreshBadge";
import ConfirmModal from "../../components/ui/ConfirmModal";
import EmptyState from "../../components/ui/EmptyState";
import StatusBadge from "../../components/ui/StatusBadge";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { ApiError } from "../../lib/api";
import { SALES_STATUS } from "../../lib/constants";
import { formatRelativeTime, formatSdg } from "../../lib/format";
import BulkPricingCard from "./BulkPricingCard";
import {
  createDistributorListing,
  fetchDistributorListings,
  fetchManufacturers,
  fetchMasterDrugs,
  updateDistributorListing,
  updateDistributorStatus,
} from "./distributorApi";

const PG_INT4_MAX = 2_147_483_647;

function validatePositiveSdgPrice(rawValue) {
  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed) {
    return { valid: false, message: "يرجى إدخال السعر بالجنيه السوداني" };
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > PG_INT4_MAX) {
    return {
      valid: false,
      message: "السعر يجب أن يكون عدداً صحيحاً موجباً بالجنيه السوداني",
    };
  }
  return { valid: true, value: parsed };
}

function AddListingModal({ open, listedDrugIds, onClose, onCreated }) {
  const toast = useToast();
  const dialogRef = useRef(null);

  const [drugQuery, setDrugQuery] = useState("");
  const [drugOptions, setDrugOptions] = useState([]);
  const [loadingDrugs, setLoadingDrugs] = useState(false);
  const [selectedDrugId, setSelectedDrugId] = useState("");
  const [priceInput, setPriceInput] = useState("");
  const [isAvailable, setIsAvailable] = useState(true);
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
            const firstUnlisted = drugs.find((d) => !listedDrugIds.has(d.id));
            setSelectedDrugId((firstUnlisted || drugs[0]).id);
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
  }, [open, drugQuery, selectedDrugId, listedDrugIds, toast]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    if (!selectedDrugId) {
      toast.warning("يرجى اختيار الدواء المرجعي");
      return;
    }

    const priceCheck = validatePositiveSdgPrice(priceInput);
    if (!priceCheck.valid) {
      toast.warning(priceCheck.message);
      return;
    }

    setSubmitting(true);
    try {
      await createDistributorListing({
        drugId: selectedDrugId,
        wholesalePriceSdg: priceCheck.value,
        isAvailable,
      });
      toast.success("تمت إضافة الصنف إلى قائمة المخزن بنجاح");
      setPriceInput("");
      onCreated();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.warning("هذا الصنف مضاف مسبقاً في قائمتك؛ يمكنك تعديله من الجدول");
      } else {
        toast.error(
          err instanceof Error ? err.message : "تعذر إضافة الصنف الجديد"
        );
      }
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
          إضافة صنف جديد لقائمة المخزن
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text text-xs font-bold text-slate-700">
                البحث في دليل الأدوية المرجعي
              </span>
            </label>
            <input
              type="search"
              value={drugQuery}
              onChange={(e) => setDrugQuery(e.target.value)}
              placeholder="ابحث بالاسم التجاري أو المادة الفعالة..."
              className="input input-bordered input-sm w-full h-10"
            />
          </div>

          <div className="form-control">
            <label className="label">
              <span className="label-text text-xs font-bold text-slate-700">
                الصنف *
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
                drugOptions.map((drug) => {
                  const alreadyAdded = listedDrugIds.has(drug.id);
                  return (
                    <option key={drug.id} value={drug.id}>
                      {drug.tradeName} ({drug.strength}) — {drug.manufacturer}
                      {alreadyAdded ? " [مضاف مسبقاً]" : ""}
                    </option>
                  );
                })
              )}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div className="form-control">
              <label className="label">
                <span className="label-text text-xs font-bold text-slate-700">
                  سعر الجملة (عدد صحيح بالجنيه) *
                </span>
              </label>
              <input
                type="number"
                step="1"
                min={1}
                max={PG_INT4_MAX}
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="مثال: 15000"
                className="input input-bordered input-sm w-full h-10 tabular-nums"
                required
              />
            </div>

            <label className="label cursor-pointer justify-start gap-3 pt-6">
              <input
                type="checkbox"
                checked={isAvailable}
                onChange={(e) => setIsAvailable(e.target.checked)}
                className="toggle toggle-primary toggle-sm"
              />
              <span className="label-text text-sm font-semibold text-slate-700">
                متوفر حالياً للبيع
              </span>
            </label>
          </div>

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
              <span>حفظ وإضافة الصنف</span>
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

export default function ListingsPage() {
  const { organization, setOrganization } = useAuth();
  const toast = useToast();

  // Operational status state
  const [expiryInput, setExpiryInput] = useState(() =>
    String(organization?.orderExpiryMinutes ?? 60)
  );
  const [statusBusy, setStatusBusy] = useState(false);
  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false);

  // Catalog & unfiltered summary state
  const [catalogManufacturers, setCatalogManufacturers] = useState([]);
  const [unfilteredListings, setUnfilteredListings] = useState([]);
  const [summaryTick, setSummaryTick] = useState(0);

  // Filter state
  const [searchInput, setSearchInput] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);

  // Filtered table state
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  // Row interaction & modals
  const [busyListingId, setBusyListingId] = useState(null);
  const [editingListingId, setEditingListingId] = useState(null);
  const [editPriceInput, setEditPriceInput] = useState("");
  const [addModalOpen, setAddModalOpen] = useState(false);

  const fgControllerRef = useRef(null);
  const bgControllerRef = useRef(null);
  const markRefreshedRef = useRef(() => {});

  useEffect(() => {
    return () => {
      bgControllerRef.current?.abort();
    };
  }, []);

  const buildListingQuery = useCallback(
    () => ({
      q: debouncedQ || undefined,
      manufacturer: manufacturer || undefined,
      availableOnly,
    }),
    [debouncedQ, manufacturer, availableOnly]
  );

  useEffect(() => {
    if (organization?.orderExpiryMinutes !== undefined) {
      setExpiryInput(String(organization.orderExpiryMinutes));
    }
  }, [organization?.orderExpiryMinutes]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(searchInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    let active = true;
    fetchManufacturers()
      .then((list) => {
        if (active) setCatalogManufacturers(list);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Always load unfiltered distributor listings for accurate BulkPricingCard manufacturer counts.
  useEffect(() => {
    const controller = new AbortController();
    fetchDistributorListings({}, { signal: controller.signal })
      .then((rows) => {
        if (!controller.signal.aborted) {
          setUnfilteredListings(rows);
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, [summaryTick]);

  // Load filtered distributor listings view with AbortController; preempt any silent background sync.
  useEffect(() => {
    bgControllerRef.current?.abort();
    bgControllerRef.current = null;

    const controller = new AbortController();
    fgControllerRef.current = controller;
    setLoading(true);
    setErrorMsg(null);

    const query = buildListingQuery();

    (async () => {
      try {
        const rows = await fetchDistributorListings(query, {
          signal: controller.signal,
        });
        if (!controller.signal.aborted) {
          setListings(rows);
          markRefreshedRef.current?.();
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "تعذر تحميل قائمة الأصناف والأسعار"
        );
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
  }, [buildListingQuery, reloadTick]);

  const handleBackgroundRefresh = useCallback(async () => {
    if (fgControllerRef.current) return false;

    bgControllerRef.current?.abort();
    const controller = new AbortController();
    bgControllerRef.current = controller;

    const query = buildListingQuery();
    const isUnfiltered = !query.q && !query.manufacturer && !query.availableOnly;

    try {
      if (isUnfiltered) {
        const rows = await fetchDistributorListings(
          {},
          { signal: controller.signal }
        );
        if (controller.signal.aborted) return false;
        setListings(rows);
        setUnfilteredListings(rows);
        setErrorMsg(null);
        return true;
      }

      const [filteredRows, allRows] = await Promise.all([
        fetchDistributorListings(query, { signal: controller.signal }),
        fetchDistributorListings({}, { signal: controller.signal }),
      ]);
      if (controller.signal.aborted) return false;

      setListings(filteredRows);
      setUnfilteredListings(allRows);
      setErrorMsg(null);
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return false;
      }
      return false;
    } finally {
      if (bgControllerRef.current === controller) {
        bgControllerRef.current = null;
      }
    }
  }, [buildListingQuery]);

  const isAutoRefreshPaused =
    addModalOpen ||
    pauseConfirmOpen ||
    editingListingId !== null ||
    busyListingId !== null ||
    statusBusy;

  const { isBackgroundRefreshing, lastRefreshedAt, markRefreshed } =
    useAutoRefresh(handleBackgroundRefresh, {
      enabled: !loading && !isAutoRefreshPaused,
    });

  useEffect(() => {
    markRefreshedRef.current = markRefreshed;
  }, [markRefreshed]);

  const { manufacturerCounts, listedDrugIds } = useMemo(() => {
    const counts = {};
    const drugSet = new Set();
    for (const item of unfilteredListings) {
      drugSet.add(item.drugId);
      const mfr = item.drug?.manufacturer;
      if (mfr) {
        counts[mfr] = (counts[mfr] || 0) + 1;
      }
    }
    return { manufacturerCounts: counts, listedDrugIds: drugSet };
  }, [unfilteredListings]);

  const refreshBothViews = useCallback(() => {
    setReloadTick((t) => t + 1);
    setSummaryTick((t) => t + 1);
  }, []);

  const isPaused = organization?.salesStatus === "PAUSED_REPRICING";

  const handleToggleSalesStatus = async (targetStatus) => {
    if (statusBusy) return;
    setStatusBusy(true);
    try {
      const res = await updateDistributorStatus({ salesStatus: targetStatus });
      if (res?.organization) {
        setOrganization(res.organization);
      }
      toast.success(
        targetStatus === "PAUSED_REPRICING"
          ? "تم إيقاف استقبال الطلبيات مؤقتاً لإعادة التسعير"
          : "تم فتح استقبال الطلبيات بنجاح"
      );
      setPauseConfirmOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "تعذر تحديث حالة المبيعات"
      );
    } finally {
      setStatusBusy(false);
    }
  };

  const handleSaveExpiryMinutes = async (event) => {
    event.preventDefault();
    if (statusBusy) return;

    const trimmed = String(expiryInput).trim();
    const parsed = Number(trimmed);
    if (!trimmed || !Number.isInteger(parsed) || parsed < 1 || parsed > 1440) {
      toast.warning("مهلة تأكيد الطلبية يجب أن تكون عدداً صحيحاً بين 1 و 1440 دقيقة");
      return;
    }

    setStatusBusy(true);
    try {
      const res = await updateDistributorStatus({
        orderExpiryMinutes: parsed,
      });
      if (res?.organization) {
        setOrganization(res.organization);
      }
      toast.success(`تم تحديث مهلة تأكيد الطلبيات إلى ${parsed} دقيقة`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "تعذر تحديث مهلة التأكيد"
      );
    } finally {
      setStatusBusy(false);
    }
  };

  const handleToggleAvailability = async (row) => {
    if (busyListingId) return;

    const nextAvailable = !row.isAvailable;
    setBusyListingId(row.id);
    try {
      const res = await updateDistributorListing(row.id, {
        isAvailable: nextAvailable,
      });
      const updated = res?.listing;
      setListings((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                isAvailable: updated?.isAvailable ?? nextAvailable,
                updatedAt: updated?.updatedAt ?? item.updatedAt,
              }
            : item
        )
      );
      setSummaryTick((t) => t + 1);
      toast.success(
        nextAvailable
          ? `تم تفعيل توفر "${row.drug?.tradeName}"`
          : `تم تعيين "${row.drug?.tradeName}" كغير متوفر`
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "تعذر تحديث حالة التوفر"
      );
    } finally {
      setBusyListingId(null);
    }
  };

  const handleSaveInlinePrice = async (row) => {
    if (busyListingId) return;

    const priceCheck = validatePositiveSdgPrice(editPriceInput);
    if (!priceCheck.valid) {
      toast.warning(priceCheck.message);
      return;
    }

    if (priceCheck.value === row.wholesalePriceSdg) {
      setEditingListingId(null);
      return;
    }

    setBusyListingId(row.id);
    try {
      const res = await updateDistributorListing(row.id, {
        wholesalePriceSdg: priceCheck.value,
      });
      const updated = res?.listing;
      setListings((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                wholesalePriceSdg:
                  updated?.wholesalePriceSdg ?? priceCheck.value,
                priceVersion: updated?.priceVersion ?? item.priceVersion + 1,
                updatedAt: updated?.updatedAt ?? new Date().toISOString(),
              }
            : item
        )
      );
      setSummaryTick((t) => t + 1);
      setEditingListingId(null);
      toast.success(`تم تحديث سعر "${row.drug?.tradeName}" بنجاح`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "تعذر تحديث سعر الصنف"
      );
    } finally {
      setBusyListingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="portal-page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-slate-900">
            الأصناف والتسعير
          </h1>
          <p className="text-sm text-slate-600">
            أدر قائمة أدوية المخزن، تحكّم في حالة استقبال الطلبيات، ونفّذ تعديلات
            الأسعار الفردية والجماعية.
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
            onClick={refreshBothViews}
            disabled={loading}
            className="btn btn-outline btn-sm border-base-300 gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span>تحديث</span>
          </button>

          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="btn btn-primary btn-sm font-bold gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة صنف جديد</span>
          </button>
        </div>
      </div>

      {/* Top Operational Control Bar */}
      <div
        className={`operational-status-card card border shadow-xs ${isPaused ? "is-paused" : ""} ${
          isPaused
            ? "bg-amber-50/70 border-amber-300"
            : "bg-base-100 border-base-200"
        }`}
      >
        <div className="card-body p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-slate-500 block">
                حالة استقبال الطلبيات الآن
              </span>
              <StatusBadge
                map={SALES_STATUS}
                value={organization?.salesStatus || "OPEN"}
              />
            </div>

            {isPaused ? (
              <button
                type="button"
                disabled={statusBusy}
                onClick={() => void handleToggleSalesStatus("OPEN")}
                className="btn btn-success btn-sm font-bold gap-1.5"
              >
                {statusBusy ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <PlayCircle className="w-4 h-4" />
                )}
                <span>فتح استقبال الطلبيات</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={statusBusy}
                onClick={() => setPauseConfirmOpen(true)}
                className="btn btn-warning btn-sm font-bold gap-1.5"
              >
                <PauseCircle className="w-4 h-4" />
                <span>إيقاف استقبال الطلبيات مؤقتاً لإعادة التسعير</span>
              </button>
            )}
          </div>

          <form
            onSubmit={handleSaveExpiryMinutes}
            className="flex items-center gap-2 flex-wrap"
          >
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Clock className="w-4 h-4 text-slate-500" />
              <span>مهلة تأكيد الطلبية (دقيقة):</span>
            </span>
            <input
              type="number"
              step="1"
              min={1}
              max={1440}
              disabled={statusBusy}
              value={expiryInput}
              onChange={(e) => setExpiryInput(e.target.value)}
              className="input input-bordered input-xs h-9 w-24 text-center font-bold tabular-nums"
              required
            />
            <button
              type="submit"
              disabled={statusBusy}
              className="btn btn-outline btn-xs h-9 px-3 font-bold"
            >
              حفظ المهلة
            </button>
          </form>
        </div>
      </div>

      {/* ACID Bulk Pricing Card */}
      <BulkPricingCard
        manufacturerCounts={manufacturerCounts}
        catalogManufacturers={catalogManufacturers}
        onPricingApplied={refreshBothViews}
      />

      {/* Search & Filter Controls */}
      <div className="card bg-base-100 border border-base-200 shadow-xs">
        <div className="card-body p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
          <div className="lg:col-span-6">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ابحث داخل أصناف المخزن بالاسم التجاري أو المادة الفعالة..."
              className="input input-bordered input-sm w-full h-10"
            />
          </div>

          <div className="lg:col-span-4">
            <select
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              className="select select-bordered select-sm w-full h-10"
            >
              <option value="">كل الشركات المنتجة</option>
              {Object.keys(manufacturerCounts)
                .sort((a, b) => a.localeCompare(b))
                .map((mfr) => (
                  <option key={mfr} value={mfr}>
                    {mfr}
                  </option>
                ))}
            </select>
          </div>

          <div className="lg:col-span-2 flex items-center justify-end">
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
      </div>

      {/* Listings Table */}
      {loading && listings.length === 0 ? (
        <EmptyState loading title="جارٍ تحميل قائمة الأصناف..." />
      ) : errorMsg ? (
        <EmptyState
          error
          title="تعذر تحميل الأصناف"
          description={errorMsg}
          actionLabel="إعادة المحاولة"
          onAction={refreshBothViews}
        />
      ) : listings.length === 0 ? (
        <EmptyState
          icon={Tags}
          title="لا توجد أصناف مطابقة"
          description="أضف أصنافاً يدوياً أو عبر صفحة الاستيراد السريع، أو جرّب إزالة الفلاتر الحالية."
          actionLabel={
            searchInput || manufacturer || availableOnly
              ? "إعادة ضبط الفلاتر"
              : "إضافة صنف جديد"
          }
          onAction={() => {
            if (searchInput || manufacturer || availableOnly) {
              setSearchInput("");
              setDebouncedQ("");
              setManufacturer("");
              setAvailableOnly(false);
            } else {
              setAddModalOpen(true);
            }
          }}
        />
      ) : (
        <div className="card bg-base-100 border border-base-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table table-zebra align-middle">
              <thead className="bg-slate-50 text-slate-700 text-xs">
                <tr>
                  <th>الصنف والمادة الفعالة</th>
                  <th>الشركة المنتجة</th>
                  <th>سعر الجملة الحالي</th>
                  <th>التوفر</th>
                  <th>آخر تحديث</th>
                  <th className="text-end">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((row) => {
                  const isEditing = editingListingId === row.id;
                  const isRowBusy = busyListingId === row.id;

                  return (
                    <tr key={row.id}>
                      <td className="min-w-52">
                        <div className="font-bold text-slate-900">
                          {row.drug?.tradeName}{" "}
                          <span className="text-xs font-semibold text-emerald-700">
                            {row.drug?.strength}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500">
                          {row.drug?.genericName} · {row.drug?.dosageForm}
                        </div>
                      </td>

                      <td className="text-xs text-slate-600">
                        {row.drug?.manufacturer}
                      </td>

                      <td className="min-w-44">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="1"
                              min={1}
                              max={PG_INT4_MAX}
                              disabled={isRowBusy}
                              value={editPriceInput}
                              onChange={(e) => setEditPriceInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void handleSaveInlinePrice(row);
                                } else if (e.key === "Escape") {
                                  setEditingListingId(null);
                                }
                              }}
                              className="input input-bordered input-xs h-8 w-28 font-bold tabular-nums"
                              autoFocus
                            />
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() => void handleSaveInlinePrice(row)}
                              className="btn btn-primary btn-xs btn-square"
                              aria-label="حفظ السعر"
                            >
                              {isRowBusy ? (
                                <span className="loading loading-spinner loading-xs" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              disabled={isRowBusy}
                              onClick={() => setEditingListingId(null)}
                              className="btn btn-ghost btn-xs btn-square"
                              aria-label="إلغاء تعديل السعر"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div>
                            <p className="font-extrabold text-sm text-emerald-800 tabular-nums">
                              {formatSdg(row.wholesalePriceSdg)}
                            </p>
                            <span className="text-[11px] font-mono text-slate-400">
                              v{row.priceVersion}
                            </span>
                          </div>
                        )}
                      </td>

                      <td>
                        <label className="label cursor-pointer justify-start gap-2 p-0">
                          <input
                            type="checkbox"
                            checked={row.isAvailable}
                            disabled={Boolean(busyListingId)}
                            onChange={() => void handleToggleAvailability(row)}
                            className="toggle toggle-success toggle-sm"
                          />
                          <span
                            className={`text-xs font-semibold ${
                              row.isAvailable
                                ? "text-emerald-700"
                                : "text-slate-400"
                            }`}
                          >
                            {row.isAvailable ? "متوفر" : "نفد"}
                          </span>
                        </label>
                      </td>

                      <td className="text-xs text-slate-500">
                        {formatRelativeTime(row.updatedAt)}
                      </td>

                      <td className="text-end">
                        {!isEditing && (
                          <button
                            type="button"
                            disabled={Boolean(busyListingId)}
                            onClick={() => {
                              setEditingListingId(row.id);
                              setEditPriceInput(String(row.wholesalePriceSdg));
                            }}
                            className="btn btn-outline btn-xs gap-1 font-bold"
                          >
                            <Edit3 className="w-3 h-3" />
                            <span>تعديل السعر</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AddListingModal
        open={addModalOpen}
        listedDrugIds={listedDrugIds}
        onClose={() => setAddModalOpen(false)}
        onCreated={refreshBothViews}
      />

      <ConfirmModal
        open={pauseConfirmOpen}
        title="إيقاف استقبال الطلبيات مؤقتاً"
        message="سيُمنع استلام أي طلبيات جديدة أثناء وضع الإيقاف لإعادة التسعير حتى تعيد فتح المبيعات. هل تريد المتابعة؟"
        confirmLabel="نعم، إيقاف مؤقت"
        cancelLabel="تراجع"
        confirmVariant="btn-warning"
        loading={statusBusy}
        onConfirm={() => void handleToggleSalesStatus("PAUSED_REPRICING")}
        onCancel={() => setPauseConfirmOpen(false)}
      />
    </div>
  );
}
