import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import {
  AlertCircle,
  KeyRound,
  LogIn,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { ApiError } from "../../lib/api";
import {
  DEMO_ACCOUNTS,
  getRoleHomePath,
  ROLE_LABELS,
  VERIFICATION_STATUS,
} from "../../lib/constants";
import StatusBadge from "../../components/ui/StatusBadge";

export default function LoginPage() {
  const { user, loading: authLoading, isAuthenticated, login } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorInfo, setErrorInfo] = useState(null);

  if (!authLoading && isAuthenticated && user) {
    return <Navigate to={getRoleHomePath(user.role)} replace />;
  }

  const executeLogin = async (targetEmail, targetPassword) => {
    if (submitting) return;

    const cleanEmail = targetEmail.trim();
    if (!cleanEmail || !targetPassword) {
      setErrorInfo({
        code: "VALIDATION_ERROR",
        message: "يرجى إدخال البريد الإلكتروني وكلمة المرور",
      });
      return;
    }

    setSubmitting(true);
    setErrorInfo(null);

    try {
      const { user: loggedInUser, organization } = await login(
        cleanEmail,
        targetPassword
      );
      toast.success(
        `مرحباً بك${organization?.name ? ` — ${organization.name}` : ""}`
      );
      navigate(getRoleHomePath(loggedInUser?.role), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setErrorInfo({
          code: err.code,
          status: err.status,
          message: err.message,
          requestId: err.requestId,
        });
        toast.error(err.message);
      } else {
        setErrorInfo({
          code: "UNKNOWN_ERROR",
          message: "حدث خطأ غير متوقع أثناء تسجيل الدخول",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleFormSubmit = (event) => {
    event.preventDefault();
    void executeLogin(email, password);
  };

  const handleDemoLogin = (account) => {
    if (submitting) return;
    setEmail(account.email);
    setPassword(account.password);
    void executeLogin(account.email, account.password);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Login Form */}
        <div className="lg:col-span-5">
          <div className="card bg-base-100 border border-base-200 shadow-sm">
            <div className="card-body p-6 sm:p-8 space-y-5">
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-full">
                  <ShieldCheck className="w-4 h-4" />
                  <span>بوابة المنشآت الموثّقة</span>
                </div>
                <h1 className="text-2xl font-extrabold text-slate-900 pt-1">
                  تسجيل الدخول إلى مدد B2B
                </h1>
                <p className="text-sm text-slate-600">
                  أدخل بيانات حسابك أو اختر أحد حسابات التجربة السريعة.
                </p>
              </div>

              {errorInfo && (
                <div
                  role="alert"
                  className={`alert ${
                    errorInfo.code === "ORG_NOT_VERIFIED"
                      ? "alert-warning"
                      : "alert-error"
                  } items-start text-sm`}
                >
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold">تعذر الدخول</span>
                      {errorInfo.code && (
                        <span className="badge badge-xs badge-neutral font-mono">
                          {errorInfo.code}
                        </span>
                      )}
                    </div>
                    <p className="leading-relaxed">{errorInfo.message}</p>
                    {errorInfo.code === "ORG_NOT_VERIFIED" && (
                      <p className="text-xs opacity-90">
                        تؤكد هذه الرسالة عمل بوابة التحقق (403) لمنع الحسابات
                        قيد المراجعة أو الموقوفة من الوصول للأسعار.
                      </p>
                    )}
                  </div>
                </div>
              )}

              <form onSubmit={handleFormSubmit} className="space-y-4">
                <div className="form-control">
                  <label className="label" htmlFor="login-email">
                    <span className="label-text font-semibold text-slate-700">
                      البريد الإلكتروني
                    </span>
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    dir="ltr"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@madad.sd"
                    disabled={submitting}
                    className="input input-bordered w-full text-left"
                  />
                </div>

                <div className="form-control">
                  <label className="label" htmlFor="login-password">
                    <span className="label-text font-semibold text-slate-700">
                      كلمة المرور
                    </span>
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    dir="ltr"
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    disabled={submitting}
                    className="input input-bordered w-full text-left"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="btn btn-primary w-full font-bold gap-2"
                >
                  {submitting ? (
                    <span className="loading loading-spinner loading-sm" />
                  ) : (
                    <LogIn className="w-4 h-4" />
                  )}
                  <span>{submitting ? "جارٍ التحقق..." : "دخول المنصة"}</span>
                </button>
              </form>

              <div className="text-xs text-slate-500 pt-2 border-t border-base-200 flex items-center justify-between gap-2 flex-wrap">
                <span>منشأة جديدة دون حساب؟</span>
                <Link
                  to="/contact"
                  className="font-bold text-emerald-700 hover:underline"
                >
                  تقديم طلب انضمام للمراجعة
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Demo Quick Login Panel */}
        <div className="lg:col-span-7">
          <div className="card bg-base-100 border border-base-200 shadow-xs">
            <div className="card-body p-6 sm:p-8 space-y-5">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-extrabold text-lg text-slate-900">
                    <Sparkles className="w-5 h-5 text-emerald-600" />
                    <span>دخول سريع للتجربة (Demo Accounts)</span>
                  </div>
                  <p className="text-xs sm:text-sm text-slate-600">
                    انقر على أي منشأة لتعبئة البيانات وتسجيل الدخول مباشرةً حسب
                    دورها في النظام.
                  </p>
                </div>
                <span className="badge badge-ghost badge-sm gap-1">
                  <KeyRound className="w-3 h-3" />
                  <span>6 حسابات ديمو</span>
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {DEMO_ACCOUNTS.map((account) => {
                  const isPending = account.status === "PENDING";
                  return (
                    <button
                      key={account.email}
                      type="button"
                      disabled={submitting}
                      onClick={() => handleDemoLogin(account)}
                      className={`demo-login-card text-start rounded-xl border p-4 transition-all flex flex-col justify-between gap-2.5 disabled:opacity-60 disabled:cursor-not-allowed ${
                        isPending
                          ? "border-amber-200 bg-amber-50/50 hover:bg-amber-50"
                          : "border-base-200 bg-slate-50/70 hover:border-emerald-300 hover:bg-emerald-50/40"
                      }`}
                    >
                      <div className="space-y-1.5 w-full">
                        <div className="flex items-center justify-between gap-2">
                          <StatusBadge map={ROLE_LABELS} value={account.role} />
                          <StatusBadge
                            map={VERIFICATION_STATUS}
                            value={account.status}
                          />
                        </div>
                        <p className="font-bold text-sm text-slate-900">
                          {account.orgName}
                        </p>
                        <p className="text-xs text-slate-600 leading-relaxed">
                          {account.description}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-base-200/80 w-full flex items-center justify-between gap-2 text-xs">
                        <span
                          dir="ltr"
                          className="font-mono text-slate-500 truncate"
                        >
                          {account.email}
                        </span>
                        <span className="font-bold text-emerald-700 shrink-0">
                          {isPending ? "اختبار الرفض" : "دخول سريع"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
