import { useEffect, useMemo, useState } from "react";
import { Percent, ShieldAlert } from "lucide-react";
import ConfirmModal from "../../components/ui/ConfirmModal";
import { useToast } from "../../context/ToastContext";
import { formatPercent } from "../../lib/format";
import { applyBulkPercentPricing } from "./distributorApi";

const QUICK_PERCENT_PRESETS = [5, 10, 15, -5];

/** ACID bulk percentage repricing panel grouped by drug manufacturer. */
export default function BulkPricingCard({
  manufacturerCounts = {},
  catalogManufacturers = [],
  onPricingApplied,
}) {
  const toast = useToast();

  const manufacturerOptions = useMemo(() => {
    const owned = Object.keys(manufacturerCounts).sort((a, b) =>
      a.localeCompare(b)
    );
    if (owned.length > 0) {
      return owned;
    }
    return catalogManufacturers;
  }, [manufacturerCounts, catalogManufacturers]);

  const [manufacturer, setManufacturer] = useState("");
  const [percentInput, setPercentInput] = useState("10");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (
      manufacturerOptions.length > 0 &&
      (!manufacturer || !manufacturerOptions.includes(manufacturer))
    ) {
      setManufacturer(manufacturerOptions[0]);
    }
  }, [manufacturerOptions, manufacturer]);

  const affectedCount = manufacturer
    ? manufacturerCounts[manufacturer] || 0
    : 0;

  const parseValidatedPercent = () => {
    const trimmed = String(percentInput).trim();
    if (!trimmed) {
      return { valid: false, message: "يرجى إدخال نسبة التعديل المئوية" };
    }
    const parsed = Number(trimmed);
    if (
      !Number.isFinite(parsed) ||
      parsed < -90 ||
      parsed > 500 ||
      parsed === 0
    ) {
      return {
        valid: false,
        message: "النسبة يجب أن تكون بين -90% و 500% وألا تساوي صفراً",
      };
    }
    return { valid: true, value: parsed };
  };

  const handleOpenConfirm = (event) => {
    event.preventDefault();
    if (affectedCount === 0 || submitting) return;

    const check = parseValidatedPercent();
    if (!check.valid) {
      toast.warning(check.message);
      return;
    }
    setConfirmOpen(true);
  };

  const handleExecuteBulkUpdate = async () => {
    if (submitting || affectedCount === 0 || !manufacturer) return;

    const check = parseValidatedPercent();
    if (!check.valid) {
      setConfirmOpen(false);
      toast.warning(check.message);
      return;
    }

    setSubmitting(true);
    try {
      const res = await applyBulkPercentPricing({
        manufacturer,
        percentChange: check.value,
      });
      toast.success(
        `تم تحديث ${res.updatedCount} صنف من شركة ${res.manufacturer} بنسبة ${formatPercent(
          res.percentChange
        )} ذرياً`
      );
      setConfirmOpen(false);
      if (onPricingApplied) {
        onPricingApplied();
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "تعذر تطبيق التعديل الجماعي"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const parsedPreviewPercent = Number(String(percentInput).trim());
  const previewPercentText = Number.isFinite(parsedPreviewPercent)
    ? formatPercent(parsedPreviewPercent)
    : "—";

  return (
    <div className="bulk-pricing-card card bg-base-100 border border-emerald-200/80 shadow-xs">
      <div className="card-body p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <Percent className="w-4 h-4" />
            </span>
            <div>
              <h2 className="font-extrabold text-base text-slate-900">
                التعديل الجماعي للأسعار (ACID Batch Repricing)
              </h2>
              <p className="text-xs text-slate-500">
                تحديث كافة أصناف شركة منتجة دفعة واحدة مع زيادة إصدار السعر
                وتسجيل التدقيق.
              </p>
            </div>
          </div>

          {manufacturer && (
            <span
              className={`badge badge-sm font-bold tabular-nums ${
                affectedCount > 0 ? "badge-primary" : "badge-ghost"
              }`}
            >
              الأصناف المشمولة: {affectedCount}
            </span>
          )}
        </div>

        <form
          onSubmit={handleOpenConfirm}
          className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
        >
          <div className="md:col-span-5 form-control">
            <label className="label py-1">
              <span className="label-text text-xs font-bold text-slate-700">
                الشركة المنتجة
              </span>
            </label>
            <select
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              disabled={submitting || manufacturerOptions.length === 0}
              className="select select-bordered select-sm w-full h-10"
            >
              {manufacturerOptions.length === 0 ? (
                <option value="">لا توجد شركات مسجلة حالياً</option>
              ) : (
                manufacturerOptions.map((mfr) => (
                  <option key={mfr} value={mfr}>
                    {mfr} ({manufacturerCounts[mfr] || 0} صنف)
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="md:col-span-4 form-control">
            <label className="label py-1">
              <span className="label-text text-xs font-bold text-slate-700">
                نسبة التغيير (% من -90 إلى 500)
              </span>
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                step="0.1"
                min={-90}
                max={500}
                value={percentInput}
                onChange={(e) => setPercentInput(e.target.value)}
                disabled={submitting}
                className="input input-bordered input-sm w-24 h-10 tabular-nums font-bold"
                required
              />
              <div className="flex items-center gap-1 flex-wrap">
                {QUICK_PERCENT_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    disabled={submitting}
                    onClick={() => setPercentInput(String(preset))}
                    className={`btn btn-xs ${
                      Number(percentInput) === preset
                        ? "btn-primary"
                        : "btn-ghost border border-base-300"
                    }`}
                  >
                    {formatPercent(preset)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="md:col-span-3 flex items-center justify-end">
            <button
              type="submit"
              disabled={submitting || !manufacturer || affectedCount === 0}
              className="btn btn-primary btn-sm h-10 w-full font-bold"
            >
              تطبيق التعديل الجماعي
            </button>
          </div>
        </form>

        {manufacturer && affectedCount === 0 && (
          <div className="flex items-center gap-1.5 text-xs text-amber-700">
            <ShieldAlert className="w-4 h-4 shrink-0" />
            <span>
              لا توجد أصناف مضافة لديك لهذه الشركة حتى الآن؛ أضف صنفاً أولاً
              لتفعيل التسعير الجماعي.
            </span>
          </div>
        )}
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="تأكيد التعديل الجماعي للأسعار"
        message={`سيتم تحديث أسعار ${affectedCount} صنف من شركة "${manufacturer}" بنسبة ${previewPercentText} داخل معاملة قاعدة بيانات واحدة وتحديث كاش الكتالوج لجميع الصيدليات فوراً. هل تريد المتابعة؟`}
        confirmLabel="نعم، تطبيق التعديل الآن"
        cancelLabel="تراجع"
        confirmVariant="btn-primary"
        loading={submitting}
        onConfirm={() => void handleExecuteBulkUpdate()}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
