import { useEffect, useRef } from "react";
import {
  Link,
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Building2,
  ClipboardCheck,
  ClipboardList,
  ExternalLink,
  KeyRound,
  LogOut,
  MapPin,
  Menu,
  PackageSearch,
  ShieldCheck,
  Tags,
  TrendingUp,
  Upload,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { ROLE_LABELS } from "../../lib/constants";
import StatusBadge from "../ui/StatusBadge";

const NAV_ITEMS_BY_ROLE = {
  PHARMACY: [
    {
      to: "/pharmacy/catalog",
      label: "الكتالوج الموحّد",
      icon: PackageSearch,
    },
    {
      to: "/pharmacy/watchlist",
      label: "رادار الأسعار",
      icon: TrendingUp,
    },
    {
      to: "/pharmacy/orders",
      label: "الطلبيات",
      icon: ClipboardList,
    },
    {
      to: "/pharmacy/distributors",
      label: "دليل الموزعين",
      icon: Building2,
    },
  ],
  DISTRIBUTOR: [
    {
      to: "/distributor/listings",
      label: "الأصناف والتسعير",
      icon: Tags,
    },
    {
      to: "/distributor/import",
      label: "الاستيراد والـ Aliases",
      icon: Upload,
    },
    {
      to: "/distributor/orders",
      label: "الطلبيات الواردة",
      icon: ClipboardCheck,
    },
    {
      to: "/distributor/permissions",
      label: "الصلاحيات والصيدليات",
      icon: KeyRound,
    },
  ],
  ADMIN: [
    {
      to: "/admin/organizations",
      label: "إدارة المنشآت",
      icon: ShieldCheck,
    },
  ],
};

export default function DashboardLayout() {
  const { user, organization, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const drawerToggleRef = useRef(null);

  const navItems = NAV_ITEMS_BY_ROLE[user?.role] || [];

  const closeMobileDrawer = () => {
    if (drawerToggleRef.current) {
      drawerToggleRef.current.checked = false;
    }
  };

  useEffect(() => {
    closeMobileDrawer();
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    toast.info("تم تسجيل الخروج بنجاح");
    navigate("/login", { replace: true });
  };

  return (
    <div className="drawer lg:drawer-open min-h-screen madad-surface-mesh text-slate-900">
      <input
        id="madad-dashboard-drawer"
        ref={drawerToggleRef}
        type="checkbox"
        className="drawer-toggle"
      />

      <div className="drawer-content flex flex-col min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-lg border-b border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.03)] px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <label
              htmlFor="madad-dashboard-drawer"
              className="btn btn-ghost btn-sm btn-square lg:hidden"
              aria-label="فتح القائمة الجانبية"
            >
              <Menu className="w-5 h-5" />
            </label>

            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-sm sm:text-base text-slate-900 truncate max-w-52 sm:max-w-none">
                  {organization?.name || user?.fullName || "منصة مدد"}
                </span>
                <StatusBadge map={ROLE_LABELS} value={user?.role} />
              </div>
              {organization?.region && (
                <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                  <MapPin className="w-3 h-3 shrink-0" />
                  <span className="truncate">{organization.region}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/"
              className="btn btn-ghost btn-sm gap-1.5 text-slate-600 hidden sm:inline-flex"
            >
              <ExternalLink className="w-4 h-4" />
              <span>الموقع العام</span>
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="btn btn-outline btn-error btn-sm gap-1.5"
            >
              <LogOut className="w-4 h-4" />
              <span>خروج</span>
            </button>
          </div>
        </header>

        {/* Page body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          <Outlet />
        </main>

        {/* Slim workspace footer */}
        <footer className="border-t border-slate-200/80 bg-white/80 px-4 sm:px-6 py-3 text-xs text-slate-500 flex flex-wrap items-center justify-between gap-2">
          <span>مدد B2B — شبكة الإمداد الدوائي المرخصة</span>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="hover:text-emerald-700">
              الشروط والخصوصية
            </Link>
            <Link to="/contact" className="hover:text-emerald-700">
              الدعم والتواصل
            </Link>
          </div>
        </footer>
      </div>

      {/* Sidebar */}
      <div className="drawer-side z-40">
        <label
          htmlFor="madad-dashboard-drawer"
          aria-label="إغلاق القائمة الجانبية"
          className="drawer-overlay"
        />
        <aside className="w-72 min-h-full bg-gradient-to-b from-[#061c17] via-[#09241e] to-[#051412] text-slate-100 border-e border-emerald-900/40 flex flex-col">
          <div className="h-16 px-5 border-b border-white/10 flex items-center justify-between">
            <Link
              to="/"
              onClick={closeMobileDrawer}
              className="inline-flex items-center gap-2.5 font-extrabold text-lg text-white"
            >
              <img
                src="/images/madad-logo.svg"
                alt="شعار مدد"
                className="w-9 h-9 object-contain rounded-xl bg-white/10 p-1.5 ring-1 ring-white/15"
              />
              <span>مدد <span className="text-emerald-300">B2B</span></span>
            </Link>
            <span className="badge badge-xs border-emerald-400/30 bg-emerald-400/10 text-emerald-200">
              مباشر
            </span>
          </div>

          <div className="p-4 flex-1">
            <p className="px-3 mb-2 text-xs font-bold text-slate-400">
              لوحة العمليات
            </p>
            <ul className="menu p-0 gap-1 w-full">
              {navItems.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={closeMobileDrawer}
                      className={({ isActive }) =>
                        `flex items-center gap-3 px-3.5 py-3 rounded-xl text-sm font-semibold transition-colors ${
                          isActive
                            ? "bg-emerald-500/20 text-white font-bold ring-1 ring-emerald-400/30 shadow-sm"
                            : "text-slate-300 hover:bg-white/[0.06] hover:text-white"
                        }`
                      }
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span>{item.label}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="p-4 border-t border-white/10 space-y-2">
            <div className="text-xs text-slate-300 truncate rounded-xl border border-white/10 bg-white/[0.05] p-3">
              المستخدم:{" "}
              <span className="font-semibold text-white">
                {user?.email}
              </span>
            </div>
            <Link
              to="/"
              onClick={closeMobileDrawer}
              className="btn btn-ghost btn-xs w-full justify-start gap-1.5 text-slate-600 sm:hidden"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>العودة للموقع العام</span>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
