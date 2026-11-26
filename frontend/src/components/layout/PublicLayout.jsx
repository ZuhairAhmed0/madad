import { useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { ArrowLeft, Menu } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { getRoleHomePath } from "../../lib/constants";
import Footer from "./Footer";

const NAV_LINKS = [
  { to: "/", label: "الرئيسية", end: true },
  { to: "/about", label: "عن مدد" },
  { to: "/contact", label: "طلب انضمام وتواصل" },
  { to: "/terms", label: "الشروط والخصوصية" },
];

export default function PublicLayout() {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const dashboardPath = user ? getRoleHomePath(user.role) : "/login";

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.activeElement?.blur?.();
    }
  }, [location.pathname]);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      <header className="public-header sticky top-0 z-40 border-b border-white/70">
        <div className="navbar max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[76px]">
          <div className="navbar-start gap-2">
            <div className="dropdown lg:hidden">
              <div
                tabIndex={0}
                role="button"
                className="btn btn-ghost btn-sm btn-square"
                aria-label="قائمة التنقل"
              >
                <Menu className="w-5 h-5" />
              </div>
              <ul
                tabIndex={0}
                className="menu menu-sm dropdown-content bg-base-100 rounded-box z-50 mt-3 w-56 p-2 shadow-lg border border-base-200"
              >
                {NAV_LINKS.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={() => document.activeElement?.blur()}
                      className={({ isActive }) =>
                        isActive ? "active font-bold text-emerald-700" : ""
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>

            <Link
              to="/"
              className="inline-flex items-center gap-3 font-extrabold text-lg text-slate-900"
            >
              <img
                src="/images/madad-logo.svg"
                alt="شعار مدد"
                className="w-11 h-11 object-contain drop-shadow-sm"
              />
              <div className="leading-tight">
                <span className="text-emerald-700">مدد</span>{" "}
                <span className="text-xs font-bold text-slate-500">B2B</span>
              </div>
            </Link>
          </div>

          <div className="navbar-center hidden lg:flex">
            <ul className="menu menu-horizontal px-1 gap-1 text-sm font-semibold">
              {NAV_LINKS.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `rounded-lg px-3.5 py-2 transition-colors ${
                        isActive
                          ? "bg-emerald-50 text-emerald-800 font-bold"
                          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>

          <div className="navbar-end">
            {isAuthenticated ? (
              <Link
                to={dashboardPath}
                className="btn btn-primary btn-sm gap-1.5 font-bold"
              >
                <span>لوحة التحكم</span>
                <ArrowLeft className="w-4 h-4" />
              </Link>
            ) : (
              <Link
                to="/login"
                className="btn btn-primary btn-sm gap-1.5 font-bold"
              >
                <span>دخول المنصة</span>
                <ArrowLeft className="w-4 h-4" />
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <Footer />
    </div>
  );
}
