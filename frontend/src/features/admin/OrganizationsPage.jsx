import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Ban,
  Building2,
  CheckCircle2,
  Clock,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import AutoRefreshBadge from "../../components/ui/AutoRefreshBadge";
import ConfirmModal from "../../components/ui/ConfirmModal";
import EmptyState from "../../components/ui/EmptyState";
import StatusBadge from "../../components/ui/StatusBadge";
import { useToast } from "../../context/ToastContext";
import { useAutoRefresh } from "../../hooks/useAutoRefresh";
import { ORG_TYPE, VERIFICATION_STATUS } from "../../lib/constants";
import { formatDateTime } from "../../lib/format";
import { fetchAdminOrganizations, verifyAdminOrganization } from "./adminApi";
import CreateOrgModal from "./CreateOrgModal";

const STATUS_PRIORITY = {
  PENDING: 0,
  VERIFIED: 1,
  SUSPENDED: 2,
};

export default function OrganizationsPage() {
  const toast = useToast();

  const [organizations, setOrganizations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [reloadTick, setReloadTick] = useState(0);

  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [busyOrgId, setBusyOrgId] = useState(null);
  const [suspendTarget, setSuspendTarget] = useState(null);

  const fgControllerRef = useRef(null);
  const bgControllerRef = useRef(null);
  const markRefreshedRef = useRef(() => {});

  useEffect(() => {
    return () => {
      bgControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    bgControllerRef.current?.abort();
    bgControllerRef.current = null;

    const controller = new AbortController();
    fgControllerRef.current = controller;
    setLoading(true);
    setErrorMsg(null);

    (async () => {
      try {
        const list = await fetchAdminOrganizations(
          {},
          { signal: controller.signal }
        );
        if (!controller.signal.aborted) {
          setOrganizations(list);
          markRefreshedRef.current?.();
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setErrorMsg(
          err instanceof Error ? err.message : "تعذر تحميل قائمة المنشآت"
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
  }, [reloadTick]);

  const handleBackgroundRefresh = useCallback(async () => {
    if (fgControllerRef.current) return false;

    bgControllerRef.current?.abort();
    const controller = new AbortController();
    bgControllerRef.current = controller;

    try {
      const list = await fetchAdminOrganizations(
        {},
        { signal: controller.signal }
      );
      if (controller.signal.aborted) return false;
      setOrganizations(list);
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
  }, []);

  const isAutoRefreshPaused =
    createOpen || Boolean(suspendTarget) || Boolean(busyOrgId);

  const { isBackgroundRefreshing, lastRefreshedAt, markRefreshed } =
    useAutoRefresh(handleBackgroundRefresh, {
      enabled: !loading && !isAutoRefreshPaused,
    });

  useEffect(() => {
    markRefreshedRef.current = markRefreshed;
  }, [markRefreshed]);

  const counts = useMemo(() => {
    let pending = 0;
    let verified = 0;
    let suspended = 0;

    for (const org of organizations) {
      if (org.verificationStatus === "PENDING") pending += 1;
      else if (org.verificationStatus === "VERIFIED") verified += 1;
      else if (org.verificationStatus === "SUSPENDED") suspended += 1;
    }

    return {
      total: organizations.length,
      pending,
      verified,
      suspended,
    };
  }, [organizations]);

  const filteredAndSortedOrgs = useMemo(() => {
    const term = searchInput.trim().toLowerCase();

    return organizations
      .filter((org) => {
        if (statusFilter && org.verificationStatus !== statusFilter) {
          return false;
        }
        if (typeFilter && org.type !== typeFilter) {
          return false;
        }
        if (!term) return true;

        return (
          org.name.toLowerCase().includes(term) ||
          org.licenseNumber.toLowerCase().includes(term) ||
          org.region.toLowerCase().includes(term) ||
          (org.primaryUser?.email || "").toLowerCase().includes(term) ||
          (org.primaryUser?.fullName || "").toLowerCase().includes(term)
        );
      })
      .sort((a, b) => {
        const prioA = STATUS_PRIORITY[a.verificationStatus] ?? 99;
        const prioB = STATUS_PRIORITY[b.verificationStatus] ?? 99;
        if (prioA !== prioB) {
          return prioA - prioB;
        }
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      });
  }, [organizations, statusFilter, typeFilter, searchInput]);

  const handleStatusTransition = useCallback(
    async (org, nextStatus) => {
      if (busyOrgId) return;

      setBusyOrgId(org.id);
      try {
        const res = await verifyAdminOrganization(org.id, {
          verificationStatus: nextStatus,
        });
        const updated = res?.organization;

        setOrganizations((prev) =>
          prev.map((item) =>
            item.id === org.id
              ? {
                  ...item,
                  verificationStatus:
                    updated?.verificationStatus ?? nextStatus,
                  verifiedAt: updated?.verifiedAt ?? item.verifiedAt,
                  updatedAt: updated?.updatedAt ?? item.updatedAt,
                }
              : item
          )
        );

        const messageByStatus = {
          VERIFIED: `تم اعتماد منشأة "${org.name}" وتفعيل دخولها`,
          SUSPENDED: `تم إيقاف منشأة "${org.name}" وسحب جلساتها الفعالة`,
          PENDING: `تمت إعادة منشأة "${org.name}" إلى قائمة المراجعة`,
        };
        toast.success(messageByStatus[nextStatus] || "تم تحديث حالة المنشأة");
        setSuspendTarget(null);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "تعذر تحديث حالة الاعتماد"
        );
      } finally {
        setBusyOrgId(null);
      }
    },
    [busyOrgId, toast]
  );

  const statusPills = [
    { value: "", label: "الكل", count: counts.total },
    { value: "PENDING", label: "قيد المراجعة", count: counts.pending },
    { value: "VERIFIED", label: "معتمدة", count: counts.verified },
    { value: "SUSPENDED", label: "موقوفة", count: counts.suspended },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="portal-page-header flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-extrabold text-slate-900">
            إدارة واعتماد المنشآت
          </h1>
          <p className="text-sm text-slate-600">
            توثيق تراخيص الصيدليات ومخازن الأدوية وإدارة صلاحية الوصول للمنصة.
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
            onClick={() => setReloadTick((t) => t + 1)}
            disabled={loading}
            className="btn btn-outline btn-sm border-base-300 gap-1.5"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            <span>تحديث</span>
          </button>

          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="btn btn-primary btn-sm font-bold gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة منشأة مرخصة</span>
          </button>
        </div>
      </div>

      {/* Top 4 Summary Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card bg-base-100 border border-base-200 shadow-xs">
          <div className="card-body p-4 flex-row items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-500">
                إجمالي المنشآت
              </p>
              <p className="text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
                {counts.total}
              </p>
            </div>
            <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center">
              <Building2 className="w-5 h-5" />
            </span>
          </div>
        </div>

        <div className="card bg-base-100 border border-emerald-200 shadow-xs">
          <div className="card-body p-4 flex-row items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-emerald-700">معتمدة</p>
              <p className="text-2xl font-extrabold text-emerald-800 mt-1 tabular-nums">
                {counts.verified}
              </p>
            </div>
            <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5" />
            </span>
          </div>
        </div>

        <div
          className={`card border shadow-xs ${
            counts.pending > 0
              ? "admin-pending-card bg-amber-50/80 border-amber-300"
              : "bg-base-100 border-base-200"
          }`}
        >
          <div className="card-body p-4 flex-row items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-amber-800">
                قيد المراجعة
              </p>
              <p className="text-2xl font-extrabold text-amber-900 mt-1 tabular-nums">
                {counts.pending}
              </p>
            </div>
            <span className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </span>
          </div>
        </div>

        <div className="card bg-base-100 border border-rose-200/80 shadow-xs">
          <div className="card-body p-4 flex-row items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-rose-700">موقوفة</p>
              <p className="text-2xl font-extrabold text-rose-800 mt-1 tabular-nums">
                {counts.suspended}
              </p>
            </div>
            <span className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 flex items-center justify-center">
              <Ban className="w-5 h-5" />
            </span>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card bg-base-100 border border-base-200 shadow-xs">
        <div className="card-body p-4 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {statusPills.map((pill) => {
              const active = statusFilter === pill.value;
              return (
                <button
                  key={pill.value || "ALL"}
                  type="button"
                  onClick={() => setStatusFilter(pill.value)}
                  className={`btn btn-sm rounded-full gap-1.5 ${
                    active
                      ? "btn-primary font-bold"
                      : "btn-ghost bg-slate-50 border border-base-200 text-slate-700"
                  }`}
                >
                  <span>{pill.label}</span>
                  <span className="badge badge-xs font-bold tabular-nums">
                    {pill.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-8">
              <input
                type="search"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="ابحث باسم المنشأة، رقم الترخيص، المنطقة، اسم المسؤول أو البريد..."
                className="input input-bordered input-sm w-full h-10"
              />
            </div>

            <div className="sm:col-span-4">
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="select select-bordered select-sm w-full h-10"
              >
                <option value="">كل الأنواع (صيدليات وموزعين)</option>
                <option value="PHARMACY">الصيدليات فقط</option>
                <option value="DISTRIBUTOR">الموزّعون فقط</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      {loading && organizations.length === 0 ? (
        <EmptyState loading title="جارٍ تحميل المنشآت المسجلة..." />
      ) : errorMsg ? (
        <EmptyState
          error
          title="تعذر تحميل المنشآت"
          description={errorMsg}
          actionLabel="إعادة المحاولة"
          onAction={() => setReloadTick((t) => t + 1)}
        />
      ) : filteredAndSortedOrgs.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="لا توجد منشآت مطابقة"
          description="جرّب تغيير حالة التصفية أو عبارة البحث لعرض جميع المنشآت."
          actionLabel={
            statusFilter || typeFilter || searchInput
              ? "إعادة ضبط التصفية"
              : undefined
          }
          onAction={() => {
            setStatusFilter("");
            setTypeFilter("");
            setSearchInput("");
          }}
        />
      ) : (
        <div className="card bg-base-100 border border-base-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table table-zebra align-middle">
              <thead className="bg-slate-50 text-slate-700 text-xs">
                <tr>
                  <th>المنشأة والمنطقة</th>
                  <th>النوع</th>
                  <th>رقم الترخيص</th>
                  <th>الحساب المرتبط</th>
                  <th>حالة الاعتماد</th>
                  <th>تاريخ الاعتماد / التسجيل</th>
                  <th className="text-end">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSortedOrgs.map((org) => {
                  const isBusy = busyOrgId === org.id;
                  const status = org.verificationStatus;

                  return (
                    <tr
                      key={org.id}
                      className={
                        status === "PENDING" ? "admin-pending-row bg-amber-50/40" : undefined
                      }
                    >
                      <td className="min-w-48">
                        <div className="font-bold text-slate-900">
                          {org.name}
                        </div>
                        <div className="inline-flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                          <MapPin className="w-3 h-3 shrink-0" />
                          <span>{org.region}</span>
                        </div>
                      </td>

                      <td>
                        <StatusBadge map={ORG_TYPE} value={org.type} />
                      </td>

                      <td className="font-mono text-xs text-slate-700">
                        {org.licenseNumber}
                      </td>

                      <td className="min-w-44">
                        {org.primaryUser ? (
                          <div className="space-y-0.5">
                            <p className="text-xs font-bold text-slate-800">
                              {org.primaryUser.fullName}
                            </p>
                            <p
                              dir="ltr"
                              className="text-xs font-mono text-slate-500 truncate max-w-48"
                            >
                              {org.primaryUser.email}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>

                      <td>
                        <StatusBadge
                          map={VERIFICATION_STATUS}
                          value={status}
                        />
                      </td>

                      <td className="text-xs text-slate-500 min-w-36">
                        {org.verifiedAt ? (
                          <div>
                            <span className="text-emerald-700 font-semibold block">
                              معتمدة
                            </span>
                            <span>{formatDateTime(org.verifiedAt)}</span>
                          </div>
                        ) : (
                          <div>
                            <span className="text-slate-400 block">
                              تاريخ التسجيل
                            </span>
                            <span>{formatDateTime(org.createdAt)}</span>
                          </div>
                        )}
                      </td>

                      <td className="text-end min-w-52">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {(status === "PENDING" || status === "SUSPENDED") && (
                            <button
                              type="button"
                              disabled={Boolean(busyOrgId)}
                              onClick={() =>
                                void handleStatusTransition(org, "VERIFIED")
                              }
                              className="btn btn-primary btn-xs font-bold gap-1"
                            >
                              {isBusy ? (
                                <span className="loading loading-spinner loading-xs" />
                              ) : (
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              )}
                              <span>
                                {status === "SUSPENDED"
                                  ? "إعادة الاعتماد"
                                  : "اعتماد المنشأة"}
                              </span>
                            </button>
                          )}

                          {status === "SUSPENDED" && (
                            <button
                              type="button"
                              disabled={Boolean(busyOrgId)}
                              onClick={() =>
                                void handleStatusTransition(org, "PENDING")
                              }
                              className="btn btn-ghost btn-xs border border-base-300 gap-1"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>إعادة للمراجعة</span>
                            </button>
                          )}

                          {(status === "VERIFIED" || status === "PENDING") && (
                            <button
                              type="button"
                              disabled={Boolean(busyOrgId)}
                              onClick={() => setSuspendTarget(org)}
                              className="btn btn-outline btn-error btn-xs gap-1 font-bold"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              <span>إيقاف</span>
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

      <CreateOrgModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => setReloadTick((t) => t + 1)}
      />

      <ConfirmModal
        open={Boolean(suspendTarget)}
        title="تأكيد إيقاف المنشأة"
        message={
          suspendTarget
            ? `سيؤدي إيقاف "${suspendTarget.name}" إلى إنهاء وصولها وسحب فعالية أي جلسة نشطة لها فوراً عند الطلب التالي (403 ORG_NOT_VERIFIED). هل تريد المتابعة؟`
            : ""
        }
        confirmLabel="نعم، إيقاف المنشأة"
        cancelLabel="تراجع"
        confirmVariant="btn-error"
        loading={Boolean(busyOrgId && suspendTarget?.id === busyOrgId)}
        onConfirm={() =>
          suspendTarget &&
          void handleStatusTransition(suspendTarget, "SUSPENDED")
        }
        onCancel={() => setSuspendTarget(null)}
      />
    </div>
  );
}
