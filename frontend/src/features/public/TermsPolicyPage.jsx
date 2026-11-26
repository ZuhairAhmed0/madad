import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Lock,
  Scale,
  ShieldCheck,
} from "lucide-react";

const TERMS_SECTIONS = [
  {
    title: "نطاق المنصة وصحة التراخيص",
    body: "تقتصر منصة مدد B2B على المعاملات التجارية بين الصيدليات وموزعي الأدوية والمنشآت الصيدلانية المرخصة. يخضع تفعيل الحساب لمراجعة بيانات المنشأة وترخيصها، ويحق لإدارة المنصة إيقاف الحساب إذا ثبت انتهاء صلاحية الترخيص أو تقديم بيانات غير دقيقة. إنشاء الحساب وحده لا يمنح حق الاطلاع على جميع بيانات السوق أو أسعار الموزعين.",
  },
  {
    title: "الحسابات وصحة البيانات",
    body: "يلتزم كل مستخدم بتقديم بيانات صحيحة ومحدثة تخصه وتخص المنشأة التي يمثلها، والمحافظة على سرية بيانات الدخول وعدم مشاركتها مع أشخاص غير مخولين. يجب إبلاغ إدارة المنصة عند الاشتباه في استخدام الحساب من طرف آخر أو عند تغير بيانات المنشأة أو حالة الترخيص.",
  },
  {
    title: "حجب أسعار الجملة وطلب الصلاحية",
    body: "تُعامل أسعار الجملة باعتبارها بيانات تجارية سرية، وتظل محجوبة افتراضياً عن الصيدليات. لا تظهر القيمة السعرية (wholesalePriceSdg) إلا بعد موافقة الموزّع الصريحة على طلب الاطلاع وتفعيل الحالة المعتمدة (APPROVED). ولا يكفي وجود حساب في المنصة للحصول على هذه الصلاحية.",
  },
  {
    title: "سحب الصلاحيات والعزل بين المنشآت",
    body: "يستطيع الموزّع سحب صلاحية الاطلاع (REVOKED) من الصيدلية، وعندها يتوقف عرض أسعار الجملة للصيدلية المعنية. كما تُدار قوائم المتابعة وأسعار الرف الخاصة بكل صيدلية بصورة منفصلة، ولا تمنح صلاحية الوصول إلى بيانات منشأة أخرى لمجرد امتلاك المستخدم حساباً في المنصة.",
  },
  {
    title: "لقطات الأسعار وتضارب السعر (Price Version & 409)",
    body: "يُحتسب إجمالي الطلبية بالجنيه السوداني (SDG) وفق إصدار السعر (price_version) المتاح لحظة إنشاء الطلب. إذا تغير السعر أثناء تقديم الطلبية، قد يرفض الخادم التنفيذ برمز تضارب (409) حتى يراجع المستخدم السعر المحدث ويؤكد اختياره من جديد. يهدف ذلك إلى منع اعتماد طلب على سعر قديم أو غير متطابق.",
  },
  {
    title: "مهلة تأكيد الطلبيات والانتهاء التلقائي",
    body: "يحدد الموزّع نافذة صلاحية لتأكيد الطلبيات الواردة، وقد تختلف المهلة بحسب إعداداته. إذا انقضت المهلة دون تأكيد الموزّع، تتحول الطلبية تلقائياً إلى حالة منتهية وملغاة (EXPIRED_CANCELLED). لا ينبغي اعتبار الطلبية مؤكدة قبل ظهور حالة التأكيد داخل المنصة.",
  },
  {
    title: "إيقاف المبيعات مؤقتاً لأغراض التسعير",
    body: "يجوز للموزّع وضع المخزن في حالة إيقاف مؤقت للتسعير (PAUSED_REPRICING) أثناء تعديل قوائم المنتجات أو مراجعة الأسعار. خلال فترة الإيقاف لا تكون الطلبيات الجديدة متاحة، ويعود استقبالها بعد إعادة فتح الخدمة من قبل الموزّع.",
  },
  {
    title: "دقة بيانات المنتجات والأسعار",
    body: "يتحمل الموزّع مسؤولية مراجعة قوائم المنتجات والكميات والأسعار التي يدخلها أو يستوردها إلى المنصة، كما تتحمل الصيدلية مسؤولية مراجعة تفاصيل الأصناف والكميات والأسعار الظاهرة لها قبل إرسال الطلب. تعرض المنصة البيانات التي تقدمها المنشآت ولا تحل محل التحقق التجاري المباشر عند الحاجة.",
  },
  {
    title: "الاستخدام المقبول وتوفر الخدمة",
    body: "يُمنع استخدام المنصة لتقديم بيانات مضللة، أو محاولة الوصول إلى أسعار أو حسابات دون صلاحية، أو تعطيل الخدمة، أو استخراج بيانات منشآت أخرى خارج الصلاحيات الممنوحة. تعمل المنصة على توفير الخدمة بصورة مستقرة، لكن قد تتأثر بعض الوظائف بالصيانة أو انقطاع الاتصال أو الأعطال الفنية.",
  },
  {
    title: "تحديث الشروط",
    body: "قد تُحدّث المنصة خصائصها أو هذه الشروط عند الحاجة التشغيلية أو التنظيمية. ستُنشر النسخة المعدلة في هذه الصفحة، ويُنصح بمراجعتها دورياً. ويكون استمرار استخدام الحساب بعد نشر التحديثات خاضعاً للنسخة المحدثة من الشروط.",
  },
];

const PRIVACY_SECTIONS = [
  {
    title: "المعلومات التي قد نجمعها",
    body: "قد تشمل البيانات التي يقدمها المستخدم معلومات التعريف ووسائل التواصل وبيانات الحساب والدور الوظيفي، واسم المنشأة ونوعها ومعلومات الترخيص، وبيانات المستخدمين المرتبطين بالمنشأة. كما تنشأ أثناء استخدام المنصة بيانات تشغيلية مثل طلبات صلاحية الاطلاع، والمنتجات والأسعار، والطلبيات، وحالاتها، وقوائم المتابعة، وسجلات الأمان والتدقيق.",
  },
  {
    title: "كيف نستخدم المعلومات",
    body: "تُستخدم البيانات لإنشاء الحسابات وإدارة صلاحياتها والتحقق من أهلية المنشآت، وعرض الكتالوج والأسعار المصرح بها، ومعالجة الطلبيات ومتابعة حالاتها، وإدارة قوائم المتابعة، وتقديم الدعم، وحماية المنصة، واكتشاف الأخطاء أو محاولات الاستخدام غير المصرح به.",
  },
  {
    title: "سرية أسعار الجملة وصلاحيات الاطلاع",
    body: "تُعامل أسعار الجملة باعتبارها معلومات تجارية حساسة. لا تُعرض للصيدلية قبل موافقة الموزّع، ويُحجب الحقل السعري من استجابة الخادم عند غياب الصلاحية. ويمكن للموزّع سحب الموافقة لاحقاً، وعندها يتوقف عرض الأسعار للصيدلية المعنية.",
  },
  {
    title: "فصل بيانات المنشآت",
    body: "تُدار صلاحيات كل منشأة على حدة. ولا ينبغي أن تمنح عضوية المستخدم في منشأة ما حق الاطلاع على أسعار أو قوائم متابعة أو بيانات تشغيلية تخص منشأة أخرى. وتُستخدم بيانات الطلبات والصلاحيات في الحدود اللازمة لإتمام التعامل التجاري بين الأطراف المعنية.",
  },
  {
    title: "مشاركة المعلومات",
    body: "قد تظهر المعلومات اللازمة لتنفيذ طلب أو إدارة صلاحية للطرف التجاري المعني، وضمن الحدود التي تتطلبها العملية والصلاحيات المعتمدة. ولا تُعد أسعار الموزّع أو قوائم متابعة الصيدلية معلومات متاحة لجميع المستخدمين. يجب على المستخدم التأكد من امتلاكه الصلاحية اللازمة لإدخال بيانات المنشأة أو مشاركتها.",
  },
  {
    title: "حماية الحسابات والبيانات",
    body: "تستخدم المنصة ضوابط تقنية لتقليل الوصول غير المصرح به، بما في ذلك حماية الجلسات باستخدام ملفات تعريف ارتباط آمنة من نوع HttpOnly. كما لا ينبغي تضمين كلمات المرور أو البيانات الحساسة في سجلات التشغيل، وقد تُسجل أحداث النظام ومعرفات تتبع الطلبات لأغراض التشخيص والتدقيق. ومع ذلك، لا توجد وسيلة تقنية تضمن الحماية المطلقة من جميع المخاطر.",
  },
  {
    title: "ملفات الارتباط والجلسات",
    body: "تُستخدم ملفات الارتباط وإشارات الجلسة اللازمة لتسجيل الدخول والمحافظة على حالة المستخدم وأمان الوصول. وقد يؤدي تعطيل ملفات الارتباط الضرورية إلى تعذر تسجيل الدخول أو عمل بعض وظائف المنصة بصورة صحيحة.",
  },
  {
    title: "الاحتفاظ بالسجلات",
    body: "قد تحتفظ المنصة ببيانات الحسابات والطلبيات وسجلات التدقيق بالقدر اللازم لتشغيل الخدمة، ومتابعة المعاملات، ومعالجة النزاعات أو المشكلات الفنية، والوفاء بالمتطلبات النظامية ذات الصلة. ولا تحدد هذه الصفحة مدة ثابتة للاحتفاظ بكل فئة من البيانات.",
  },
  {
    title: "مسؤولية المستخدم ومراجعة بياناته",
    body: "يتعين على المستخدم التأكد من أن لديه صلاحية إدخال بيانات المنشأة ومشاركتها، والمحافظة على صحة معلومات الاتصال والترخيص وتحديثها عند تغيرها. ويمكن التواصل مع إدارة المنصة لطلب مراجعة البيانات أو تصحيحها أو الاستفسار عن طريقة استخدامها.",
  },
  {
    title: "التعديلات على سياسة الخصوصية",
    body: "قد تُحدّث هذه السياسة عند إضافة وظائف جديدة أو تغيير طريقة تشغيل المنصة أو استجابة لمتطلبات تنظيمية. ستُنشر النسخة المعدلة في هذه الصفحة، ويُنصح بمراجعتها دورياً لمعرفة كيفية التعامل مع البيانات.",
  },
];

function PolicySections({ sections }) {
  return (
    <div className="policy-sections">
      {sections.map((section, index) => (
        <section className="policy-section" key={section.title}>
          <div className="policy-section-number">
            {String(index + 1).padStart(2, "0")}
          </div>
          <div className="space-y-2">
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
              {section.title}
            </h2>
            <p className="text-sm sm:text-[15px] text-slate-600 leading-8">
              {section.body}
            </p>
          </div>
        </section>
      ))}
    </div>
  );
}

export default function TermsPolicyPage() {
  const [activeTab, setActiveTab] = useState("terms");

  return (
    <div className="policy-page min-h-full px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="policy-hero rounded-[2rem] p-6 sm:p-10 lg:p-12">
          <div className="relative z-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/80 bg-white/70 px-3.5 py-1.5 text-xs font-extrabold text-emerald-800 backdrop-blur">
              <ShieldCheck className="w-4 h-4" />
              <span>مدد B2B · الاستخدام المسؤول وحماية البيانات</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight text-slate-950">
              الشروط والأحكام
              <span className="block text-emerald-700">وسياسة الخصوصية</span>
            </h1>
            <p className="max-w-2xl text-sm sm:text-base text-slate-700 leading-8">
              توضح هذه الصفحة قواعد استخدام شبكة مدد، وآلية حماية بيانات
              المنشآت، والضوابط التي تنظم الاطلاع على أسعار الجملة والطلبيات.
            </p>
            <div className="flex flex-wrap gap-3 pt-1 text-xs font-bold text-slate-600">
              <span className="inline-flex items-center gap-2 rounded-xl bg-white/75 border border-white px-3 py-2">
                <Lock className="w-4 h-4 text-emerald-700" /> سرية الأسعار
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl bg-white/75 border border-white px-3 py-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-700" /> صلاحيات معتمدة
              </span>
              <span className="inline-flex items-center gap-2 rounded-xl bg-white/75 border border-white px-3 py-2">
                <FileText className="w-4 h-4 text-emerald-700" /> قواعد تشغيل واضحة
              </span>
            </div>
          </div>
        </header>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-950">
              مرجع استخدام المنصة
            </h2>
            <p className="text-sm text-slate-500">
              اختر القسم الذي تريد مراجعته.
            </p>
          </div>
          <div role="tablist" className="policy-tabs tabs tabs-box p-1.5 rounded-2xl">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "terms"}
              onClick={() => setActiveTab("terms")}
              className={`tab h-11 rounded-xl px-4 sm:px-5 font-extrabold gap-2 ${
                activeTab === "terms" ? "tab-active" : ""
              }`}
            >
              <Scale className="w-4 h-4" />
              <span>شروط الاستخدام</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "privacy"}
              onClick={() => setActiveTab("privacy")}
              className={`tab h-11 rounded-xl px-4 sm:px-5 font-extrabold gap-2 ${
                activeTab === "privacy" ? "tab-active" : ""
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>سياسة الخصوصية</span>
            </button>
          </div>
        </div>

        <article className="policy-card border border-slate-100 p-5 sm:p-8 lg:p-10">
          {activeTab === "terms" ? (
            <>
              <div className="flex items-start gap-3 pb-6 border-b border-slate-100">
                <span className="policy-heading-icon">
                  <Scale className="w-5 h-5" />
                </span>
                <div className="space-y-1">
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-950">
                    شروط وأحكام الاستخدام
                  </h2>
                  <p className="text-sm text-slate-500 leading-6">
                    الضوابط التي تنظم حسابات المنشآت، وصلاحيات الأسعار، ومسار الطلب.
                  </p>
                </div>
              </div>
              <PolicySections sections={TERMS_SECTIONS} />
            </>
          ) : (
            <>
              <div className="flex items-start gap-3 pb-6 border-b border-slate-100">
                <span className="policy-heading-icon">
                  <Lock className="w-5 h-5" />
                </span>
                <div className="space-y-1">
                  <h2 className="text-lg sm:text-xl font-extrabold text-slate-950">
                    سياسة الخصوصية وسرية البيانات
                  </h2>
                  <p className="text-sm text-slate-500 leading-6">
                    ما الذي تجمعه المنصة، ولماذا تستخدمه، وكيف تحد من الوصول غير المصرح به.
                  </p>
                </div>
              </div>
              <PolicySections sections={PRIVACY_SECTIONS} />
            </>
          )}
        </article>

        <div className="policy-disclaimer flex items-start gap-3 rounded-2xl border border-amber-200/80 bg-amber-50/80 p-4 sm:p-5">
          <AlertCircle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-xs sm:text-sm text-amber-950/80 leading-7">
            هذه صياغة تشغيلية أولية تعكس وظائف المنصة الحالية، وليست استشارة
            قانونية. ينبغي مراجعتها واعتمادها قانونياً قبل إطلاق الخدمة، خصوصاً
            فيما يتعلق بمتطلبات حماية البيانات والتجارة الإلكترونية في نطاق عمل
            المنصة.
          </p>
        </div>
      </div>
    </div>
  );
}
