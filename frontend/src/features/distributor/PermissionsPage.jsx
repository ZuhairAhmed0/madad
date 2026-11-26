import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  ShieldOff,
} from "lucide-react";
import AutoRefreshBadge from "../../components/ui/AutoRefreshBadge";
import ConfirmModal from "../../components/ui/ConfirmModal";
import EmptyState from "../../components/ui/EmptyState";
import StatusBadge from "../../components/ui/StatusBadge";
import { useToast } from "../../context/ToastContext";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { PERMISSION_STATUS } from "../../lib/constants";
import { formatDateTime, formatRelativeTime } from "../../lib/format";
import {
  fetchDistributorPermissions,
  fetchNewPharmacies,
  updatePermissionStatus,
} from "./distributorApi";

const PERMISSION_FILTERS = [
  { value: "", label: "الكل" },
  { value: "PENDING", label: "قيد الانتظار" },
  { value: "APPROVED", label: "مصرح بها" },
  { value: "REVOKED", label: "ملغاة" },
];

export default function PermissionsPage() {
  const toast = useToast();

  const [activeTab, setActiveTab] = useState("requests");
  const [statusFilter, setStatusFilter] = useState("");
  const [allPermissions, setAllPermissions] = useState([]);
  const [loadingPermissions, setLoadingPermissions] = useState(true);
  const [permError, setPermError] = useState(null);

  const [regionInput, setRegionInput] = useState("");
  const [debouncedRegion, setDebouncedRegion] = useState("");
  const [newPharmacies, setNewPharmacies] = useState([]);
  const [loadingPharmacies, setLoadingPharmacies] = useState(true);

  const [busyId, setBusyId] = useState(null);
  const [revokeTarget, setRevokeTarget] = useState(null);

  const permFgControllerRef = useRef(null);
  const permBgControllerRef = useRef(null);
  const pharmFgControllerRef = useRef(null);
  const pharmBgControllerRef = useRef(null);
  const markRefreshedRef = useRef(() => {});

  useEffect(() => {
    return () => {
      permFgControllerRef.current?.abort();
      permBgControllerRef.current?.abort();
      pharmFgControllerRef.current?.abort();
      pharmBgControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedRegion(regionInput.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [regionInput]);

  const loadPermissions = useCallback(async ({ silent = false } = {}) => {
    if (silent) {
      if (permFgControllerRef.current) return false;

      permBgControllerRef.current?.abort();
      const controller = new AbortController();
      permBgControllerRef.current = controller;

      try {
        const rows = await fetchDistributorPermissions(undefined, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return false;
        setAllPermissions(rows);
        return true;
      } catch {
        return false;
      } finally {
        if (permBgControllerRef.current === controller) {
          permBgControllerRef.current = null;
        }
      }
    }

    permBgControllerRef.current?.abort();
    permBgControllerRef.current = null;
    permFgControllerRef.current?.abort();
    const controller = new AbortController();
    permFgControllerRef.current = controller;

    setLoadingPermissions(true);
    setPermError(null);
    try {
      // Fetch unfiltered list so the PENDING badge stays accurate across all filter pills.
      const rows = await fetchDistributorPermissions(undefined, {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return false;
      setAllPermissions(rows);
      markRefreshedRef.current?.();
      return true;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return false;
      setPermError(
        err instanceof Error ? err.message : "تعذر تحميل طلبات صلاحيات الأسعار"
      );
      return false;
    } finally {
      if (permFgControllerRef.current === controller) {
        permFgControllerRef.current = null;
      }
      if (!controller.signal.aborted) {
        setLoadingPermissions(false);
      }
    }
  }, []);

  const loadPharmacies = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) {
        if (pharmFgControllerRef.current) return false;

        pharmBgControllerRef.current?.abort();
        const controller = new AbortController();
        pharmBgControllerRef.current = controller;

        try {
          const rows = await fetchNewPharmacies(debouncedRegion || undefined, {
            signal: controller.signal,
          });
          if (controller.signal.aborted) return false;
          setNewPharmacies(rows);
          return true;
        } catch {
          return false;
        } finally {
          if (pharmBgControllerRef.current === controller) {
            pharmBgControllerRef.current = null;
          }
        }
      }

      pharmBgControllerRef.current?.abort();
      pharmBgControllerRef.current = null;
      pharmFgControllerRef.current?.abort();
      const controller = new AbortController();
      pharmFgControllerRef.current = controller;

      setLoadingPharmacies(true);
      try {
        const rows = await fetchNewPharmacies(debouncedRegion || undefined, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return false;
        setNewPharmacies(rows);
        markRefreshedRef.current?.();
        return true;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return false;
        toast.error("تعذر تحميل قائمة الصيدليات المرخصة");
        return false;
      } finally {
        if (pharmFgControllerRef.current === controller) {
          pharmFgControllerRef.current = null;
        }
        if (!controller.signal.aborted) {
          setLoadingPharmacies(false);
        }
      }
    },
    [debouncedRegion, toast]
  );

  useEffect(() => {
    void loadPermissions();
  }, [loadPermissions]);

  useEffect(() => {
    void loadPharmacies();
  }, [loadPharmacies]);

  const pendingCount = useMemo(
    () => allPermissions.filter((p) => p.status === "PENDING").length,
    [allPermissions]
  );

  const filteredPermissions = useMemo(() => {
    if (!statusFilter) return allPermissions;
    return allPermissions.filter((p) => p.status === statusFilter);
  }, [allPermissions, statusFilter]);

  const syncAllTabs = useCallback(
    async ({ silent = false } = {}) => {
      const [permOk, pharmOk] = await Promise.all([
        loadPermissions({ silent }),
        loadPharmacies({ silent }),
      ]);
      return permOk && pharmOk;
    },
    [loadPermissions, loadPharmacies]
  );

  const isAutoRefreshPaused = Boolean(revokeTarget) || Boolean(busyId);

  const handleBackgroundRefresh = useCallback(
    () => syncAllTabs({ silent: true }),
    [syncAllTabs]
  );

  const { isBackgroundRefreshing, lastRefreshedAt, markRefreshed } =
    useAutoRefresh(handleBackgroundRefresh, {
      enabled:
        !loadingPermissions && !loadingPharmacies && !isAutoRefreshPaused,
    });

  useEffect(() => {
    markRefreshedRef.current = markRefreshed;
  }, [markRefreshed]);

  const handlePermissionChange = async (permissionId, nextStatus, pharmName) => {
    if (!permissionId || busyId) return;

    setBusyId(permissionId);
    try {
      await updatePermissionStatus(permissionId, nextStatus);
      toast.success(
        nextStatus === "APPROVED"
          ? `تمت الموافقة على إظهار أسعار الجملة لـ "${pharmName}"`
          : `تم سحب صلاحية الأسعار من "${pharmName}"`
      );
      setRevokeTarget(null);
      await syncAllTabs();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "تعذر تحديث حالة الصلاحية"
      );
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="portal-page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-slate-900">
            الصلاحيات والصيدليات المرخصة
          </h1>
          <p className="text-sm text-slate-600">
            تحكّم بمن يطّلع على أسعار الجملة الخاصة بمخزنك وتابع الصيدليات
            المنضمة حديثاً.
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
            onClick={() => void syncAllTabs()}
            disabled={loadingPermissions || loadingPharmacies}
            className="btn btn-outline btn-sm border-base-300 gap-1.5"
          >
            <RefreshCw
              className={`w-4 h-4 ${
                loadingPermissions || loadingPharmacies ? "animate-spin" : ""
              }`}
            />
            <span>تحديث</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div role="tablist" className="tabs tabs-box bg-base-200/70 p-1 w-fit">
        <button
          type="button"
          role="tab"
          onClick={() => setActiveTab("requests")}
          className={`tab font-bold gap-2 ${
            activeTab === "requests" ? "tab-active text-emerald-800" : ""
          }`}
        >
          <KeyRound className="w-4 h-4" />
          <span>طلبات صلاحية الأسعار</span>
          {pendingCount > 0 && (
            <span className="badge badge-warning badge-xs font-extrabold">
              {pendingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          onClick={() => setActiveTab("directory")}
          className={`tab font-bold gap-2 ${
            activeTab === "directory" ? "tab-active text-emerald-800" : ""
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>الصيدليات المرخصة حديثاً</span>
        </button>
      </div>

      {/* Tab 1: Permissions */}
      {activeTab === "requests" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {PERMISSION_FILTERS.map((filter) => {
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
                  <span>{filter.label}</span>
                  {filter.value === "PENDING" && pendingCount > 0 && (
                    <span className="badge badge-xs badge-warning font-bold">
                      {pendingCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {loadingPermissions ? (
            <EmptyState loading title="جارٍ تحميل طلبات الصلاحيات..." />
          ) : permError ? (
            <EmptyState
              error
              title="تعذر تحميل الطلبات"
              description={permError}
              actionLabel="إعادة المحاولة"
              onAction={() => void loadPermissions()}
            />
          ) : filteredPermissions.length === 0 ? (
            <EmptyState
              icon={KeyRound}
              title="لا توجد طلبات صلاحية مطابقة"
              description="عند إرسال أي صيدلية طلب الاطلاع على الأسعار سيظهر هنا للموافقة أو الرفض."
            />
          ) : (
            <div className="card bg-base-100 border border-base-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table table-zebra align-middle">
                  <thead className="bg-slate-50 text-slate-700 text-xs">
                    <tr>
                      <th>الصيدلية</th>
                      <th>رقم الترخيص</th>
                      <th>المنطقة</th>
                      <th>حالة الصلاحية</th>
                      <th>آخر تحديث</th>
                      <th className="text-end">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPermissions.map((perm) => {
                      const canApprove =
                        perm.status === "PENDING" || perm.status === "REVOKED";
                      const canRevoke =
                        perm.status === "APPROVED" || perm.status === "PENDING";
                      const isRowBusy = busyId === perm.id;
                      const pharmName = perm.pharmacy?.name || "الصيدلية";

                      return (
                        <tr key={perm.id}>
                          <td className="font-bold text-slate-900">
                            {pharmName}
                          </td>
                          <td className="font-mono text-xs text-slate-600">
                            {perm.pharmacy?.licenseNumber}
                          </td>
                          <td className="text-xs text-slate-600">
                            {perm.pharmacy?.region}
                          </td>
                          <td>
                            <StatusBadge
                              map={PERMISSION_STATUS}
                              value={perm.status}
                            />
                          </td>
                          <td className="text-xs text-slate-500">
                            {formatRelativeTime(perm.updatedAt)}
                          </td>
                          <td className="text-end min-w-52">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {canApprove && (
                                <button
                                  type="button"
                                  disabled={Boolean(busyId)}
                                  onClick={() =>
                                    void handlePermissionChange(
                                      perm.id,
                                      "APPROVED",
                                      pharmName
                                    )
                                  }
                                  className="btn btn-primary btn-xs font-bold gap-1"
                                >
                                  {isRowBusy ? (
                                    <span className="loading loading-spinner loading-xs" />
                                  ) : (
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  )}
                                  <span>موافقة على إظهار الأسعار</span>
                                </button>
                              )}

                              {canRevoke && (
                                <button
                                  type="button"
                                  disabled={Boolean(busyId)}
                                  onClick={() =>
                                    setRevokeTarget({
                                      id: perm.id,
                                      name: pharmName,
                                    })
                                  }
                                  className="btn btn-outline btn-error btn-xs gap-1 font-bold"
                                >
                                  <ShieldOff className="w-3.5 h-3.5" />
                                  <span>سحب الصلاحية</span>
                                </button>
                              )}
                            </div>
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

      {/* Tab 2: Newly Verified Pharmacies Directory */}
      {activeTab === "directory" && (
        <div className="space-y-4">
          <div className="card bg-base-100 border border-base-200 shadow-xs">
            <div className="card-body p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <span className="text-sm font-bold text-slate-700">
                تصفية الصيدليات المرخصة حسب المنطقة:
              </span>
              <input
                type="search"
                value={regionInput}
                onChange={(e) => setRegionInput(e.target.value)}
                placeholder="مثال: الفتيحاب أو الثورة..."
                className="input input-bordered input-sm w-full sm:w-72 h-10"
              />
            </div>
          </div>

          {loadingPharmacies ? (
            <EmptyState loading title="جارٍ تحميل دليل الصيدليات..." />
          ) : newPharmacies.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="لا توجد صيدليات مطابقة"
              description="جرّب تغيير كلمة البحث الخاصة بالمنطقة."
            />
          ) : (
            <div className="card bg-base-100 border border-base-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table table-zebra align-middle">
                  <thead className="bg-slate-50 text-slate-700 text-xs">
                    <tr>
                      <th>اسم الصيدلية</th>
                      <th>رقم الترخيص</th>
                      <th>المنطقة</th>
                      <th>تاريخ التوثيق</th>
                      <th>حالة صلاحية الأسعار</th>
                      <th className="text-end">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newPharmacies.map((pharm) => {
                      const hasPerm = Boolean(pharm.permissionId);
                      const isRowBusy = hasPerm && busyId === pharm.permissionId;

                      return (
                        <tr key={pharm.id}>
                          <td className="font-bold text-slate-900">
                            {pharm.name}
                          </td>
                          <td className="font-mono text-xs text-slate-600">
                            {pharm.licenseNumber}
                          </td>
                          <td className="text-xs text-slate-600">
                            {pharm.region}
                          </td>
                          <td className="text-xs text-slate-500">
                            {formatDateTime(pharm.verifiedAt)}
                          </td>
                          <td>
                            <StatusBadge
                              map={PERMISSION_STATUS}
                              value={pharm.permissionStatus}
                            />
                          </td>
                          <td className="text-end min-w-44">
                            {!hasPerm ? (
                              <span className="text-xs text-slate-400">
                                بانتظار طلب الصيدلية
                              </span>
                            ) : pharm.permissionStatus === "APPROVED" ? (
                              <button
                                type="button"
                                disabled={Boolean(busyId)}
                                onClick={() =>
                                  setRevokeTarget({
                                    id: pharm.permissionId,
                                    name: pharm.name,
                                  })
                                }
                                className="btn btn-outline btn-error btn-xs gap-1 font-bold"
                              >
                                <ShieldOff className="w-3.5 h-3.5" />
                                <span>سحب الصلاحية</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={Boolean(busyId)}
                                onClick={() =>
                                  void handlePermissionChange(
                                    pharm.permissionId,
                                    "APPROVED",
                                    pharm.name
                                  )
                                }
                                className="btn btn-primary btn-xs font-bold gap-1"
                              >
                                {isRowBusy ? (
                                  <span className="loading loading-spinner loading-xs" />
                                ) : (
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                )}
                                <span>موافقة</span>
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
        </div>
      )}

      <ConfirmModal
        open={Boolean(revokeTarget)}
        title="تأكيد سحب صلاحية الأسعار"
        message={
          revokeTarget
            ? `سيتم حجب أسعار الجملة فوراً عن "${revokeTarget.name}" ومنعها من تقديم طلبيات جديدة حتى إعادة الموافقة. هل تريد المتابعة؟`
            : ""
        }
        confirmLabel="نعم، سحب الصلاحية"
        cancelLabel="تراجع"
        confirmVariant="btn-error"
        loading={Boolean(busyId && revokeTarget?.id === busyId)}
        onConfirm={() =>
          revokeTarget &&
          void handlePermissionChange(
            revokeTarget.id,
            "REVOKED",
            revokeTarget.name
          )
        }
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
