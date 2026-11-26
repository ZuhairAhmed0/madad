import { useEffect, useMemo, useRef } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { formatSdg } from "../../lib/format";

/** Modal displayed on 409 PRICE_VERSION_CONFLICT so pharmacy reviews and accepts updated prices. */
export default function PriceConflictModal({
  open,
  conflicts = [],
  cartItems = [],
  submitting = false,
  onAcceptAndRetry,
  onCancel,
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const { rows, oldTotalSdg, newTotalSdg } = useMemo(() => {
    const conflictByListingId = new Map(
      conflicts.map((c) => [c.listingId, c])
    );

    let oldSum = 0;
    let newSum = 0;
    const comparisonRows = [];

    for (const item of cartItems) {
      const conflict = conflictByListingId.get(item.listingId);
      const oldPrice = item.wholesalePriceSdg;
      const newPrice = conflict ? conflict.currentWholesalePriceSdg : oldPrice;

      oldSum += oldPrice * item.quantity;
      newSum += newPrice * item.quantity;

      if (conflict) {
        comparisonRows.push({
          listingId: item.listingId,
          tradeName: conflict.tradeName || item.tradeName,
          quantity: item.quantity,
          oldPrice,
          newPrice,
          delta: newPrice - oldPrice,
        });
      }
    }

    return {
      rows: comparisonRows,
      oldTotalSdg: oldSum,
      newTotalSdg: newSum,
    };
  }, [conflicts, cartItems]);

  const totalDelta = newTotalSdg - oldTotalSdg;

  return (
    <dialog
      ref={dialogRef}
      onCancel={(event) => {
        event.preventDefault();
        if (!submitting && onCancel) onCancel();
      }}
      className="modal modal-bottom sm:modal-middle"
    >
      <div className="price-conflict-dialog modal-box max-w-2xl border border-base-200 space-y-4">
        <div className="alert alert-warning items-start">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="space-y-1 text-sm">
            <h3 className="font-extrabold">
              تغيّرت أسعار بعض الأصناف قبل إتمام الطلبية (تضارب سعر 409)
            </h3>
            <p className="text-xs leading-relaxed">
              قام الموزّع بتحديث الأسعار أثناء تجهيز الطلبية. راجع الفروقات
              أدناه ثم اعتمد الأسعار الجديدة لإعادة الإرسال مباشرة.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-base-200">
          <table className="table table-sm">
            <thead className="bg-slate-50 text-slate-700">
              <tr>
                <th>الصنف</th>
                <th>الكمية</th>
                <th>السعر السابق</th>
                <th>السعر الجديد</th>
                <th>الفرق للوحدة</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isIncrease = row.delta > 0;
                const isDecrease = row.delta < 0;
                const formattedDiff = `${isIncrease ? "+" : ""}${formatSdg(
                  row.delta
                )}`;

                return (
                  <tr key={row.listingId}>
                    <td className="font-bold text-slate-900">{row.tradeName}</td>
                    <td className="tabular-nums">{row.quantity}</td>
                    <td className="bg-rose-50/60 text-rose-800 line-through tabular-nums">
                      {formatSdg(row.oldPrice)}
                    </td>
                    <td className="bg-emerald-50/70 font-extrabold text-emerald-900 tabular-nums">
                      {formatSdg(row.newPrice)}
                    </td>
                    <td>
                      <span
                        className={`badge badge-sm font-bold tabular-nums ${
                          isIncrease
                            ? "badge-error"
                            : isDecrease
                              ? "badge-success"
                              : "badge-ghost"
                        }`}
                      >
                        {formattedDiff}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl bg-slate-50 border border-base-200 p-4 flex flex-wrap items-center justify-between gap-3 text-sm">
          <div>
            <span className="text-slate-500">الإجمالي السابق: </span>
            <span className="font-semibold line-through text-slate-600 tabular-nums">
              {formatSdg(oldTotalSdg)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-700 font-semibold">الإجمالي الجديد:</span>
            <span className="text-base font-extrabold text-emerald-700 tabular-nums">
              {formatSdg(newTotalSdg)}
            </span>
            {totalDelta !== 0 && (
              <span
                className={`badge badge-sm font-bold ${
                  totalDelta > 0 ? "badge-error" : "badge-success"
                }`}
              >
                {`${totalDelta > 0 ? "+" : ""}${formatSdg(totalDelta)}`}
              </span>
            )}
          </div>
        </div>

        <div className="modal-action mt-2">
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={onCancel}
            disabled={submitting}
          >
            إلغاء ومراجعة السلة
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm font-bold gap-1.5"
            onClick={onAcceptAndRetry}
            disabled={submitting}
          >
            {submitting ? (
              <span className="loading loading-spinner loading-xs" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            <span>اعتماد الأسعار الجديدة وإعادة الإرسال</span>
          </button>
        </div>
      </div>

      <form
        method="dialog"
        className="modal-backdrop"
        onSubmit={(e) => {
          e.preventDefault();
          if (!submitting && onCancel) onCancel();
        }}
      >
        <button type="submit" aria-label="إغلاق">
          close
        </button>
      </form>
    </dialog>
  );
}
