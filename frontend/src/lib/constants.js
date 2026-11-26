export const VERIFICATION_STATUS = {
  PENDING: {
    label: "قيد المراجعة",
    badgeClass: "badge-warning",
  },
  VERIFIED: {
    label: "موثّق",
    badgeClass: "badge-success",
  },
  SUSPENDED: {
    label: "موقوف",
    badgeClass: "badge-error",
  },
};

export const SALES_STATUS = {
  OPEN: {
    label: "يستقبل الطلبيات",
    badgeClass: "badge-success",
  },
  PAUSED_REPRICING: {
    label: "متوقف مؤقتاً للتسعير",
    badgeClass: "badge-warning",
  },
};

export const PERMISSION_STATUS = {
  NONE: {
    label: "غير مصرح",
    badgeClass: "badge-ghost",
  },
  PENDING: {
    label: "قيد الانتظار",
    badgeClass: "badge-warning",
  },
  APPROVED: {
    label: "مصرح به",
    badgeClass: "badge-success",
  },
  REVOKED: {
    label: "ملغي",
    badgeClass: "badge-error",
  },
};

export const ORDER_STATUS = {
  PENDING_CONFIRMATION: {
    label: "بانتظار التأكيد",
    badgeClass: "badge-warning",
  },
  CONFIRMED: {
    label: "مؤكدة",
    badgeClass: "badge-success",
  },
  EXPIRED_CANCELLED: {
    label: "منتهية المهلة",
    badgeClass: "badge-neutral",
  },
  CANCELLED: {
    label: "ملغاة",
    badgeClass: "badge-error",
  },
};

export const ORG_TYPE = {
  PHARMACY: {
    label: "صيدلية",
    badgeClass: "badge-info",
  },
  DISTRIBUTOR: {
    label: "موزّع / مخزن",
    badgeClass: "badge-primary",
  },
};

export const PRICING_POLICY = {
  HIGHEST_AUTHORIZED: {
    label: "أعلى سعر مصرح به (تحوطي)",
    badgeClass: "badge-secondary",
  },
  PREFERRED_DISTRIBUTOR: {
    label: "موزّع مفضل",
    badgeClass: "badge-info",
  },
};

export const ROLE_LABELS = {
  PHARMACY: {
    label: "صيدلية",
    badgeClass: "badge-info",
  },
  DISTRIBUTOR: {
    label: "موزّع دوائي",
    badgeClass: "badge-primary",
  },
  ADMIN: {
    label: "إدارة المنصة",
    badgeClass: "badge-neutral",
  },
};

/** Resolve the post-login home path for an authenticated user role. */
export function getRoleHomePath(role) {
  switch (role) {
    case "PHARMACY":
      return "/pharmacy/catalog";
    case "DISTRIBUTOR":
      return "/distributor/listings";
    case "ADMIN":
      return "/admin/organizations";
    default:
      return "/";
  }
}

export const DEMO_ACCOUNTS = [
  {
    email: "yoland@madad.sd",
    password: "Pass123!",
    role: "PHARMACY",
    orgName: "صيدلية يولاند",
    region: "الفتيحاب - أمدرمان",
    status: "VERIFIED",
    description: "صيدلية مفعّلة تملك صلاحية أسعار مخزن الفنار وقائمة مراقبة.",
  },
  {
    email: "roa@madad.sd",
    password: "Pass123!",
    role: "PHARMACY",
    orgName: "صيدلية د. رؤى",
    region: "الثورة - أمدرمان",
    status: "VERIFIED",
    description: "صيدلية مفعّلة حديثاً لاختبار طلب الصلاحيات والطلبيات.",
  },
  {
    email: "fanar@madad.sd",
    password: "Pass123!",
    role: "DISTRIBUTOR",
    orgName: "شركة الفنار للتوزيع الدوائي",
    region: "الشهداء - أمدرمان",
    status: "VERIFIED",
    description: "موزّع مفعّل يضم كتالوجاً نشطاً وطلبيات وصلاحيات.",
  },
  {
    email: "bluenile@madad.sd",
    password: "Pass123!",
    role: "DISTRIBUTOR",
    orgName: "شركة النيل الأزرق للإمداد الدوائي",
    region: "السوق الشعبي - أمدرمان",
    status: "VERIFIED",
    description: "موزّع مفعّل لإدارة القوائم والتسعير الجماعي.",
  },
  {
    email: "admin@madad.sd",
    password: "Admin123!",
    role: "ADMIN",
    orgName: "إدارة منصة مدد",
    region: "مركز التحكم",
    status: "VERIFIED",
    description: "حساب الإدارة لاعتماد التراخيص وتعديل حالات المنشآت.",
  },
  {
    email: "amal@madad.sd",
    password: "Pass123!",
    role: "PHARMACY",
    orgName: "صيدلية الأمل الجديدة",
    region: "المهندسين - أمدرمان",
    status: "PENDING",
    description: "قيد المراجعة — لاختبار رفض بوابة التحقق 403.",
  },
];

/** Single source of truth for the 2-minute (120,000 ms) background polling interval. */
export const AUTO_REFRESH_INTERVAL_MS = 120_000;
