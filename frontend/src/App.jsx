import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
} from "react-router-dom";
import { ArrowRight, SearchX } from "lucide-react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { getRoleHomePath } from "./lib/constants";
import PublicLayout from "./components/layout/PublicLayout";
import DashboardLayout from "./components/layout/DashboardLayout";
import HomePage from "./features/public/HomePage";
import AboutPage from "./features/public/AboutPage";
import ContactPage from "./features/public/ContactPage";
import TermsPolicyPage from "./features/public/TermsPolicyPage";
import LoginPage from "./features/auth/LoginPage";
import { PharmacyCartProvider } from "./features/pharmacy/PharmacyCartContext";
import CartDrawer from "./features/pharmacy/CartDrawer";
import CatalogPage from "./features/pharmacy/CatalogPage";
import WatchlistPage from "./features/pharmacy/WatchlistPage";
import OrdersPage from "./features/pharmacy/OrdersPage";
import DistributorsPage from "./features/pharmacy/DistributorsPage";
import DistributorDetailPage from "./features/pharmacy/DistributorDetailPage";
import ListingsPage from "./features/distributor/ListingsPage";
import ImportPage from "./features/distributor/ImportPage";
import DistributorOrdersPage from "./features/distributor/OrdersPage";
import PermissionsPage from "./features/distributor/PermissionsPage";
import OrganizationsPage from "./features/admin/OrganizationsPage";

function ProtectedRoute({ allowedRoles }) {
  const { user, loading, isAuthenticated } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center madad-surface-mesh gap-5">
        <div className="card bg-white/90 border border-slate-200/80 p-8 flex flex-col items-center gap-4">
          <img src="/images/madad-logo.svg" alt="شعار مدد" className="w-12 h-12" />
          <span className="loading loading-spinner loading-lg text-primary" />
          <p className="text-sm font-medium text-slate-600">جارٍ التحقق من الجلسة...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={getRoleHomePath(user.role)} replace />;
  }

  return <Outlet />;
}

function PharmacyPortalShell() {
  const { organization } = useAuth();

  // Key cart provider by organization ID so switching demo pharmacies isolates cart state.
  return (
    <PharmacyCartProvider key={organization?.id || "anon"}>
      <DashboardLayout />
      <CartDrawer />
    </PharmacyCartProvider>
  );
}

function NotFoundPage() {
  return (
    <div className="min-h-screen madad-surface-mesh flex items-center justify-center px-4">
      <div className="card bg-base-100 border border-base-200 shadow-sm max-w-md w-full">
        <div className="card-body p-8 items-center text-center space-y-4">
          <img src="/images/madad-logo.svg" alt="شعار مدد" className="w-12 h-12" />
          <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-600 flex items-center justify-center">
            <SearchX className="w-7 h-7" />
          </div>
          <div className="space-y-1">
            <p className="text-sm font-mono font-bold text-emerald-700">404</p>
            <h1 className="text-xl font-extrabold text-slate-900">
              الصفحة غير موجودة
            </h1>
            <p className="text-sm text-slate-600">
              تعذر العثور على المسار المطلوب داخل منصة مدد B2B.
            </p>
          </div>
          <Link to="/" className="btn btn-primary btn-sm font-bold gap-1.5">
            <ArrowRight className="w-4 h-4" />
            <span>العودة إلى الرئيسية</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Routes>
            {/* Public marketing & auth routes */}
            <Route element={<PublicLayout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/terms" element={<TermsPolicyPage />} />
              <Route path="/login" element={<LoginPage />} />
            </Route>

            {/* Pharmacy dashboard routes (Phase F2) */}
            <Route element={<ProtectedRoute allowedRoles={["PHARMACY"]} />}>
              <Route path="/pharmacy" element={<PharmacyPortalShell />}>
                <Route
                  index
                  element={<Navigate to="/pharmacy/catalog" replace />}
                />
                <Route path="catalog" element={<CatalogPage />} />
                <Route path="watchlist" element={<WatchlistPage />} />
                <Route path="orders" element={<OrdersPage />} />
                <Route path="distributors" element={<DistributorsPage />} />
                <Route
                  path="distributors/:id"
                  element={<DistributorDetailPage />}
                />
              </Route>
            </Route>

            {/* Distributor dashboard routes (Phase F3) */}
            <Route element={<ProtectedRoute allowedRoles={["DISTRIBUTOR"]} />}>
              <Route path="/distributor" element={<DashboardLayout />}>
                <Route
                  index
                  element={<Navigate to="/distributor/listings" replace />}
                />
                <Route path="listings" element={<ListingsPage />} />
                <Route path="import" element={<ImportPage />} />
                <Route path="orders" element={<DistributorOrdersPage />} />
                <Route path="permissions" element={<PermissionsPage />} />
              </Route>
            </Route>

            {/* Admin dashboard routes (Phase F4) */}
            <Route element={<ProtectedRoute allowedRoles={["ADMIN"]} />}>
              <Route path="/admin" element={<DashboardLayout />}>
                <Route
                  index
                  element={<Navigate to="/admin/organizations" replace />}
                />
                <Route path="organizations" element={<OrganizationsPage />} />
              </Route>
            </Route>

            {/* Fallback 404 */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
