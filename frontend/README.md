# Madad B2B (مدد) — Frontend Web Application

Arabic RTL (`dir="rtl"`) B2B pharmaceutical procurement and wholesale price-visibility SPA built for **Madad B2B (مدد)** in **Omdurman, Sudan**. Designed for licensed **Pharmacies**, **Drug Distributors**, and **Platform Admins**, the application connects directly to the Madad B2B Express API without heavy client dependencies.

Built in **plain JavaScript (`.jsx` / `.js` — zero TypeScript)** with React + Vite, Tailwind CSS v4 + DaisyUI v5, native `fetch` (zero `axios`), and resilience patterns tailored for low-bandwidth and unstable WAN environments.

---

## Tech Stack

| Technology | Version (`package.json`) | Purpose |
| :--- | :--- | :--- |
| **React** | `^19.3.1` (`react`, `react-dom`) | Component UI, Hooks, Context state (`Auth`, `Toast`, `PharmacyCart`) |
| **Vite** | `^8.3.8` (`@vitejs/plugin-react` `^6.3.0`) | Fast ES module dev server and lightweight production bundler |
| **Tailwind CSS** | `^4.3.5` (`@tailwindcss/vite` `^4.3.5`) | Utility-first styling with CSS-first configuration |
| **DaisyUI** | `^5.8.2` | UI component library configured with `@plugin "daisyui" { themes: emerald --default, light; }` |
| **React Router** | `^7.18.7` (`react-router-dom`) | Client-side routing, `ProtectedRoute` role guards, nested portal layouts |
| **Lucide React** | `^1.81.0` (`lucide-react`) | Crisp SVG iconography |
| **Cairo Font & Native `fetch`** | Google Fonts (`400, 600, 700, 800`) + Browser `fetch` | Arabic RTL typography with local fallbacks (`'Cairo', 'Segoe UI', Tahoma, sans-serif`) and zero third-party HTTP libraries |

---

## Key Frontend Engineering & UX Highlights

- **Arabic RTL & Medical Enterprise UI:**
  - Root document configured as `<html lang="ar" dir="rtl" data-theme="emerald">` in `index.html`, pairing DaisyUI's `emerald` medical palette with calm slate surfaces, brand visual assets (`/images/madad-logo.svg`, `/images/pharma-supply.webp`), and `@media (prefers-reduced-motion: reduce)` support.
  - Strictly enforces Western Latin digits (`numberingSystem: "latn"`) across `formatSdg` (`12,500 ج.س`), `formatPercent` (`+10%`), and `formatDateTime` in `src/lib/format.js` for consistent pharmaceutical price readability.
- **Resilient Native `fetch` Client (`src/lib/api.js`):**
  - Sends `credentials: "include"` (`madad_token` `httpOnly` cookie) **and** attaches `Authorization: Bearer <token>` from `localStorage` (`madad_auth_token`) when available.
  - Attaches `Content-Type: application/json` **only** when `body !== undefined`, avoiding unnecessary CORS preflight (`OPTIONS`) requests on `GET` queries.
  - Preserves `AbortError` untouched so `AbortController` cancellations never trigger false error alerts, normalizes network drops into `ApiError` (`status: 0`, `code: "NETWORK_ERROR"`), and captures the `X-Request-Id` response correlation header.
  - `AuthContext` (`src/context/AuthContext.jsx`) hydrates `/api/auth/me` on mount and clears stored credentials **only** on explicit `401`/`403` auth/verification rejections — preserving sessions across transient network outages.
- **Offline & Low-Bandwidth Resilience:**
  - `CatalogPage` cancels superseded searches via `AbortController` with `300ms` input debouncing and persists successful catalog responses per pharmacy + query in `localStorage` via `src/lib/catalogCache.js` (`saveCatalogSnapshot` / `loadCatalogSnapshot`).
  - When a `NETWORK_ERROR` occurs, `CatalogPage` falls back to the last cached snapshot under a clear amber offline banner (`وضع عدم الاتصال`) and disables mutating order/permission actions while offline.
- **B2B Checkout Safety:**
  - `PharmacyCartProvider` (mounted with `key={organization?.id || "anon"}` so switching demo accounts isolates cart state) enforces single-distributor orders with a `ConfirmModal` switch guard.
  - Synchronous `idempotencyKeyRef` tracking in `PharmacyCartContext` reuses the same `Idempotency-Key` UUID across transient network retries while resetting on any cart mutation.
  - `PriceConflictModal` intercepts `409 PRICE_VERSION_CONFLICT`, renders a line-by-line old-vs-new price diff table, and synchronously applies updated `priceVersion` / `wholesalePriceSdg` values (`applyPriceConflicts`) before resubmitting.
- **Role-Based Access & Demo Ergonomics:**
  - `ProtectedRoute` enforces `PHARMACY`, `DISTRIBUTOR`, and `ADMIN` boundaries and routes users via `getRoleHomePath(role)`.
  - `DashboardLayout` and `PublicLayout` automatically close mobile drawers/dropdowns on navigation.
  - `/login` includes one-click Demo Quick-Login cards for all 6 seeded accounts with in-flight disabled guards to prevent double submissions.

---

## Project Structure

```text
frontend/
├── .env.example                                  # VITE_API_URL template
├── index.html                                    # RTL Arabic entry (Cairo font, data-theme="emerald")
├── package.json
├── vite.config.js                                # Vite + React + @tailwindcss/vite
├── public/
│   └── images/
│       ├── madad-logo.svg                        # Brand vector logo
│       └── pharma-supply.webp                    # Hero & footer backdrop illustration
└── src/
    ├── main.jsx                                  # React root mount
    ├── App.jsx                                   # BrowserRouter, ProtectedRoute, portals & 404 page
    ├── index.css                                 # Tailwind v4, DaisyUI v5 emerald theme & layout styles
    ├── lib/
    │   ├── api.js                                # apiFetch, ApiError & madad_auth_token storage helpers
    │   ├── catalogCache.js                       # localStorage catalog snapshot save/load helpers
    │   ├── constants.js                          # Arabic status badge maps, getRoleHomePath & DEMO_ACCOUNTS
    │   └── format.js                             # formatSdg, formatPercent, relative/datetime & countdown helpers
    ├── context/
    │   ├── AuthContext.jsx                       # Session hydration (/api/auth/me), login, logout, org state
    │   └── ToastContext.jsx                      # Bottom-end DaisyUI toast queue with auto-dismiss
    ├── components/
    │   ├── layout/
    │   │   ├── PublicLayout.jsx                  # Sticky public navbar, mobile dropdown & Footer wrapper
    │   │   ├── DashboardLayout.jsx               # Responsive role sidebar drawer, org header & logout
    │   │   └── Footer.jsx                        # B2B compliance footer & quick links
    │   └── ui/
    │       ├── StatusBadge.jsx                   # Localized DaisyUI status badge mapper
    │       ├── CountdownTimer.jsx                # Live 1s order-expiry countdown (< 10m urgent state)
    │       ├── EmptyState.jsx                    # Loading, empty & error state card
    │       └── ConfirmModal.jsx                  # Native <dialog> confirmation modal
    └── features/
        ├── public/
        │   ├── HomePage.jsx                      # Landing hero, value cards & 3-step B2B workflow
        │   ├── AboutPage.jsx                     # Omdurman mission, MVP features & Phase 2 roadmap
        │   ├── ContactPage.jsx                   # Closed B2B onboarding guide & client-side request form
        │   └── TermsPolicyPage.jsx               # Tabbed terms of service & wholesale privacy policy
        ├── auth/
        │   └── LoginPage.jsx                     # Credential form, 403 gate alert & 6 quick-demo buttons
        ├── pharmacy/
        │   ├── pharmacyApi.js                    # Pharmacy catalog, permissions, watchlist & orders API calls
        │   ├── PharmacyCartContext.jsx           # Single-distributor cart state & Idempotency-Key management
        │   ├── CartDrawer.jsx                    # Slide-over order drawer handling 409 conflict/pause/stock errors
        │   ├── PriceConflictModal.jsx            # 409 PRICE_VERSION_CONFLICT diff comparison & retry modal
        │   ├── CatalogPage.jsx                   # Unified search, price masking, offline snapshots & radar quick-add
        │   ├── WatchlistPage.jsx                 # Price radar, margin calculator, alerts feed & shelf acknowledge
        │   ├── OrdersPage.jsx                    # Order history, live expiry countdowns & safe cancellation
        │   ├── DistributorsPage.jsx              # Verified distributors directory & price-access requests
        │   └── DistributorDetailPage.jsx         # Single distributor profile & masked/unmasked listings
        ├── distributor/
        │   ├── distributorApi.js                 # Distributor status, listings, bulk-percent, import, aliases & orders API
        │   ├── BulkPricingCard.jsx               # ACID manufacturer percentage repricing panel
        │   ├── ListingsPage.jsx                  # Sales status/expiry bar, bulk repricing & inline price/stock CRUD
        │   ├── ImportPage.jsx                    # CSV/TSV/WhatsApp bulk importer, demo sample & one-time Alias mapper
        │   ├── OrdersPage.jsx                    # Incoming orders confirm/cancel & 409 ORDER_EXPIRED recovery
        │   └── PermissionsPage.jsx               # Pending/approved/revoked requests & newly verified pharmacies
        └── admin/
            ├── adminApi.js                       # Admin organizations list, onboard & verify API wrappers
            ├── CreateOrgModal.jsx                # Atomic organization + initial user onboarding dialog
            └── OrganizationsPage.jsx             # Stats cards, status sorting/filtering & live verify/suspend actions
```

---

## Getting Started (Installation & Running)

### 1. Prerequisites

- **Node.js `v24+`** (or active LTS) and `npm`
- Running **Madad B2B Backend API** (default `http://localhost:4000`; see `../backend/README.md`)

### 2. Environment Setup

Create `frontend/.env` from `.env.example`:

```bash
cp .env.example .env
```

Default configuration:

```env
VITE_API_URL=http://localhost:4000
```

### 3. Install & Run Development Server

```bash
cd frontend
npm install
npm run dev
```

> [!IMPORTANT]
> **If `npm run dev` does not open or is unreachable in your browser** (for example inside **WSL2**, **Docker/containers**, **VMs**, or when accessing from another device on your local network), start Vite bound to all network interfaces:
>
> ```bash
> npm run dev -- --host 0.0.0.0
> ```

### 4. Production Build & Preview

```bash
# Build static production bundle into dist/
npm run build

# Preview the production build locally
npm run preview
```

---

## Application Routes & Role Portals

### Public Pages (`PublicLayout`)

| Route | Component | Description |
| :--- | :--- | :--- |
| `/` | `HomePage` | Hero value proposition, reliability highlights & 3-step B2B workflow |
| `/about` | `AboutPage` | Omdurman supply-chain mission, MVP scope & Phase 2 roadmap |
| `/contact` | `ContactPage` | License-verification onboarding steps & client-side join request form |
| `/terms` | `TermsPolicyPage` | Tabbed Terms of Use & Wholesale Price Confidentiality Policy |
| `/login` | `LoginPage` | Login form & one-click Demo Accounts selector (auto-redirects authenticated users) |

### Pharmacy Portal (`ProtectedRoute` -> `PHARMACY`)

| Route | Component | Description |
| :--- | :--- | :--- |
| `/pharmacy/catalog` | `CatalogPage` | Debounced catalog search, price masking, offline snapshots, radar watch & add-to-cart |
| `/pharmacy/watchlist` | `WatchlistPage` | Price radar, shelf margin calculator, alert badges, acknowledge & price-alerts log |
| `/pharmacy/orders` | `OrdersPage` | Status-filtered orders with price snapshots, live countdown timers & cancellation |
| `/pharmacy/distributors` | `DistributorsPage` | Verified distributors directory & `POST /api/permissions/request` triggers |
| `/pharmacy/distributors/:id` | `DistributorDetailPage` | Distributor profile, permission state & filterable drug listings |

*(Visiting `/pharmacy` redirects automatically to `/pharmacy/catalog`.)*

### Distributor Portal (`ProtectedRoute` -> `DISTRIBUTOR`)

| Route | Component | Description |
| :--- | :--- | :--- |
| `/distributor/listings` | `ListingsPage` | `OPEN` / `PAUSED_REPRICING` switch, expiry window, `BulkPricingCard` & listings CRUD |
| `/distributor/import` | `ImportPage` | CSV/Excel/WhatsApp bulk import, one-time Alias mapping & price audit logs |
| `/distributor/orders` | `OrdersPage` | Incoming orders confirmation, cancellation & automatic `409 ORDER_EXPIRED` sync |
| `/distributor/permissions` | `PermissionsPage` | Pharmacy price-access approval/revocation & newly verified pharmacies directory |

*(Visiting `/distributor` redirects automatically to `/distributor/listings`.)*

### Admin Portal (`ProtectedRoute` -> `ADMIN`)

| Route | Component | Description |
| :--- | :--- | :--- |
| `/admin/organizations` | `OrganizationsPage` | Summary stat cards, `CreateOrgModal` onboarding & live `VERIFIED` / `SUSPENDED` / `PENDING` controls |

*(Visiting `/admin` redirects automatically to `/admin/organizations`. Unmatched paths render a clean `404` page with a return link to `/`.)*

---

## Seeded Demo Accounts

All 6 seeded accounts from `src/lib/constants.js` (`DEMO_ACCOUNTS`) are available as one-click demo buttons on `/login`:

| Role | Organization | Status | Email | Password | Demo Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `PHARMACY` | صيدلية يولاند | `VERIFIED` | `yoland@madad.sd` | `Pass123!` | Verified pharmacy with approved Fanar prices and seeded watchlist alerts |
| `PHARMACY` | صيدلية د. رؤى | `VERIFIED` | `roa@madad.sd` | `Pass123!` | Secondary verified pharmacy for requesting distributor permissions and ordering |
| `DISTRIBUTOR` | شركة الفنار للتوزيع الدوائي | `VERIFIED` | `fanar@madad.sd` | `Pass123!` | Active distributor with seeded listings, incoming orders & permission requests |
| `DISTRIBUTOR` | شركة النيل الأزرق للإمداد الدوائي | `VERIFIED` | `bluenile@madad.sd` | `Pass123!` | Verified distributor for managing listings, bulk imports & percentage pricing |
| `ADMIN` | إدارة منصة مدد | `VERIFIED` | `admin@madad.sd` | `Admin123!` | Platform admin to onboard organizations, verify pending accounts & suspend sessions |
| `PHARMACY` | صيدلية الأمل الجديدة | `PENDING` | `amal@madad.sd` | `Pass123!` | Pending org used to verify the `403 ORG_NOT_VERIFIED` login gate until Admin approves |

---

## Troubleshooting

1. **App not reachable at `http://localhost:5173`:**
   - If using WSL2, Docker, a remote VM, or LAN access, Vite binds only to loopback by default. Restart with `npm run dev -- --host 0.0.0.0`.
2. **CORS errors or cookie authentication failures:**
   - Ensure `backend/.env` sets `FRONTEND_URL=http://localhost:5173` matching the exact protocol, host, and port in your browser address bar (`credentials: "include"` requires an explicit matching `origin`).
3. **API connection / `NETWORK_ERROR` banner:**
   - Verify the backend server is running and reachable at the URL configured in `frontend/.env` (`VITE_API_URL=http://localhost:4000`), and test `curl http://localhost:4000/api/health`.
4. **Stale cached catalog or auth token in browser:**
   - Open browser DevTools -> Application -> Local Storage for your origin, clear `madad_auth_token` and `madad_catalog_snapshot:*` keys, and reload the page.
