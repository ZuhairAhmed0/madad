# منصة مَدَد (Madad B2B Pharma Platform)

منصة رقمية لتوزيع وتداول الأدوية بالجملة مخصصة لمدينة أمدرمان وضواحيها. تتيح المنصة للصيدليات والشركات الموزعة للأدوية متابعة الأسعار، إبرام الطلبيات الفورية، وإدارة حسابات وسجلات الأدوية بكفاءة وموثوقية عالية.

---

## 🏗️ هيكلية المشروع (Architecture)

يتكون المشروع من قسمين رئيسيين:

1. **الواجهة الخلفية (`backend/`)**:
   - بيئة التشغيل: Node.js (TypeScript) + Express 5
   - قاعدة البيانات: PostgreSQL عبر Drizzle ORM
   - التخزين المؤقت (Caching): Redis / Upstash (يدعم العمل حتى في حال انقطاع Redis دون توقف الخدمة)
   - المصادقة: JWT (Bearer Header و HttpOnly Cookies)

2. **الواجهة الأمامية (`frontend/`)**:
   - بيئة التشغيل: React 19 + Vite 8
   - التصميم: TailwindCSS 4 + DaisyUI 5
   - التنقل: React Router v7

---

## 🚀 الرفع على Render (Render Deployment)

تم تجهيز المشروع بالكامل للنشر السريع على منصة [Render](https://render.com) بطريقتين:

### الطريقة الأولى: النشر الآلي بضغطة زر (Render Blueprint)
1. في لوحة تحكم Render، اضغط على **Blueprints** ثم **New Blueprint Instance**.
2. اربط مستودع GitHub: `https://github.com/ZuhairAhmed0/madad.git`.
3. سيتعرف Render تلقائياً على ملف `render.yaml` المرفق وينشئ:
   - **الخادم (madad-backend)**: Web Service.
   - **الواجهة (madad-frontend)**: Static Site.
4. قم بملء المتغيرات البيئية المطلوبة لقاعدة البيانات.

---

### الطريقة الثانية: النشر اليدوي (Manual Deployment)

#### 1. نشر الواجهة الخلفية (Backend API)
- أنشئ **Web Service** جديد.
- **Root Directory**: `backend`
- **Runtime**: `Node`
- **Build Command**: `npm install && npm run build`
- **Start Command**: `npm start`
- **Health Check Path**: `/api/ping`
- **Environment Variables**:
  - `NODE_ENV`: `production`
  - `DATABASE_URL`: رابط اتصال PostgreSQL (مثل Neon أو Render Postgres) مع `sslmode=require`
  - `REDIS_URL`: رابط اتصال Redis (مثل Upstash Redis `rediss://...`)
  - `JWT_SECRET`: مفتاح تشفير عشوائي آمن (32 حرف على الأقل)
  - `FRONTEND_URL`: رابط الواجهة الأمامية بعد نشرها (مثال: `https://madad-frontend.onrender.com`)

#### 2. نشر الواجهة الأمامية (Frontend Static Site)
- أنشئ **Static Site** جديد.
- **Root Directory**: `frontend`
- **Build Command**: `npm install && npm run build`
- **Publish Directory**: `dist`
- **Redirects/Rewrites**:
  - Type: `Rewrite`
  - Source: `/*`
  - Destination: `/index.html`
- **Environment Variables**:
  - `VITE_API_URL`: رابط خادم الـ Backend (مثال: `https://madad-backend.onrender.com`)

---

## 🔑 حسابات تجريبية مهيأة (Demo Accounts)

عند تشغيل التهيئة الأولية (`npm run seed` في مجلد `backend`):

| الحساب | البريد الإلكتروني | كلمة المرور | الدور |
|---|---|---|---|
| إدارة المنصة | `admin@madad.sd` | `Admin123!` | مدير النظام (Admin) |
| شركة الفنار | `fanar@madad.sd` | `Pass123!` | موزع أدوية (Distributor) |
| النيل الأزرق | `bluenile@madad.sd` | `Pass123!` | موزع أدوية (Distributor) |
| صيدلية يولاند | `yoland@madad.sd` | `Pass123!` | صيدلية (Pharmacy) |
| صيدلية د. رؤى | `roa@madad.sd` | `Pass123!` | صيدلية (Pharmacy) |

---

## 💻 التشغيل المحلي (Local Development)

### متطلبات:
- Node.js >= 18
- PostgreSQL
- Redis (اختياري، النظام يعمل بدونه)

### خطوات التشغيل:
```bash
# 1. تثبيت الحزم وتشغيل السيرفر
cd backend
npm install
cp .env.example .env # قم بتعديل القيم
npm run dev

# 2. تشغيل الواجهة
cd ../frontend
npm install
cp .env.example .env
npm run dev
```
