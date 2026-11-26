import { useState } from "react";
import {
  CheckCircle2,
  Mail,
  MapPin,
  Phone,
  Send,
  ShieldAlert,
} from "lucide-react";
import { useToast } from "../../context/ToastContext";

const INITIAL_FORM = {
  orgName: "",
  orgType: "PHARMACY",
  licenseNumber: "",
  region: "",
  contactInfo: "",
  notes: "",
};

export default function ContactPage() {
  const toast = useToast();
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState({});
  const [submittedRef, setSubmittedRef] = useState(null);

  const handleChange = (field) => (event) => {
    const value = event.target.value;
    setForm((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const validate = () => {
    const nextErrors = {};
    if (form.orgName.trim().length < 2) {
      nextErrors.orgName = "يرجى إدخال اسم الصيدلية أو مخزن التوزيع";
    }
    if (form.licenseNumber.trim().length < 3) {
      nextErrors.licenseNumber = "رقم الترخيص الصيدلاني مطلوب للتحقق";
    }
    if (form.region.trim().length < 2) {
      nextErrors.region = "يرجى تحديد المنطقة (مثال: الثورة - أمدرمان)";
    }
    if (form.contactInfo.trim().length < 5) {
      nextErrors.contactInfo = "يرجى إدخال رقم هاتف أو بريد إلكتروني صالح";
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!validate()) {
      toast.warning("يرجى استكمال الحقول المطلوبة في طلب الانضمام");
      return;
    }

    const refCode = `REQ-${String(Date.now()).slice(-6)}`;
    setSubmittedRef({
      code: refCode,
      orgName: form.orgName.trim(),
      orgType: form.orgType === "PHARMACY" ? "صيدلية" : "موزّع دوائي",
    });
    toast.success("تم تسجيل طلب الانضمام بنجاح لمراجعة الإدارة");
  };

  const handleReset = () => {
    setForm(INITIAL_FORM);
    setErrors({});
    setSubmittedRef(null);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
      <div className="public-banner space-y-2 max-w-4xl">
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
          طلب انضمام منشأة مرخصة والتواصل
        </h1>
        <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
          حفاظاً على سلامة التوريد وسرية أسعار الجملة، لا تتيح منصة مدد التسجيل
          المفتوح. يتم إنشاء وتفعيل الحسابات حصرياً بعد مطابقة رقم الترخيص عبر
          فريق الإدارة.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Info column */}
        <div className="lg:col-span-5 space-y-5">
          <div className="alert bg-amber-50 border border-amber-200 text-amber-950 items-start">
            <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
            <div className="text-xs leading-relaxed space-y-1">
              <p className="font-bold">لماذا يتطلب الانضمام موافقة إدارية؟</p>
              <p>
                للتأكد من أن جميع المشتركين في الشبكة منشآت دوائية ومخازن مرخصة
                فعلياً في أمدرمان، ومنع تسرب قوائم الأسعار إلى جهات غير مصرح بها.
              </p>
            </div>
          </div>

          <div className="card bg-base-100 border border-base-200 shadow-xs">
            <div className="card-body p-6 space-y-4">
              <h2 className="font-bold text-base text-slate-900">
                خطوات التفعيل المباشر
              </h2>
              <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600">
                <li>إرسال بيانات المنشأة ورقم الترخيص عبر النموذج المقابل.</li>
                <li>مراجعة السجل الدوائي من قبل فريق إدارة منصة مدد.</li>
                <li>تزويدكم ببيانات الدخول وتفعيل حالة المنشأة (`VERIFIED`).</li>
              </ol>

              <div className="divider my-1" />

              <div className="space-y-2.5 text-sm text-slate-700">
                <div className="flex items-center gap-2.5">
                  <MapPin className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span>أمدرمان — شارع الشهداء / السوق الشعبي، ولاية الخرطوم</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Mail className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span dir="ltr">onboarding@madad.sd</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Phone className="w-4 h-4 text-emerald-700 shrink-0" />
                  <span dir="ltr">+249 91 234 5678</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Form column */}
        <div className="lg:col-span-7">
          {submittedRef ? (
            <div className="card bg-base-100 border border-emerald-200 shadow-xs">
              <div className="card-body p-8 text-center items-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-bold text-slate-900">
                  تم استلام طلب الانضمام بنجاح
                </h2>
                <p className="text-sm text-slate-600 max-w-md leading-relaxed">
                  شكراً لتواصلك مع مدد B2B. تم حفظ بيانات{" "}
                  <span className="font-bold text-slate-900">
                    {submittedRef.orgName}
                  </span>{" "}
                  ({submittedRef.orgType}) للمراجعة الإدارية برقم مرجعي:
                </p>
                <div className="badge badge-lg badge-primary badge-outline font-mono font-bold px-4 py-3">
                  {submittedRef.code}
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="btn btn-outline btn-sm mt-2"
                >
                  إرسال طلب آخر
                </button>
              </div>
            </div>
          ) : (
            <div className="card bg-base-100 border border-base-200 shadow-xs">
              <div className="card-body p-6 sm:p-8">
                <h2 className="text-lg font-bold text-slate-900 mb-4">
                  نموذج طلب انضمام / تواصل
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="form-control">
                      <label className="label">
                        <span className="label-text font-semibold text-slate-700">
                          اسم المنشأة *
                        </span>
                      </label>
                      <input
                        type="text"
                        value={form.orgName}
                        onChange={handleChange("orgName")}
                        placeholder="مثال: صيدلية الشفاء الحديثة"
                        className={`input input-bordered w-full ${
                          errors.orgName ? "input-error" : ""
                        }`}
                      />
                      {errors.orgName && (
                        <span className="text-xs text-error mt-1">
                          {errors.orgName}
                        </span>
                      )}
                    </div>

                    <div className="form-control">
                      <label className="label">
                        <span className="label-text font-semibold text-slate-700">
                          نوع النشاط *
                        </span>
                      </label>
                      <select
                        value={form.orgType}
                        onChange={handleChange("orgType")}
                        className="select select-bordered w-full"
                      >
                        <option value="PHARMACY">صيدلية</option>
                        <option value="DISTRIBUTOR">موزّع / مخزن أدوية</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="form-control">
                      <label className="label">
                        <span className="label-text font-semibold text-slate-700">
                          رقم الترخيص الصيدلاني *
                        </span>
                      </label>
                      <input
                        type="text"
                        value={form.licenseNumber}
                        onChange={handleChange("licenseNumber")}
                        placeholder="PHARM-OMD-..."
                        className={`input input-bordered w-full ${
                          errors.licenseNumber ? "input-error" : ""
                        }`}
                      />
                      {errors.licenseNumber && (
                        <span className="text-xs text-error mt-1">
                          {errors.licenseNumber}
                        </span>
                      )}
                    </div>

                    <div className="form-control">
                      <label className="label">
                        <span className="label-text font-semibold text-slate-700">
                          المنطقة / المحلية *
                        </span>
                      </label>
                      <input
                        type="text"
                        value={form.region}
                        onChange={handleChange("region")}
                        placeholder="الفتيحاب / الثورة - أمدرمان"
                        className={`input input-bordered w-full ${
                          errors.region ? "input-error" : ""
                        }`}
                      />
                      {errors.region && (
                        <span className="text-xs text-error mt-1">
                          {errors.region}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text font-semibold text-slate-700">
                        رقم الهاتف أو البريد الإلكتروني للتواصل *
                      </span>
                    </label>
                    <input
                      type="text"
                      value={form.contactInfo}
                      onChange={handleChange("contactInfo")}
                      placeholder="0912XXXXXX أو email@pharmacy.sd"
                      className={`input input-bordered w-full ${
                        errors.contactInfo ? "input-error" : ""
                      }`}
                    />
                    {errors.contactInfo && (
                      <span className="text-xs text-error mt-1">
                        {errors.contactInfo}
                      </span>
                    )}
                  </div>

                  <div className="form-control">
                    <label className="label">
                      <span className="label-text font-semibold text-slate-700">
                        ملاحظات إضافية (اختياري)
                      </span>
                    </label>
                    <textarea
                      rows={3}
                      value={form.notes}
                      onChange={handleChange("notes")}
                      placeholder="أي تفاصيل حول ساعات العمل أو الأصناف المطلوبة..."
                      className="textarea textarea-bordered w-full"
                    />
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary w-full sm:w-auto font-bold gap-2"
                  >
                    <Send className="w-4 h-4" />
                    <span>إرسال طلب المراجعة</span>
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
