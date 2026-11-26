import { Link } from "react-router-dom";
import {
  ArrowLeft,
  BadgeCheck,
  Building2,
  Lock,
  PackageCheck,
  Radar,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

const VALUE_CARDS = [
  {
    icon: Radar,
    title: "للصيدليات: رادار الأسعار والبدائل",
    description:
      "مقارنة لحظية لتوفر الأصناف لدى المخازن المعتمدة مع تنبيهات فورية لأي تغيير في سعر الجملة وحساب تلقائي لسعر الرف.",
    badge: "الكتالوج والرادار",
  },
  {
    icon: TrendingUp,
    title: "للموزّعين: تسعير جماعي واستيراد سريع",
    description:
      "تعديل أسعار شركة منتجة كاملة بنقرة واحدة مع استيراد قوائم CSV و Excel وواتساب وحفظ الأسماء البديلة (Aliases) تلقائياً.",
    badge: "إدارة المخزن",
  },
  {
    icon: Lock,
    title: "أمان وسرية: حجب الأسعار والتراخيص",
    description:
      "تُحجب أسعار الجملة برمجياً عن أي منشأة غير موثّقة أو لم تحصل على موافقة الموزّع الصريحة، مع تدقيق كامل لكل عملية.",
    badge: "حماية B2B",
  },
];

const WORKFLOW_STEPS = [
  {
    step: "1",
    title: "اعتماد الرخصة",
    detail: "تتحقق إدارة المنصة من الترخيص الصيدلاني وتفعّل حساب الصيدلية أو المخزن.",
  },
  {
    step: "2",
    title: "طلب صلاحية الأسعار",
    detail: "ترسل الصيدلية طلب الاطلاع للموزّع، وبمجرد الموافقة تنكشف أسعار الجملة فوراً.",
  },
  {
    step: "3",
    title: "مقارنة وطلب آمن",
    detail: "تُنشأ الطلبية بلقطة سعر مثبتة (Price Version) تمنع أي مفاجأة سعرية أثناء التأكيد.",
  },
];

export default function HomePage() {
  return (
    <div>
      {/* Hero */}
      <section className="home-hero relative overflow-hidden border-b border-emerald-100/80">
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 xl:gap-14 items-center">
            <div className="lg:col-span-7 space-y-6">
              <div className="hero-kicker inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-extrabold">
                <ShieldCheck className="w-4 h-4" />
                <span>أمدرمان، السودان — منصة الإمداد الدوائي B2B</span>
              </div>

              <h1 className="max-w-3xl text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-950 leading-[1.2] tracking-tight">
                شبكة إمداد دوائي موحّدة بين{" "}
                <span className="text-emerald-700">الصيدليات والموزّعين</span>
              </h1>

              <p className="text-base sm:text-lg text-slate-700 leading-8 max-w-2xl">
                ودّع قوائم الأسعار المتفرقة عبر مجموعات الدردشة. تمنحك منصة مدد
                تزامناً لحظياً لتوفر الأدوية وأسعار الجملة بالعملة المحلية (SDG)
                مع سرية تجارية محمية برمجياً لكل مخزن.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  to="/login"
                  className="btn btn-primary btn-md rounded-xl font-extrabold gap-2 shadow-lg shadow-emerald-900/15 hover:-translate-y-0.5 transition-transform"
                >
                  <span>دخول المنصة / تجربة الديمو</span>
                  <ArrowLeft className="w-4 h-4" />
                </Link>
                <Link
                  to="/contact"
                  className="btn btn-outline btn-md rounded-xl border-emerald-800/25 bg-white/60 text-emerald-950 hover:bg-white hover:border-emerald-700 font-bold backdrop-blur"
                >
                  طلب انضمام منشأة مرخصة
                </Link>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="hero-trust-card card border shadow-2xl shadow-emerald-950/10">
                <div className="card-body gap-5 p-6 sm:p-7">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-extrabold text-slate-950">
                      مؤشرات موثوقية الإمداد (MVP)
                    </span>
                    <span className="badge badge-success badge-sm font-semibold">
                      جاهز للتشغيل
                    </span>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="hero-trust-row rounded-2xl border p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                        <Lock className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-extrabold text-slate-950">
                          تشفير وحجب أسعار الجملة
                        </p>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          الأسعار محجوبة من الخادم حتى تصريح الموزّع (`APPROVED`).
                        </p>
                      </div>
                    </div>

                    <div className="hero-trust-row rounded-2xl border p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-sky-100 text-sky-700 flex items-center justify-center shrink-0">
                        <PackageCheck className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-extrabold text-slate-950">
                          حماية تضارب الأسعار (409)
                        </p>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          ربط كل طلبية بإصدار السعر اللحظي ومفتاح منع التكرار.
                        </p>
                      </div>
                    </div>

                    <div className="hero-trust-row rounded-2xl border p-4 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div>
                        <p className="text-sm font-extrabold text-slate-950">
                          تسعير صحيح بالجنيه السوداني
                        </p>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          حسابات مالية دقيقة بأعداد صحيحة (`SDG`) دون كسور عشرية.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Value Props */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
        <div className="max-w-2xl mb-10 space-y-3">
          <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
            مصممة لاحتياجات سوق الدواء في أمدرمان
          </h2>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            أدوات واضحة وسريعة توفر ساعات البحث اليومي وتحمي هامش الربح للصيدلية
            وسرية القوائم للموزّع.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {VALUE_CARDS.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="feature-card card bg-white border border-slate-200/80 shadow-lg shadow-slate-900/[0.035] hover:border-emerald-300 hover:shadow-xl hover:shadow-emerald-950/[0.07] transition-all duration-300"
              >
                <div className="card-body gap-4 p-6 sm:p-7">
                  <div className="flex items-center justify-between">
                    <span className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-700 flex items-center justify-center shadow-sm">
                      <Icon className="w-5 h-5" />
                    </span>
                    <span className="badge badge-ghost badge-sm font-semibold">
                      {item.badge}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mt-1">
                    {item.title}
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Workflow steps */}
      <section className="workflow-section border-y border-slate-200/80">
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-10">
            <div className="space-y-1.5">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-950 tracking-tight">
                كيف تعمل المنصة في 3 خطوات؟
              </h2>
              <p className="text-sm text-slate-600">
                مسار انضمام وتشغيل منضبط يحفظ حقوق جميع الأطراف المرخصة.
              </p>
            </div>
            <Link
              to="/about"
              className="btn btn-ghost btn-sm text-emerald-700 font-bold gap-1 self-start sm:self-auto"
            >
              <span>تعرف على خارطة المنصة</span>
              <ArrowLeft className="w-4 h-4" />
            </Link>
          </div>

          <ul className="steps steps-vertical lg:steps-horizontal w-full">
            {WORKFLOW_STEPS.map((item) => (
              <li key={item.step} className="step step-primary">
                <div className="text-start lg:text-center px-3 pt-2 max-w-xs space-y-1">
                  <div className="inline-flex items-center gap-1.5 font-bold text-slate-900 text-sm">
                    <BadgeCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{item.title}</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {item.detail}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
