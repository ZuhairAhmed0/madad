import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Clock3, ShieldCheck } from "lucide-react";

const MVP_FEATURES = [
  "دليل موحّد للأصناف الدوائية وتوفرها عبر المخازن الموثّقة في أمدرمان.",
  "حجب أسعار الجملة برمجياً حتى حصول الصيدلية على موافقة الموزّع.",
  "استيراد سريع لقوائم الأسعار (CSV / Excel / نصوص واتساب) مع حفظ الـ Aliases.",
  "تسعير جماعي بنسبة مئوية للشركة المنتجة داخل معاملة قاعدة بيانات ACID.",
  "رادار أسعار الصيدلية لحساب سعر الرف المقترح والتنبيه بارتفاعات الجملة.",
  "طلبيات B2B محمية بمفتاح منع التكرار والتحقق من إصدار السعر ومهلة التأكيد.",
];

const PHASE2_FEATURES = [
  "قارئ فواتير وقوائم PDF بالذكاء الاصطناعي (AI Parser) لاستخراج الأصناف آلياً.",
  "إشعارات وتحديثات فورية لحظة بلحظة عبر WebSockets للطلبيات وتغيرات الأسعار.",
  "تتبع خطوط التوزيع وخرائط GPS لشحنات الموزّعين.",
  "غرف محادثة مباشرة وعروض ترويجية مخصصة بين الصيدليات والمخازن.",
  "ربط مع أنظمة نقاط البيع (POS) وخدمات طبقة المستهلك / المريض مستقبلاً.",
];

export default function AboutPage() {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
      <div className="public-banner">
        <div className="relative z-10 max-w-4xl space-y-4">
          <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full w-fit">
            <ShieldCheck className="w-4 h-4" />
            <span>رسالة مدد B2B</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            تنظيم سلسلة الإمداد الدوائي في أمدرمان بدقة رقمية
          </h1>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-3xl">
            وُلدت منصة مدد لمعالجة التحدي اليومي في سوق الدواء السوداني: تعدد
            مصادر التوريد وتغيّر أسعار الجملة بوتيرة سريعة عبر رسائل غير منظمة.
            نوفّر حلقة وصل رقمية مغلقة وموثوقة بين الصيدليات المرخصة ومخازن
            التوزيع الدوائي لضمان توفر الدواء وسرعة التوريد وحفظ سرية الأسعار.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card bg-base-100 border border-emerald-200 shadow-xs">
          <div className="card-body p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                ما يقدمه الإصدار الحالي (MVP)
              </h2>
              <span className="badge badge-success badge-sm font-bold">
                متاح الآن
              </span>
            </div>
            <ul className="space-y-3">
              {MVP_FEATURES.map((text) => (
                <li
                  key={text}
                  className="flex items-start gap-2.5 text-sm text-slate-700 leading-relaxed"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-1" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="card bg-base-100 border border-base-200 shadow-xs">
          <div className="card-body p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-bold text-slate-900">
                خارطة المرحلة الثانية
              </h2>
              <span className="badge badge-info badge-sm font-bold">
                المرحلة الثانية (Phase 2)
              </span>
            </div>
            <ul className="space-y-3">
              {PHASE2_FEATURES.map((text) => (
                <li
                  key={text}
                  className="flex items-start gap-2.5 text-sm text-slate-600 leading-relaxed"
                >
                  <Clock3 className="w-4 h-4 text-sky-600 shrink-0 mt-1" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-emerald-700 text-white p-6 sm:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-lg font-bold">هل ترغب بتجربة المنصة مباشرة؟</h3>
          <p className="text-sm text-emerald-50">
            يمكنك استعراض لوحات الصيدلية والموزّع والإدارة عبر حسابات الديمو
            المعدة مسبقاً.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link to="/login" className="btn btn-sm bg-white text-emerald-800 border-0 hover:bg-emerald-50 font-bold gap-1.5">
            <span>دخول المنصة</span>
            <ArrowLeft className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
