import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Minus,
  Plus,
  Send,
  ShoppingCart,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import ConfirmModal from "../../components/ui/ConfirmModal";
import StatusBadge from "../../components/ui/StatusBadge";
import { useToast } from "../../context/ToastContext";
import { ApiError } from "../../lib/api";
import { SALES_STATUS } from "../../lib/constants";
import { formatSdg } from "../../lib/format";
import { createOrder } from "./pharmacyApi";
import { usePharmacyCart } from "./PharmacyCartContext";
import PriceConflictModal from "./PriceConflictModal";

/** Slide-over pharmacy cart drawer handling Idempotency-Key submission and 409 conflicts. */
export default function CartDrawer() {
  const {
    distributor,
    items,
    totalCount,
    totalSdg,
    cartOpen,
    closeCart,
    pendingReplace,
    confirmReplaceCart,
    cancelReplaceCart,
    updateQuantity,
    removeItem,
    clearCart,
    applyPriceConflicts,
    getOrCreateIdempotencyKey,
    isOffline,
  } = usePharmacyCart();

  const toast = useToast();
  const navigate = useNavigate();

  const [submitting, setSubmitting] = useState(false);
  const [conflicts, setConflicts] = useState(null);

  const submitOrder = async (itemsOverride = null) => {
    if (!distributor || submitting || isOffline) return;

    const targetItems = itemsOverride || items;
    if (targetItems.length === 0) return;

    setSubmitting(true);
    try {
      const idempotencyKey = getOrCreateIdempotencyKey();
      const payload = {
        distributorId: distributor.id,
        items: targetItems.map((item) => ({
          listingId: item.listingId,
          quantity: item.quantity,
          expectedPriceVersion: item.expectedPriceVersion,
        })),
      };

      const res = await createOrder(payload, idempotencyKey);
      toast.success(
        res?.idempotentReplay
          ? "تم استرجاع الطلبية السابقة بنفس مفتاح عدم التكرار"
          : "تم إرسال الطلبية إلى الموزّع بنجاح"
      );
      setConflicts(null);
      clearCart();
      closeCart();
      navigate("/pharmacy/orders");
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "PRICE_VERSION_CONFLICT") {
          setConflicts(err.details?.conflicts || []);
        } else if (err.code === "DISTRIBUTOR_PAUSED") {
          toast.error(err.message);
        } else if (err.code === "ITEM_UNAVAILABLE") {
          const unavailableNames = (err.details?.unavailableItems || [])
            .map((u) => u.tradeName)
            .filter(Boolean);
          toast.error(
            unavailableNames.length > 0
              ? `بعض الأصناف غير متوفرة حالياً: ${unavailableNames.join("، ")}`
              : err.message
          );
        } else if (err.code === "PRICE_ACCESS_REQUIRED") {
          toast.error(err.message);
        } else {
          toast.error(err.message || "تعذر إرسال الطلبية");
        }
      } else {
        toast.error("حدث خطأ غير متوقع أثناء إرسال الطلبية");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleAcceptConflictsAndRetry = async () => {
    if (!conflicts || submitting) return;
    // Build next payload synchronously from freshly updated prices/versions, never stale React state.
    const nextItems = applyPriceConflicts(conflicts);
    setConflicts(null);
    await submitOrder(nextItems);
  };

  return (
    <>
      {cartOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px]"
            onClick={() => {
              if (!submitting) closeCart();
            }}
          />

          <aside className="cart-drawer relative z-10 w-full max-w-md bg-base-100 h-full shadow-2xl border-s border-base-200 flex flex-col">
            {/* Header */}
            <div className="p-4 sm:p-5 border-b border-base-200 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center">
                  <ShoppingCart className="w-5 h-5" />
                </span>
                <div>
                  <h2 className="font-extrabold text-base text-slate-900">
                    سلة الطلبية
                  </h2>
                  <p className="text-xs text-slate-500">
                    {totalCount > 0 ? `${totalCount} وحدة محددة` : "السلة فارغة"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeCart}
                disabled={submitting}
                className="btn btn-ghost btn-sm btn-square"
                aria-label="إغلاق السلة"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
              {isOffline && (
                <div className="alert alert-warning text-xs items-start">
                  <WifiOff className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    وضع عدم الاتصال نشط — إرسال الطلبيات معطّل مؤقتاً حتى عودة
                    الاتصال بالخادم.
                  </span>
                </div>
              )}

              {distributor && (
                <div className="rounded-xl bg-slate-50 border border-base-200 p-3.5 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-500">الموزّع المختار</span>
                    <StatusBadge
                      map={SALES_STATUS}
                      value={distributor.salesStatus}
                    />
                  </div>
                  <p className="font-bold text-sm text-slate-900">
                    {distributor.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    مهلة تأكيد الموزّع: {distributor.orderExpiryMinutes} دقيقة
                  </p>
                </div>
              )}

              {distributor?.salesStatus === "PAUSED_REPRICING" && (
                <div className="alert alert-warning text-xs items-start">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    تنبيه: هذا الموزّع كان في حالة إيقاف مؤقت للتسعير؛ قد يرفض
                    الخادم الطلبية إذا لم يُعد فتح المبيعات بعد.
                  </span>
                </div>
              )}

              {items.length === 0 ? (
                <div className="py-16 text-center space-y-2 text-slate-500">
                  <ShoppingCart className="w-10 h-10 mx-auto text-slate-300" />
                  <p className="text-sm font-semibold text-slate-700">
                    سلة الطلبية فارغة حالياً
                  </p>
                  <p className="text-xs">
                    أضف أصنافاً مصرحاً بأسعارها من الكتالوج الموحّد أو من صفحة
                    الموزّع.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {items.map((item) => (
                    <div
                      key={item.listingId}
                      className="rounded-xl border border-base-200 p-3.5 space-y-2.5 bg-white"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-slate-900 truncate">
                            {item.tradeName}{" "}
                            {item.strength && (
                              <span className="text-slate-500 font-normal">
                                ({item.strength})
                              </span>
                            )}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatSdg(item.wholesalePriceSdg)} للوحدة · إصدار v
                            {item.expectedPriceVersion}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(item.listingId)}
                          disabled={submitting}
                          className="btn btn-ghost btn-xs text-error btn-square"
                          aria-label={`حذف ${item.tradeName}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between gap-3 pt-1">
                        <div className="join border border-base-300 rounded-lg">
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() =>
                              updateQuantity(item.listingId, item.quantity - 1)
                            }
                            className="btn btn-ghost btn-xs join-item px-2"
                            aria-label="إنقاص الكمية"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            max={100000}
                            disabled={submitting}
                            value={item.quantity}
                            onChange={(e) =>
                              updateQuantity(item.listingId, e.target.value)
                            }
                            className="input input-ghost input-xs w-14 text-center font-bold tabular-nums join-item focus:outline-none"
                          />
                          <button
                            type="button"
                            disabled={submitting}
                            onClick={() =>
                              updateQuantity(item.listingId, item.quantity + 1)
                            }
                            className="btn btn-ghost btn-xs join-item px-2"
                            aria-label="زيادة الكمية"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <span className="font-extrabold text-sm text-emerald-700 tabular-nums">
                          {formatSdg(item.wholesalePriceSdg * item.quantity)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            {items.length > 0 && (
              <div className="p-4 sm:p-5 border-t border-base-200 bg-slate-50/80 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-slate-600">
                    الإجمالي المبدئي
                  </span>
                  <span className="text-lg font-extrabold text-slate-900 tabular-nums">
                    {formatSdg(totalSdg)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={clearCart}
                    disabled={submitting}
                    className="btn btn-ghost btn-sm text-slate-600"
                  >
                    تفريغ
                  </button>
                  <button
                    type="button"
                    onClick={() => void submitOrder()}
                    disabled={submitting || isOffline || items.length === 0}
                    className="btn btn-primary btn-sm flex-1 font-bold gap-2"
                  >
                    {submitting ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                    <span>{submitting ? "جارٍ الإرسال..." : "إرسال الطلبية"}</span>
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}

      <PriceConflictModal
        open={Boolean(conflicts)}
        conflicts={conflicts || []}
        cartItems={items}
        submitting={submitting}
        onAcceptAndRetry={() => void handleAcceptConflictsAndRetry()}
        onCancel={() => setConflicts(null)}
      />

      <ConfirmModal
        open={Boolean(pendingReplace)}
        title="استبدال سلة الموزّع الحالي؟"
        message={
          pendingReplace
            ? `تحتوي السلة حالياً على أصناف من "${pendingReplace.conflictDistributor?.name}". الطلبية الواحدة تخص موزّعاً واحداً فقط؛ هل تريد إفراغ السلة وإضافة صنف "${pendingReplace.listing?.tradeName}" من "${pendingReplace.distributor?.name}"؟`
            : ""
        }
        confirmLabel="استبدال السلة"
        cancelLabel="الإبقاء على السلة الحالية"
        confirmVariant="btn-warning"
        onConfirm={confirmReplaceCart}
        onCancel={cancelReplaceCart}
      />
    </>
  );
}
