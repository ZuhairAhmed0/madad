import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="site-footer relative mt-auto overflow-hidden text-white">
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-14">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-9 lg:gap-14 items-start">
          <div className="space-y-4">
            <Link
              to="/"
              className="inline-flex items-center gap-3 text-xl font-extrabold text-white"
            >
              <img
                src="/images/madad-logo.svg"
                alt="شعار مدد"
                className="w-12 h-12 object-contain drop-shadow"
              />
              <span>
                مدد <span className="text-emerald-200 text-sm">B2B</span>
              </span>
            </Link>
            <p className="text-sm text-emerald-50/80 leading-8 max-w-sm">
              شبكة إمداد دوائي رقمية تربط الصيدليات ومخازن الأدوية المرخصة في
              أمدرمان، لتسهيل الوصول إلى المنتجات ومقارنة الأسعار بسرية وموثوقية.
            </p>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-emerald-50/90">
              <span className="w-2 h-2 rounded-full bg-emerald-300 shadow-[0_0_0_4px_rgba(110,231,183,0.12)]" />
              شبكة مخصصة للمنشآت الصيدلانية المرخصة
            </div>
          </div>

          <div className="md:ps-8">
            <h4 className="font-extrabold text-sm text-white mb-4">روابط سريعة</h4>
            <ul className="grid grid-cols-2 md:grid-cols-1 gap-x-4 gap-y-3 text-sm text-emerald-50/75">
              <li>
                <Link to="/" className="footer-link">الرئيسية</Link>
              </li>
              <li>
                <Link to="/about" className="footer-link">عن مدد</Link>
              </li>
              <li>
                <Link to="/contact" className="footer-link">طلب انضمام وتواصل</Link>
              </li>
              <li>
                <Link to="/terms" className="footer-link">الشروط والخصوصية</Link>
              </li>
              <li>
                <Link to="/login" className="footer-link font-bold text-emerald-200">دخول المنصة</Link>
              </li>
            </ul>
          </div>

          <div className="footer-notice rounded-2xl border border-white/15 bg-white/[0.08] p-5 space-y-3 backdrop-blur-sm">
            <p className="text-sm font-extrabold text-emerald-100">
              تنويه تنظيمي وسرية الأسعار
            </p>
            <p className="text-sm text-emerald-50/80 leading-7">
              منصة B2B مغلقة للمنشآت الصيدلانية وموزعي الأدوية المرخصين فقط.
              تُحجب أسعار الجملة برمجياً حتى اعتماد المنشأة وموافقة الموزّع على
              صلاحية الاطلاع.
            </p>
            <Link to="/terms" className="inline-flex items-center gap-2 text-xs font-bold text-white hover:text-emerald-200 transition-colors">
              اقرأ الشروط وسياسة الخصوصية
              <span aria-hidden="true">←</span>
            </Link>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/15 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-emerald-50/65">
          <span>© 2026 منصة مدد B2B للإمداد الدوائي — أمدرمان، السودان.</span>
          <span>العملة المعتمدة: الجنيه السوداني (SDG)</span>
        </div>
      </div>
    </footer>
  );
}
