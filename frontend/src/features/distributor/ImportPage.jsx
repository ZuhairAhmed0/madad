import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
  History,
  Link2,
  Sparkles,
  Upload,
} from "lucide-react";
import EmptyState from "../../components/ui/EmptyState";
import { useToast } from "../../context/ToastContext";
import { formatPercent, formatRelativeTime, formatSdg } from "../../lib/format";
import {
  bulkImportListings,
  fetchDistributorAliases,
  fetchMasterDrugs,
  fetchPriceLogs,
  upsertDistributorAlias,
} from "./distributorApi";

export default function ImportPage() {
  const toast = useToast();

  const [rawText, setRawText] = useState("");
  const [importing, setImporting] = useState(false);
  const [report, setReport] = useState(null);

  const [masterDrugs, setMasterDrugs] = useState([]);
  const [selectedDrugByRow, setSelectedDrugByRow] = useState({});
  const [drugFilterByRow, setDrugFilterByRow] = useState({});
  const [busyRowNumber, setBusyRowNumber] = useState(null);

  const [activeTab, setActiveTab] = useState("aliases");
  const [aliases, setAliases] = useState([]);
  const [priceLogs, setPriceLogs] = useState([]);
  const [loadingAliases, setLoadingAliases] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const loadAliasesAndLogs = useCallback(async () => {
    setLoadingAliases(true);
    setLoadingLogs(true);
    try {
      const [aliasRows, logRows] = await Promise.all([
        fetchDistributorAliases(),
        fetchPriceLogs(30),
      ]);
      setAliases(aliasRows);
      setPriceLogs(logRows);
    } catch {
      // Errors surfaced gracefully per section if needed.
    } finally {
      setLoadingAliases(false);
      setLoadingLogs(false);
    }
  }, []);

  useEffect(() => {
    void loadAliasesAndLogs();
    fetchMasterDrugs({})
      .then((drugs) => setMasterDrugs(drugs))
      .catch(() => {});
  }, [loadAliasesAndLogs]);

  const handleFillDemoSample = () => {
    const drugA = masterDrugs[0];
    const drugB = masterDrugs[1] || masterDrugs[0];

    const nameA = drugA
      ? `${drugA.tradeName} ${drugA.strength}`
      : "Amoclan 1g";
    const nameB = drugB
      ? `${drugB.tradeName} ${drugB.strength}`
      : "Panadol Extra 500mg";

    const sampleLines = [
      "الصنف,السعر,التوفر",
      `${nameA},"١٥,٠٠٠ جنيه سوداني",متوفر`,
      `${nameB},18000,متوفر`,
      `${nameB},18500,نعم`,
      "صنف أمدرمان خاص - أوقمنتين ١ جم,22500,متوفر",
      "دواء تجريبي خاطئ,12.5,متوفر",
    ].join("\n");

    setRawText(sampleLines);
    toast.info("تمت تعبئة مثال استيراد شامل (أرقام عربية، تكرار، Alias، وصف تالف)");
  };

  const handleBulkImport = async (event) => {
    event.preventDefault();
    if (importing) return;

    const trimmed = rawText.trim();
    if (!trimmed) {
      toast.warning("يرجى لصق قائمة الأسعار أو تعبئة المثال التجريبي أولاً");
      return;
    }

    setImporting(true);
    try {
      const res = await bulkImportListings({
        format: "CSV_TEXT",
        text: trimmed,
      });

      setReport(res);

      // Auto-preselect the top suggested master drug for each unmapped row cleanly.
      const nextSelections = {};
      for (const row of res?.unmappedRows || []) {
        nextSelections[row.rowNumber] = row.suggestedDrugs?.[0]?.id || "";
      }
      setSelectedDrugByRow(nextSelections);
      setDrugFilterByRow({});

      toast.success(
        `اكتمل الاستيراد: أُضيف ${res.createdCount} · حُدّث ${res.updatedCount}`
      );
      await loadAliasesAndLogs();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "تعذر تنفيذ الاستيراد الجماعي"
      );
    } finally {
      setImporting(false);
    }
  };

  const handleResolveAlias = async (row) => {
    if (busyRowNumber !== null) return;

    const chosenDrugId = selectedDrugByRow[row.rowNumber];
    if (!chosenDrugId) {
      toast.warning("يرجى اختيار الدواء المرجعي المطابق أولاً");
      return;
    }

    setBusyRowNumber(row.rowNumber);
    try {
      await upsertDistributorAlias({
        rawName: row.rawName,
        masterDrugId: chosenDrugId,
        wholesalePriceSdg: row.wholesalePriceSdg,
        isAvailable: row.isAvailable,
      });

      setReport((prev) => {
        if (!prev) return prev;
        const remaining = (prev.unmappedRows || []).filter(
          (item) => item.rowNumber !== row.rowNumber
        );
        return {
          ...prev,
          unmappedRows: remaining,
          unmappedCount: remaining.length,
        };
      });

      toast.success(
        `تم حفظ الربط الدائم لـ "${row.rawName}" وتطبيق السعر (${formatSdg(
          row.wholesalePriceSdg
        )})`
      );
      await loadAliasesAndLogs();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "تعذر حفظ الربط وتطبيق السعر"
      );
    } finally {
      setBusyRowNumber(null);
    }
  };

  const masterDrugsSorted = useMemo(
    () =>
      [...masterDrugs].sort((a, b) => a.tradeName.localeCompare(b.tradeName)),
    [masterDrugs]
  );

  return (
    <div className="space-y-6">
      <div className="portal-page-header space-y-1">
        <h1 className="text-2xl font-extrabold text-slate-900">
          الاستيراد السريع والأسماء البديلة (Aliases)
        </h1>
        <p className="text-sm text-slate-600">
          الصق قوائم CSV أو Excel أو رسائل واتساب، وسيتم تطبيع الأرقام العربية
          وتطبيق التحديثات مع ربط الأسماء الجديدة لمرة واحدة فقط.
        </p>
      </div>

      {/* Phase 2 architecture readiness note */}
      <div className="alert bg-sky-50 border border-sky-200 text-sky-950 items-start text-xs">
        <Sparkles className="w-4 h-4 text-sky-700 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">جاهز للمرحلة الثانية: </span>
          <span>
            تعتمد هذه الواجهة على معمارية <code>CatalogImportParser</code> القابلة
            للتوسع لاستيراد قوائم PDF والصور بالذكاء الاصطناعي مستقبلاً.
          </span>
        </div>
      </div>

      {/* Bulk Import Textarea Form */}
      <div className="card bg-base-100 border border-base-200 shadow-xs">
        <div className="card-body p-5 sm:p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-700" />
                <span>لصق قائمة الأسعار</span>
              </h2>
              <p className="text-xs text-slate-500">
                التنسيق المدعوم: <code>الاسم, السعر بالجنيه, التوفر</code> (فواصل
                أو Tab من Excel). يقبل الأرقام العربية والعملات مثل ج.س.
              </p>
            </div>

            <button
              type="button"
              onClick={handleFillDemoSample}
              disabled={importing}
              className="btn btn-outline btn-primary btn-xs sm:btn-sm font-bold gap-1.5 self-start sm:self-auto"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>تعبئة مثال تجريبي جاهز</span>
            </button>
          </div>

          <form onSubmit={handleBulkImport} className="space-y-4">
            <textarea
              rows={8}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              disabled={importing}
              placeholder={`الصنف,السعر,التوفر\nAmoclan 1g,"١٥,٠٠٠ جنيه سوداني",متوفر\nPanadol Extra 500mg,5200,نعم`}
              className="textarea textarea-bordered w-full font-mono text-xs sm:text-sm leading-relaxed"
            />

            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="text-xs text-slate-500">
                في حال تكرار نفس الصنف في القائمة، يتم اعتماد السعر الأخير تلقائياً.
              </span>
              <button
                type="submit"
                disabled={importing || rawText.trim().length === 0}
                className="btn btn-primary btn-sm font-bold gap-2"
              >
                {importing ? (
                  <span className="loading loading-spinner loading-xs" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                <span>{importing ? "جارٍ المعالجة..." : "معالجة واستيراد"}</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Import Report */}
      {report && (
        <div className="space-y-5">
          {/* 4 Stat Badges */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="import-summary-tile rounded-xl bg-emerald-50 border border-emerald-200 p-4">
              <span className="text-xs font-semibold text-emerald-800 block">
                تمت الإضافة
              </span>
              <span className="text-2xl font-extrabold text-emerald-900 tabular-nums">
                {report.createdCount}
              </span>
            </div>
            <div className="import-summary-tile rounded-xl bg-sky-50 border border-sky-200 p-4">
              <span className="text-xs font-semibold text-sky-800 block">
                تم التحديث
              </span>
              <span className="text-2xl font-extrabold text-sky-900 tabular-nums">
                {report.updatedCount}
              </span>
            </div>
            <div className="import-summary-tile rounded-xl bg-amber-50 border border-amber-200 p-4">
              <span className="text-xs font-semibold text-amber-800 block">
                تحتاج ربط لمرة واحدة
              </span>
              <span className="text-2xl font-extrabold text-amber-900 tabular-nums">
                {report.unmappedCount}
              </span>
            </div>
            <div className="import-summary-tile rounded-xl bg-rose-50 border border-rose-200 p-4">
              <span className="text-xs font-semibold text-rose-800 block">
                صفوف مرفوضة
              </span>
              <span className="text-2xl font-extrabold text-rose-900 tabular-nums">
                {report.invalidCount}
              </span>
            </div>
          </div>

          {/* Unmapped Rows Interactive Alias Resolver */}
          {report.unmappedRows?.length > 0 && (
            <div className="space-y-3">
              <h3 className="font-extrabold text-base text-slate-900 flex items-center gap-2">
                <Link2 className="w-4 h-4 text-amber-600" />
                <span>
                  ربط الأصناف غير المطابقة لمرة واحدة ({report.unmappedRows.length})
                </span>
              </h3>

              {report.unmappedRows.map((row) => {
                const isBusy = busyRowNumber === row.rowNumber;
                const selectedId = selectedDrugByRow[row.rowNumber] || "";
                const filterTerm = (drugFilterByRow[row.rowNumber] || "")
                  .trim()
                  .toLowerCase();

                const filteredOptions = filterTerm
                  ? masterDrugsSorted.filter(
                      (d) =>
                        d.tradeName.toLowerCase().includes(filterTerm) ||
                        d.genericName.toLowerCase().includes(filterTerm) ||
                        d.manufacturer.toLowerCase().includes(filterTerm)
                    )
                  : masterDrugsSorted;

                return (
                  <div
                    key={`${row.rowNumber}-${row.normalizedName}`}
                    className="unmapped-row-card card bg-base-100 border border-amber-300 shadow-xs"
                  >
                    <div className="card-body p-5 space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="badge badge-warning badge-sm font-bold">
                              صف #{row.rowNumber}
                            </span>
                            <h4 className="font-extrabold text-base text-slate-900">
                              {row.rawName}
                            </h4>
                          </div>
                          <p className="text-xs text-slate-500">
                            النص المطبع:{" "}
                            <span className="font-mono text-slate-700">
                              {row.normalizedName}
                            </span>{" "}
                            · السعر:{" "}
                            <span className="font-bold text-emerald-700">
                              {formatSdg(row.wholesalePriceSdg)}
                            </span>{" "}
                            · {row.isAvailable ? "متوفر" : "غير متوفر"}
                          </p>
                        </div>
                      </div>

                      {row.suggestedDrugs?.length > 0 && (
                        <div className="space-y-1.5">
                          <span className="text-xs font-bold text-slate-600 block">
                            اقتراحات سريعة:
                          </span>
                          <div className="flex items-center gap-2 flex-wrap">
                            {row.suggestedDrugs.map((sug) => {
                              const active = selectedId === sug.id;
                              return (
                                <button
                                  key={sug.id}
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() =>
                                    setSelectedDrugByRow((prev) => ({
                                      ...prev,
                                      [row.rowNumber]: sug.id,
                                    }))
                                  }
                                  className={`btn btn-xs ${
                                    active
                                      ? "btn-primary font-bold"
                                      : "btn-outline border-base-300"
                                  }`}
                                >
                                  {sug.tradeName} ({sug.strength}) —{" "}
                                  {sug.manufacturer}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        <div className="md:col-span-4 form-control">
                          <label className="label py-1">
                            <span className="label-text text-xs font-semibold text-slate-600">
                              بحث في الدليل المرجعي
                            </span>
                          </label>
                          <input
                            type="search"
                            disabled={isBusy}
                            value={drugFilterByRow[row.rowNumber] || ""}
                            onChange={(e) =>
                              setDrugFilterByRow((prev) => ({
                                ...prev,
                                [row.rowNumber]: e.target.value,
                              }))
                            }
                            placeholder="تصفية قائمة الأدوية..."
                            className="input input-bordered input-xs h-9 w-full"
                          />
                        </div>

                        <div className="md:col-span-5 form-control">
                          <label className="label py-1">
                            <span className="label-text text-xs font-semibold text-slate-600">
                              الصنف المرجعي المختار
                            </span>
                          </label>
                          <select
                            disabled={isBusy}
                            value={selectedId}
                            onChange={(e) =>
                              setSelectedDrugByRow((prev) => ({
                                ...prev,
                                [row.rowNumber]: e.target.value,
                              }))
                            }
                            className="select select-bordered select-xs h-9 w-full"
                          >
                            <option value="">اختر الدواء المرجعي...</option>
                            {filteredOptions.map((drug) => (
                              <option key={drug.id} value={drug.id}>
                                {drug.tradeName} ({drug.strength}) —{" "}
                                {drug.manufacturer}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="md:col-span-3">
                          <button
                            type="button"
                            disabled={isBusy || !selectedId}
                            onClick={() => void handleResolveAlias(row)}
                            className="btn btn-primary btn-xs h-9 w-full font-bold gap-1.5"
                          >
                            {isBusy ? (
                              <span className="loading loading-spinner loading-xs" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            )}
                            <span>حفظ الربط وتطبيق السعر</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Invalid Rows Table */}
          {report.invalidRows?.length > 0 && (
            <details className="collapse collapse-arrow bg-base-100 border border-rose-200 rounded-xl">
              <summary className="collapse-title font-bold text-sm text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>
                  صفوف مرفوضة لم تُستورد ({report.invalidRows.length}) — اضغط
                  للتفاصيل
                </span>
              </summary>
              <div className="collapse-content overflow-x-auto">
                <table className="table table-sm">
                  <thead className="bg-rose-50/70 text-rose-900 text-xs">
                    <tr>
                      <th>رقم الصف</th>
                      <th>الاسم الأصلي</th>
                      <th>سبب الرفض</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.invalidRows.map((inv) => (
                      <tr key={`${inv.rowNumber}-${inv.rawName}`}>
                        <td className="font-mono text-xs">{inv.rowNumber}</td>
                        <td className="font-semibold text-slate-800">
                          {inv.rawName || "—"}
                        </td>
                        <td className="text-xs text-rose-700">{inv.reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}

      {/* Bottom Tabs: Saved Aliases & Price Audit Logs */}
      <div className="space-y-4">
        <div role="tablist" className="tabs tabs-box bg-base-200/70 p-1 w-fit">
          <button
            type="button"
            role="tab"
            onClick={() => setActiveTab("aliases")}
            className={`tab font-bold gap-1.5 ${
              activeTab === "aliases" ? "tab-active text-emerald-800" : ""
            }`}
          >
            <Link2 className="w-4 h-4" />
            <span>الأسماء البديلة المحفوظة (Aliases)</span>
          </button>
          <button
            type="button"
            role="tab"
            onClick={() => setActiveTab("logs")}
            className={`tab font-bold gap-1.5 ${
              activeTab === "logs" ? "tab-active text-emerald-800" : ""
            }`}
          >
            <History className="w-4 h-4" />
            <span>سجل تعديلات الأسعار</span>
          </button>
        </div>

        {activeTab === "aliases" ? (
          loadingAliases ? (
            <EmptyState loading title="جارٍ تحميل الأسماء البديلة..." />
          ) : aliases.length === 0 ? (
            <EmptyState
              icon={Link2}
              title="لا توجد أسماء بديلة محفوظة بعد"
              description="عند ربط أي اسم مخصص من قائمة الموزّع بدواء مرجعي، يُحفظ هنا للاستخدام التلقائي مستقبلاً."
            />
          ) : (
            <div className="card bg-base-100 border border-base-200 shadow-xs overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table table-zebra">
                  <thead className="bg-slate-50 text-slate-700 text-xs">
                    <tr>
                      <th>الاسم البديل المطبع</th>
                      <th>الدواء المرجعي المرتبط</th>
                      <th>الشركة المنتجة</th>
                      <th>تاريخ الحفظ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aliases.map((alias) => (
                      <tr key={alias.id}>
                        <td className="font-mono text-xs sm:text-sm font-bold text-slate-800">
                          {alias.rawNameNormalized}
                        </td>
                        <td>
                          <span className="font-bold text-emerald-800">
                            {alias.drug?.tradeName}
                          </span>{" "}
                          <span className="text-xs text-slate-500">
                            {alias.drug?.strength} · {alias.drug?.dosageForm}
                          </span>
                        </td>
                        <td className="text-xs text-slate-600">
                          {alias.drug?.manufacturer}
                        </td>
                        <td className="text-xs text-slate-500">
                          {formatRelativeTime(alias.createdAt)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : loadingLogs ? (
          <EmptyState loading title="جارٍ تحميل سجل تعديلات الأسعار..." />
        ) : priceLogs.length === 0 ? (
          <EmptyState
            icon={History}
            title="سجل تعديلات الأسعار فارغ"
            description="تظهر هنا جميع تغييرات الأسعار الفردية والجماعية وتلك الناتجة عن الاستيراد."
          />
        ) : (
          <div className="card bg-base-100 border border-base-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table table-zebra">
                <thead className="bg-slate-50 text-slate-700 text-xs">
                  <tr>
                    <th>الصنف</th>
                    <th>الشركة المنتجة</th>
                    <th>السعر السابق</th>
                    <th>السعر الجديد</th>
                    <th>النسبة</th>
                    <th>التوقيت</th>
                  </tr>
                </thead>
                <tbody>
                  {priceLogs.map((log) => {
                    const isUp = Number(log.percentChange) > 0;
                    return (
                      <tr key={log.id}>
                        <td>
                          <span className="font-bold text-slate-900">
                            {log.drug?.tradeName}
                          </span>{" "}
                          <span className="text-xs text-slate-500">
                            {log.drug?.strength}
                          </span>
                        </td>
                        <td className="text-xs text-slate-600">
                          {log.manufacturer}
                        </td>
                        <td className="text-slate-500 line-through tabular-nums">
                          {formatSdg(log.oldPriceSdg)}
                        </td>
                        <td className="font-bold text-slate-900 tabular-nums">
                          {formatSdg(log.newPriceSdg)}
                        </td>
                        <td>
                          <span
                            className={`badge badge-sm font-bold tabular-nums ${
                              isUp ? "badge-error" : "badge-success"
                            }`}
                          >
                            {formatPercent(log.percentChange)}
                          </span>
                        </td>
                        <td className="text-xs text-slate-500">
                          {formatRelativeTime(log.changedAt)}
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
    </div>
  );
}
