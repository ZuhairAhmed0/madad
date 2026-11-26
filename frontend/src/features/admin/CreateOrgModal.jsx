import { useEffect, useRef, useState } from "react";
import { AlertCircle, Building2 } from "lucide-react";
import { useToast } from "../../context/ToastContext";
import { ApiError } from "../../lib/api";
import { createAdminOrganization } from "./adminApi";

const INITIAL_FORM = {
  name: "",
  type: "PHARMACY",
  licenseNumber: "",
  region: "",
  verificationStatus: "PENDING",
  orderExpiryMinutes: "60",
  fullName: "",
  email: "",
  password: "",
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function CreateOrgModal({ open, onClose, onCreated }) {
  const toast = useToast();
  const dialogRef = useRef(null);

  const [form, setForm] = useState(INITIAL_FORM);
  const [errorMsg, setErrorMsg] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      setErrorMsg(null);
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleField = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errorMsg) {
      setErrorMsg(null);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (submitting) return;

    const name = form.name.trim();
    const licenseNumber = form.licenseNumber.trim();
    const region = form.region.trim();
    const fullName = form.fullName.trim();
    const email = form.email.trim().toLowerCase();
    const password = form.password;

    if (name.length < 2) {
      setErrorMsg("اسم المنشأة يجب أن لا يقل عن حرفين");
      return;
    }
    if (licenseNumber.length < 2) {
      setErrorMsg("رقم الترخيص الصيدلاني مطلوب");
      return;
    }
    if (region.length < 2) {
      setErrorMsg("المنطقة مطلوبة");
      return;
    }
    if (fullName.length < 2) {
      setErrorMsg("الاسم الكامل لمسؤول الحساب مطلوب");
      return;
    }
    if (!EMAIL_PATTERN.test(email)) {
      setErrorMsg("يرجى إدخال بريد إلكتروني صحيح");
      return;
    }
    if (password.length < 8) {
      setErrorMsg("كلمة المرور يجب أن تكون 8 أحرف على الأقل");
      return;
    }

    let orderExpiryMinutes = 60;
    if (form.type === "DISTRIBUTOR") {
      const trimmedExpiry = String(form.orderExpiryMinutes).trim();
      const parsedExpiry = Number(trimmedExpiry);
      if (
        !trimmedExpiry ||
        !Number.isInteger(parsedExpiry) ||
        parsedExpiry < 1 ||
        parsedExpiry > 1440
      ) {
        setErrorMsg(
          "مهلة تأكيد الطلبيات يجب أن تكون عدداً صحيحاً بين 1 و 1440 دقيقة"
        );
        return;
      }
      orderExpiryMinutes = parsedExpiry;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const res = await createAdminOrganization({
        name,
        type: form.type,
        licenseNumber,
        region,
        verificationStatus: form.verificationStatus,
        orderExpiryMinutes,
        user: {
          fullName,
          email,
          password,
        },
      });
      toast.success(
        `تم إنشاء منشأة "${res?.organization?.name || name}" بنجاح`
      );
      setForm(INITIAL_FORM);
      onCreated();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrorMsg(
          "رقم الترخيص أو البريد الإلكتروني مسجّل مسبقاً لمنشأة أخرى"
        );
      } else {
        setErrorMsg(
          err instanceof Error
            ? err.message
            : "تعذر إنشاء المنشأة؛ يرجى مراجعة البيانات"
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
      <div className="modal-box max-w-2xl border border-base-200 space-y-4">
        <div className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5" />
          </span>
          <div>
            <h3 className="font-extrabold text-lg text-slate-900">
              إضافة منشأة مرخصة جديدة
            </h3>
            <p className="text-xs text-slate-500">
              تُنشأ المنشأة وحساب المسؤول الخاص بها في معاملة واحدة محمية.
            </p>
          </div>
        </div>

        {errorMsg && (
          <div role="alert" className="alert alert-error text-sm items-start">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-bold text-slate-700">
                  اسم المنشأة *
                </span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={handleField("name")}
                disabled={submitting}
                placeholder="مثال: صيدلية الشفاء الحديثة"
                className="input input-bordered input-sm h-10 w-full"
                required
              />
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-bold text-slate-700">
                  نوع المنشأة *
                </span>
              </label>
              <select
                value={form.type}
                onChange={handleField("type")}
                disabled={submitting}
                className="select select-bordered select-sm h-10 w-full"
              >
                <option value="PHARMACY">صيدلية</option>
                <option value="DISTRIBUTOR">موزّع / مخزن أدوية</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-bold text-slate-700">
                  رقم الترخيص *
                </span>
              </label>
              <input
                type="text"
                dir="ltr"
                value={form.licenseNumber}
                onChange={handleField("licenseNumber")}
                disabled={submitting}
                placeholder="PHARM-OMD-201"
                className="input input-bordered input-sm h-10 w-full text-left font-mono"
                required
              />
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-bold text-slate-700">
                  المنطقة *
                </span>
              </label>
              <input
                type="text"
                value={form.region}
                onChange={handleField("region")}
                disabled={submitting}
                placeholder="الثورة - أمدرمان"
                className="input input-bordered input-sm h-10 w-full"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-bold text-slate-700">
                  الحالة الابتدائية
                </span>
              </label>
              <select
                value={form.verificationStatus}
                onChange={handleField("verificationStatus")}
                disabled={submitting}
                className="select select-bordered select-sm h-10 w-full"
              >
                <option value="PENDING">قيد المراجعة (PENDING)</option>
                <option value="VERIFIED">موثّقة فوراً (VERIFIED)</option>
              </select>
            </div>

            {form.type === "DISTRIBUTOR" && (
              <div className="form-control">
                <label className="label py-1">
                  <span className="label-text text-xs font-bold text-slate-700">
                    مهلة تأكيد الطلبيات (دقيقة) *
                  </span>
                </label>
                <input
                  type="number"
                  step="1"
                  min={1}
                  max={1440}
                  value={form.orderExpiryMinutes}
                  onChange={handleField("orderExpiryMinutes")}
                  disabled={submitting}
                  className="input input-bordered input-sm h-10 w-full tabular-nums"
                  required
                />
              </div>
            )}
          </div>

          <div className="divider my-1 text-xs text-slate-400 font-semibold">
            بيانات حساب الدخول الأساسي
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-bold text-slate-700">
                  الاسم الكامل *
                </span>
              </label>
              <input
                type="text"
                value={form.fullName}
                onChange={handleField("fullName")}
                disabled={submitting}
                placeholder="د. محمد أحمد"
                className="input input-bordered input-sm h-10 w-full"
                required
              />
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-bold text-slate-700">
                  البريد الإلكتروني *
                </span>
              </label>
              <input
                type="email"
                dir="ltr"
                value={form.email}
                onChange={handleField("email")}
                disabled={submitting}
                placeholder="org@madad.sd"
                className="input input-bordered input-sm h-10 w-full text-left"
                required
              />
            </div>

            <div className="form-control">
              <label className="label py-1">
                <span className="label-text text-xs font-bold text-slate-700">
                  كلمة المرور (8+ أحرف) *
                </span>
              </label>
              <input
                type="password"
                dir="ltr"
                value={form.password}
                onChange={handleField("password")}
                disabled={submitting}
                placeholder="••••••••"
                className="input input-bordered input-sm h-10 w-full text-left"
                required
              />
            </div>
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
              disabled={submitting}
              className="btn btn-primary btn-sm font-bold gap-1.5"
            >
              {submitting && (
                <span className="loading loading-spinner loading-xs" />
              )}
              <span>إنشاء المنشأة والحساب</span>
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
