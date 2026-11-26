# Madad B2B (مدد) — Backend API

Production-grade **Modular Monolith** backend for **Madad B2B**, a pharmaceutical supply-chain and wholesale price-visibility platform built for pharmacies and licensed drug distributors in **Omdurman, Sudan**.

Designed for **business-critical financial accuracy** (integer-only SDG pricing, ACID transactions, optimistic concurrency control) and **low-bandwidth / unstable network resilience** (scoped versioned Redis caching with graceful PostgreSQL degradation and idempotent order submission).

---

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Database Design & ERD](#database-design--erd)
3. [Critical Runtime Flows (Sequence Diagrams)](#critical-runtime-flows-sequence-diagrams)
4. [Core Engineering Guarantees](#core-engineering-guarantees)
5. [Tech Stack & Project Structure](#tech-stack--project-structure)
6. [Getting Started](#getting-started)
7. [Seeded Demo Accounts](#seeded-demo-accounts-omdurman-dataset)
8. [API Reference](#api-reference)
9. [Standardized Error Format & Domain Codes](#standardized-error-format--domain-codes)
10. [Testing & Verification](#testing--verification)
11. [Phase 2 Extensibility & ERP / POS Integration](#phase-2-extensibility--erp--pos-integration)

---

## Architecture Overview

Madad B2B follows a **Modular Monolith + In-Process Domain Event Bus** pattern, keeping domain boundaries cleanly separated while avoiding premature microservice overhead.

```mermaid
flowchart TB
    Client["React 19 RTL Frontend / API Clients"] --> MW["CORS · X-Request-Id · Redacting Morgan · JSON (1MB) · Auth/RBAC"]
    MW --> Routes["Domain Modules (auth, admin, permissions, catalog, distributor, watchlist, orders)"]
    Routes --> DB[("PostgreSQL (Neon)\nDrizzle ORM · ACID · Row Locks")]
    Routes --> Redis[("Redis (Upstash)\nScoped Versioned Cache")]
    Routes --> Bus["Typed Domain Event Bus\n(pricing.updated · permission.changed · order.*)"]
    Bus --> CacheInv["Async Cache Version Bumpers"]
    Sweeper["Background Order Expiry Sweeper\n(60s overlap-guarded, .unref())"] --> DB
    Sweeper --> Bus
```

---

## Database Design & ERD

The relational schema in `src/db/schema.ts` is managed via **Drizzle ORM** on **PostgreSQL (Neon)** with **10 normalized tables**, **8 PostgreSQL `ENUM` types**, strict foreign-key integrity, composite unique constraints, and integer-only monetary storage (`INT4` SDG).

### Entity-Relationship Diagram (ERD)

```mermaid
erDiagram
    organizations {
        uuid id PK
        text name
        enum type "PHARMACY | DISTRIBUTOR"
        text license_number UK
        enum verification_status "PENDING | VERIFIED | SUSPENDED"
        text region
        timestamptz verified_at
        enum sales_status "OPEN | PAUSED_REPRICING"
        int4 order_expiry_minutes
        timestamptz created_at
        timestamptz updated_at
    }

    users {
        uuid id PK
        uuid organization_id FK "nullable for ADMIN"
        text full_name
        text email UK
        text password_hash
        enum role "ADMIN | PHARMACY | DISTRIBUTOR"
        timestamptz created_at
        timestamptz updated_at
    }

    master_drugs {
        uuid id PK
        text trade_name
        text generic_name
        text strength
        text dosage_form
        text manufacturer
        boolean is_active
        timestamptz created_at
        timestamptz updated_at
    }

    distributor_listings {
        uuid id PK
        uuid distributor_id FK
        uuid drug_id FK
        int4 wholesale_price_sdg "Strict positive INT4"
        int4 price_version "Optimistic concurrency"
        boolean is_available
        timestamptz created_at
        timestamptz updated_at
    }

    distributor_drug_aliases {
        uuid id PK
        uuid distributor_id FK
        text raw_name
        text raw_name_normalized "UK with distributor_id"
        uuid master_drug_id FK
        timestamptz created_at
    }

    price_access_permissions {
        uuid id PK
        uuid pharmacy_id FK
        uuid distributor_id FK
        enum status "PENDING | APPROVED | REVOKED"
        timestamptz created_at
        timestamptz updated_at
    }

    price_change_logs {
        uuid id PK
        uuid listing_id FK
        uuid distributor_id FK
        uuid drug_id FK
        int4 old_price_sdg
        int4 new_price_sdg
        numeric percent_change "numeric(6,2) clamped <= 9999.99"
        timestamptz changed_at
    }

    pharmacy_watchlist {
        uuid id PK
        uuid pharmacy_id FK
        uuid drug_id FK
        enum pricing_policy "HIGHEST_AUTHORIZED | PREFERRED_DISTRIBUTOR"
        uuid preferred_distributor_id FK "nullable"
        numeric profit_margin_percent
        boolean auto_calc_enabled
        int4 last_acknowledged_wholesale_sdg
        int4 current_shelf_price_sdg
        timestamptz updated_at
    }

    orders {
        uuid id PK
        uuid pharmacy_id FK
        uuid distributor_id FK
        enum status "PENDING_CONFIRMATION | CONFIRMED | CANCELLED | EXPIRED_CANCELLED"
        int4 total_sdg "INT4 overflow-guarded"
        text idempotency_key UK
        timestamptz expires_at
        timestamptz created_at
        timestamptz updated_at
    }

    order_items {
        uuid id PK
        uuid order_id FK
        uuid listing_id FK
        uuid drug_id FK
        int4 quantity
        int4 unit_price_snapshot_sdg "Frozen at checkout"
        int4 line_total_sdg
    }

    organizations |o--o{ users : "employs"
    organizations ||--o{ distributor_listings : "lists"
    master_drugs ||--o{ distributor_listings : "referenced by"
    organizations ||--o{ distributor_drug_aliases : "defines"
    master_drugs ||--o{ distributor_drug_aliases : "mapped from"
    organizations ||--o{ price_access_permissions : "pharmacy requests"
    organizations ||--o{ price_access_permissions : "distributor grants"
    distributor_listings ||--o{ price_change_logs : "audits"
    organizations ||--o{ pharmacy_watchlist : "monitors"
    master_drugs ||--o{ pharmacy_watchlist : "tracked in"
    organizations ||--o{ orders : "places (pharmacy)"
    organizations ||--o{ orders : "fulfills (distributor)"
    orders ||--|{ order_items : "contains"
    distributor_listings ||--o{ order_items : "priced from"
    master_drugs ||--o{ order_items : "ordered drug"
```

### Schema Design Plan & Data Integrity Rules

| Table | Role in Domain | Key Constraints & Indexing Strategy |
| :--- | :--- | :--- |
| **`organizations`** | Licensed pharmacies and drug distributors | Unique `license_number`; `verification_status` checked live on every request; `verified_at` preserved across re-verifications; `sales_status` + `order_expiry_minutes` (`1..1440`) govern order intake. |
| **`users`** | Authenticated accounts (`ADMIN`, `PHARMACY`, `DISTRIBUTOR`) | Unique `email`; `password_hash` strictly omitted from all API responses; `organization_id` nullable for platform `ADMIN`. |
| **`master_drugs`** | Canonical pharmaceutical reference catalog | Indexed by `trade_name`, `generic_name`, and `manufacturer` for fast Arabic/English search and active-ingredient substitution. |
| **`distributor_listings`** | Distributor SKU inventory & wholesale pricing | Composite unique `(distributor_id, drug_id)`; integer `wholesale_price_sdg > 0`; monotonically increasing `price_version` for optimistic concurrency (`409`); availability toggles never mutate `price_version`. |
| **`distributor_drug_aliases`** | One-time distributor-specific naming memory | Composite unique `(distributor_id, raw_name_normalized)` enabling instant automatic matching on all subsequent CSV/Excel/WhatsApp bulk imports. |
| **`price_access_permissions`** | B2B wholesale confidentiality matrix | Composite unique `(pharmacy_id, distributor_id)` with state transitions (`NONE -> PENDING -> APPROVED <-> REVOKED -> PENDING`). Joined strictly on `APPROVED` for price exposure & watchlist queries. |
| **`price_change_logs`** | Immutable wholesale pricing audit trail | Records `old_price_sdg`, `new_price_sdg`, and clamped `percent_change` (`numeric(6,2)`, max `9999.99`) on single edits, bulk `%` repricing, and bulk imports; powers the pharmacy price-alerts radar. |
| **`pharmacy_watchlist`** | Pharmacy margin protection & shelf-price radar | Composite unique `(pharmacy_id, drug_id)`; enforces `preferred_distributor_id` when `pricing_policy = PREFERRED_DISTRIBUTOR` and `null` when `HIGHEST_AUTHORIZED`. |
| **`orders`** | Single-distributor B2B purchase orders | Unique `idempotency_key` (with cross-tenant isolation `409 IDEMPOTENCY_KEY_CONFLICT`), `expires_at` indexed for scoped lazy expiry and 60s background sweeper, and `INT4` overflow guards on `total_sdg`. |
| **`order_items`** | Frozen financial line-item snapshots | Stores `unit_price_snapshot_sdg` at checkout time so future distributor repricing never retroactively alters historical orders. |

**Safe Foreign-Key Teardown Order** (used in isolated E2E cleanup):
`order_items` → `orders` → `price_change_logs` → `distributor_listings` → `distributor_drug_aliases` → `price_access_permissions` → `pharmacy_watchlist` → `users` → `organizations`.

---

## Critical Runtime Flows (Sequence Diagrams)

### 1. Resilient ACID Checkout (`Idempotency-Key` + `409 PRICE_VERSION_CONFLICT`)

```mermaid
sequenceDiagram
    actor Pharmacy as Pharmacy Client
    participant API as Orders Service
    participant PG as PostgreSQL (ACID)

    Pharmacy->>API: POST /api/orders (Idempotency-Key, items + expectedPriceVersion)
    API->>PG: Check existing Idempotency-Key
    alt Key belongs to same pharmacy
        API-->>Pharmacy: 200 OK (idempotentReplay: true, original order)
    else Key belongs to another pharmacy
        API-->>Pharmacy: 409 IDEMPOTENCY_KEY_CONFLICT
    else New Idempotency-Key
        API->>PG: BEGIN TX · Check distributor OPEN + APPROVED permission
        API->>PG: SELECT ... FROM distributor_listings ORDER BY id ASC FOR UPDATE
        alt Any listing priceVersion != expectedPriceVersion
            API->>PG: ROLLBACK
            API-->>Pharmacy: 409 PRICE_VERSION_CONFLICT (details.conflicts with live prices)
        else All versions match & available
            API->>PG: INSERT orders + order_items (unitPriceSnapshotSdg) · COMMIT
            API-->>Pharmacy: 201 Created (PENDING_CONFIRMATION + expiresAt)
        end
    end
```

### 2. Dual-Version Scoped Redis Cache Isolation

```mermaid
sequenceDiagram
    actor Yoland as Pharmacy A (Yoland)
    actor Dist as Distributor (Blue Nile)
    participant API as Catalog & Permissions
    participant Redis as Upstash Redis
    participant PG as PostgreSQL (Neon)

    Yoland->>API: GET /api/catalog?sort=cheapest
    API->>Redis: Read catalogVersion (v0) + madad:perm:ver:A (pv0)
    API->>PG: Query with price masking + NULLS LAST
    API-->>Redis: Async cacheSet(v0:pv0:queryHash)
    API-->>Yoland: 200 OK (fromCache: false)

    Dist->>API: PATCH /api/permissions/:id (APPROVED for Pharmacy A)
    API->>PG: Update permission -> emit("permission.changed")
    API-->>Redis: INCR madad:perm:ver:A (pv0 -> pv1)

    Note over Redis: Pharmacy B's key (madad:perm:ver:B) remains untouched (100% cache hit preserved)

    Yoland->>API: GET /api/catalog?sort=cheapest
    API->>Redis: Miss on v0:pv1:queryHash -> Fetch fresh unmasked prices from PG
    API-->>Yoland: 200 OK (fromCache: false, unlocked SDG prices)
```

---

## Core Engineering Guarantees

| Concern | Implementation |
| :--- | :--- |
| **Monetary Precision** | All Sudanese Pound (`SDG`) amounts are stored strictly as PostgreSQL `INT4` integers (zero floating-point drift) with explicit `INT4` max (`2,147,483,647`) overflow guards on order totals. |
| **B2B Price Confidentiality** | Unauthorized wholesale prices are masked server-side (`wholesalePriceSdg: null`, `priceLocked: true`). `sort=cheapest` enforces anti-side-channel ordering (`NULLS LAST`) so locked prices can never be inferred from sort order. Watchlist queries use strict `INNER JOIN` on `APPROVED` permissions. |
| **Scoped Redis Cache Invalidation** | Catalog responses are cached in Upstash Redis using two version keys: global `catalogVersion` (bumped on pricing updates) and per-pharmacy `madad:perm:ver:<pharmacyId>` (bumped on permission changes), ensuring zero cross-tenant cache thrashing. Missing/unavailable Redis keys default to `0` and degrade gracefully to PostgreSQL (`keepAlive: 10000`, `commandTimeout: 4000`). |
| **Order Concurrency & Idempotency** | `POST /api/orders` requires an `Idempotency-Key` header (`1..128` chars), isolates keys per pharmacy (`409 IDEMPOTENCY_KEY_CONFLICT`), recovers from concurrent `23505` races outside `db.transaction` (avoiding PostgreSQL `25P02`), locks listings deterministically (`ORDER BY id ASC FOR UPDATE OF distributor_listings`), and checks `expectedPriceVersion` (`409 PRICE_VERSION_CONFLICT` with live conflict diffs). |
| **Commit-Before-Throw Expiry** | Confirming or cancelling an overdue `PENDING_CONFIRMATION` order commits `EXPIRED_CANCELLED` inside `db.transaction`, emits `order.statusChanged` post-commit, and then throws `409 ORDER_EXPIRED` — preventing rollback loss of expired states. Complemented by lazy scoped expiry on reads and a 60s background sweeper. |
| **Arabic Bulk Import & Alias Learning** | Supports CSV, Excel TSV, and WhatsApp pasted lists with UTF-8 BOM stripping, Arabic/Indic digit & currency normalization (`"١٢,٥٠٠ جنيه سوداني"` -> `12500`), Hamza/Alef normalization, last-row deduplication, partial-failure isolation, and one-time drug alias mapping (`distributor_drug_aliases`). |
| **Zero-PII Observability** | Every request receives a sanitized `X-Request-Id` (blocking CRLF injection), exposed via CORS and correlated in both `morgan` access logs and unexpected `500` error traces. Sensitive query params (`token`, `password`, `secret`, `key`, `auth`, `jwt`, `cookie`) are redacted to `[REDACTED]`; bodies, emails, tokens, and cookies are never logged. |

---

## Tech Stack & Project Structure

- **Runtime & Language:** Node.js `v24+`, TypeScript (strict), `tsx`
- **Web Framework:** Express (`express.json({ limit: "1mb" })`), `cors`, `cookie-parser`, `morgan`
- **Database & ORM:** PostgreSQL (Neon Serverless) + Drizzle ORM (`drizzle-orm`, `drizzle-kit`, `pg`) — 8 `pgEnum` types, 10 tables
- **Caching:** Upstash Redis (`ioredis` over TLS)
- **Validation:** Zod v4
- **Auth:** JWT (`httpOnly` `madad_token` cookie + `Authorization: Bearer` fallback) + live organization verification enforcement on every authenticated request

```text
backend/
├── drizzle.config.ts
├── package.json
├── tsconfig.json
├── scripts/
│   ├── smoke-live.ts                    # 7-step live smoke test against Neon + Upstash
│   └── test-e2e-live.ts                 # 10-suite self-cleaning comprehensive E2E test suite
└── src/
    ├── index.ts                         # Express app boot, middleware order, sweeper & graceful shutdown
    ├── db/
    │   ├── index.ts                     # PostgreSQL pool & pingDb()
    │   ├── schema.ts                    # 8 enums, 10 tables, constraints, indexes & relations
    │   └── seed.ts                      # Idempotent Omdurman B2B seed dataset
    ├── lib/
    │   ├── errors.ts                    # AppError, centralized errorHandler & notFoundHandler
    │   ├── events.ts                    # Typed Domain Event Bus & cache invalidation listeners
    │   ├── redis.ts                     # Upstash ioredis client, version helpers & graceful fallback
    │   └── text-normalizer.ts           # Arabic/English drug name & SDG price normalizer
    ├── middleware/
    │   ├── auth.middleware.ts           # requireAuth (live org status check) & requireRole
    │   └── request-logger.middleware.ts # X-Request-Id & redacting Morgan logger
    ├── routes/ & controllers/
    │   └── health.*                     # GET /api/health (DB + Redis liveness)
    ├── types/
    │   └── express.d.ts                 # Express.Request augmentation (user, requestId)
    └── modules/
        ├── auth/                        # Login, logout, session hydration (/api/auth)
        ├── admin/                       # Licensed org onboarding & live verify/suspend (/api/admin)
        ├── permissions/                 # B2B price-access request/approve/revoke (/api/permissions)
        ├── catalog/                     # Masked search, manufacturers, master drugs, distributors
        ├── distributor/                 # Status, listings, ACID bulk %, bulk import, aliases, logs
        │   └── parsers/                 # Extensible CatalogImportParser seam (CSV_TEXT -> Phase 2 PDF)
        ├── watchlist/                   # Price radar, margin calculator & alerts (/api/watchlist)
        └── orders/                      # ACID checkout, idempotency, concurrency & expiry (/api/orders)
```

---

## Getting Started

### 1. Prerequisites
- **Node.js 24+**
- **PostgreSQL** database (e.g., [Neon](https://neon.tech))
- **Redis** instance (e.g., [Upstash](https://upstash.com))

### 2. Environment Variables
Create `backend/.env` based on `.env.example`:

```env
PORT=4000
NODE_ENV=development
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=verify-full
REDIS_URL=rediss://default:password@host.upstash.io:6379
JWT_SECRET=replace-with-a-strong-random-secret
FRONTEND_URL=http://localhost:5173
```

### 3. Install, Push Schema & Seed

```bash
cd backend
npm install
npm run db:push
npm run seed
```

### 4. Run the Server

```bash
# Development (watch mode)
npm run dev

# Production build & run
npm run build
node dist/index.js
```

Verify the server is healthy:

```bash
curl http://localhost:4000/api/health
```

---

## Seeded Demo Accounts (Omdurman Dataset)

Running `npm run seed` is idempotent and provisions the following accounts:

| Role | Organization | Status | Email | Password | Demo Notes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ADMIN` | إدارة مدد | — | `admin@madad.sd` | `Admin123!` | Manages org onboarding & verification |
| `PHARMACY` | صيدلية يولاند | `VERIFIED` | `yoland@madad.sd` | `Pass123!` | Approved with Fanar, locked with Blue Nile, seeded watchlist alerts |
| `PHARMACY` | صيدلية د. رؤى | `VERIFIED` | `roa@madad.sd` | `Pass123!` | Secondary verified pharmacy (cross-tenant isolation) |
| `PHARMACY` | صيدلية الأمل الجديدة | `PENDING` | `amal@madad.sd` | `Pass123!` | Blocked at login with `403 ORG_NOT_VERIFIED` until approved by Admin |
| `DISTRIBUTOR` | شركة الفنار للأدوية | `VERIFIED` | `fanar@madad.sd` | `Pass123!` | Open distributor with active seeded catalog |
| `DISTRIBUTOR` | شركة النيل الأزرق للدواء | `VERIFIED` | `bluenile@madad.sd` | `Pass123!` | Open distributor (prices locked for Yoland until approved) |

---

## API Reference

All endpoints accept and return JSON. Authenticated routes accept either the `madad_token` `httpOnly` cookie or `Authorization: Bearer <token>`.

### System & Health
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/ping` | Public | Lightweight service ping |
| `GET` | `/api/health` | Public | Verifies PostgreSQL and Redis connectivity (`200` / `503`) |

### Authentication (`/api/auth`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/login` | Public | Authenticates user, sets `madad_token` cookie, returns `{ token, user, organization }`. Blocks non-verified orgs (`403 ORG_NOT_VERIFIED`). |
| `POST` | `/api/auth/logout` | Public | Clears `madad_token` cookie |
| `GET` | `/api/auth/me` | Any Auth | Returns current user & live organization state |

### Admin Portal (`/api/admin`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/admin/organizations` | `ADMIN` | List organizations with `primaryUser` (optional `?status=&type=`) |
| `POST` | `/api/admin/organizations` | `ADMIN` | Onboard a licensed Pharmacy/Distributor + initial account |
| `PATCH` | `/api/admin/organizations/:id/verify` | `ADMIN` | Update `{ verificationStatus: "PENDING" \| "VERIFIED" \| "SUSPENDED" }` (preserves `verifiedAt`; `SUSPENDED` immediately revokes active JWTs) |

### Price-Access Permissions (`/api/permissions`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/permissions/request` | `PHARMACY` | Request price visibility for `{ distributorId }` (idempotent; supports `REVOKED -> PENDING`) |
| `GET` | `/api/permissions` | `DISTRIBUTOR` | List incoming pharmacy permission requests (optional `?status=`) |
| `PATCH` | `/api/permissions/:id` | `DISTRIBUTOR` | Approve or revoke (`{ status: "APPROVED" \| "REVOKED" }`); bumps scoped Redis key |

### Catalog & Distributors Directory (`/api/catalog`, `/api/distributors`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/catalog` | `PHARMACY` | Unified drug search (`?q=&manufacturer=&distributorId=&availableOnly=&sort=latest\|cheapest&page=&limit=`) with server-side price masking & Redis caching |
| `GET` | `/api/catalog/manufacturers` | `PHARMACY`, `DISTRIBUTOR` | Distinct active manufacturers list |
| `GET` | `/api/catalog/master-drugs` | `PHARMACY`, `DISTRIBUTOR` | Search reference master drug catalog (`?q=&manufacturer=`) |
| `GET` | `/api/distributors` | `PHARMACY` | Verified distributors with active listing counts & permission status |
| `GET` | `/api/distributors/:id` | `PHARMACY` | Single distributor profile and masked/unmasked listings |

### Distributor Operations (`/api/distributor`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `PATCH` | `/api/distributor/status` | `DISTRIBUTOR` | Toggle `salesStatus` (`OPEN` / `PAUSED_REPRICING`) and/or `orderExpiryMinutes` (`1..1440`) |
| `GET` | `/api/distributor/listings` | `DISTRIBUTOR` | List distributor's own listings (`?q=&manufacturer=&availableOnly=`) |
| `POST` | `/api/distributor/listings` | `DISTRIBUTOR` | Add a master drug listing (`409` on duplicate) |
| `PATCH` | `/api/distributor/listings/:id` | `DISTRIBUTOR` | Update `wholesalePriceSdg` (increments `priceVersion` & logs change) and/or `isAvailable` |
| `POST` | `/api/distributor/pricing/bulk-percent` | `DISTRIBUTOR` | ACID batch percentage repricing by `manufacturer` (`-90..500`, `!== 0`) + global cache version bump |
| `POST` | `/api/distributor/listings/bulk-import` | `DISTRIBUTOR` | Parse CSV/TSV/WhatsApp text (`{ format: "CSV_TEXT", text }`) with Arabic normalization & partial-failure report |
| `GET` | `/api/distributor/aliases` | `DISTRIBUTOR` | List saved custom name -> master drug aliases |
| `POST` | `/api/distributor/aliases` | `DISTRIBUTOR` | Save one-time alias mapping and optionally upsert listing price in the same request |
| `GET` | `/api/distributor/price-logs` | `DISTRIBUTOR` | Price modification audit log (`?limit=`) |
| `GET` | `/api/distributor/new-pharmacies` | `DISTRIBUTOR` | Newly verified pharmacies directory (`?region=`) |

### Pharmacy Watchlist & Price Radar (`/api/watchlist`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/watchlist` | `PHARMACY` | Enriched watchlist sorted by unseen price increases first (`{ items, alertsCount }`) |
| `GET` | `/api/watchlist/price-alerts` | `PHARMACY` | Recent price-change feed strictly from `APPROVED` distributors (`?limit=&watchedOnly=`) |
| `POST` | `/api/watchlist` | `PHARMACY` | Track a drug with `pricingPolicy` (`HIGHEST_AUTHORIZED` / `PREFERRED_DISTRIBUTOR`) & `profitMarginPercent` |
| `PATCH` | `/api/watchlist/:id` | `PHARMACY` | Update policy, margin, auto-calc, or manual shelf price |
| `POST` | `/api/watchlist/:id/acknowledge` | `PHARMACY` | Acknowledge current wholesale price and apply suggested or `customShelfPriceSdg` |
| `DELETE` | `/api/watchlist/:id` | `PHARMACY` | Remove drug from watchlist |

### B2B Orders (`/api/orders`)
| Method | Endpoint | Auth | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/orders` | `PHARMACY` | Create single-distributor order inside an ACID transaction. **Requires `Idempotency-Key` header.** Returns `201` on creation or `200` (`idempotentReplay: true`) on same-pharmacy replay. |
| `GET` | `/api/orders` | `PHARMACY`, `DISTRIBUTOR` | List hydrated orders (`?status=`) after running scoped lazy expiration |
| `PATCH` | `/api/orders/:id/confirm` | `DISTRIBUTOR` | Confirm pending order (or Commit-Before-Throw `409 ORDER_EXPIRED` if overdue) |
| `PATCH` | `/api/orders/:id/cancel` | `PHARMACY`, `DISTRIBUTOR` | Cancel pending order (or Commit-Before-Throw `409 ORDER_EXPIRED` if overdue) |

---

## Standardized Error Format & Domain Codes

All errors return a consistent envelope with `X-Request-Id` in response headers:

```json
{
  "error": {
    "code": "PRICE_VERSION_CONFLICT",
    "message": "تغيرت أسعار بعض الأصناف منذ آخر تحديث؛ يرجى مراجعة الأسعار الجديدة",
    "details": {
      "conflicts": [
        {
          "listingId": "...",
          "tradeName": "Augmentin",
          "expectedPriceVersion": 1,
          "currentPriceVersion": 2,
          "currentWholesalePriceSdg": 22500
        }
      ]
    }
  }
}
```

Key domain error codes:
- **`400`**: `VALIDATION_ERROR`, `MISSING_IDEMPOTENCY_KEY`, `INVALID_LISTING`, `NO_AUTHORIZED_PRICE`, `INVALID_JSON`
- **`401`**: `UNAUTHORIZED`, `INVALID_CREDENTIALS`
- **`403`**: `ORG_NOT_VERIFIED`, `PRICE_ACCESS_REQUIRED`, `FORBIDDEN`
- **`404`**: `NOT_FOUND`
- **`409`**: `CONFLICT`, `DISTRIBUTOR_PAUSED`, `ITEM_UNAVAILABLE`, `PRICE_VERSION_CONFLICT`, `IDEMPOTENCY_KEY_CONFLICT`, `ORDER_EXPIRED`, `INVALID_ORDER_STATE`

---

## Testing & Verification

Ensure the server is running (`npm run dev`) with live Neon + Upstash credentials configured in `.env`.

### 1. Live Smoke Test (7 Steps)
Runs quick end-to-end checks against the seeded dataset and restores distributor status in `finally`:
```bash
npm run smoke:live
```

### 2. Comprehensive Self-Cleaning E2E Suite (10 Suites)
Provisions isolated temporary test organizations via Admin API, verifies all critical domains (Health, Auth/Cookies/RBAC, Admin Live Suspension, Listings/Clamping/IDOR, Bulk Import/Aliases, Cross-Tenant Redis Cache Isolation, ACID Bulk %, Watchlist Radar, Full Orders Lifecycle including DB-backdated **Commit-Before-Throw** Expiry), and deterministically deletes all temporary test rows in `finally` without polluting seeded demo data:
```bash
npm run test:e2e
```

To target a deployed environment:
```bash
API_URL=[https://your-backend-url.com](https://your-backend-url.com) npm run smoke:live
```

---

## Phase 2 Extensibility & ERP / POS Integration

The backend is intentionally structured with clean **architectural seams** so Phase 2 enterprise capabilities plug in without rewriting core domains:

- **Distributor ERP & Warehouse Sync (Odoo / SAP / Local Accounting Systems):**
  - Inbound stock & wholesale price updates connect cleanly via signed webhook adapters feeding the existing transactional listing-update and `distributor_drug_aliases` services (automatically emitting `pricing.updated` and invalidating Redis).
  - Outbound confirmed orders (`order.statusChanged -> CONFIRMED`) dispatch directly from `eventBus` to distributor ERP invoicing/dispatch queues.
- **Pharmacy POS & Shelf-Price Synchronization:**
  - Approved shelf-price acknowledgements from `/api/watchlist/:id/acknowledge` provide a clean integration seam to push updated retail SDG prices directly to pharmacy POS systems.
- **AI / PDF & Excel Catalog Parsers:** Implement the `CatalogImportParser` interface under `src/modules/distributor/parsers/` alongside `CSV_TEXT` to ingest photographed or PDF distributor price lists.
- **Real-Time WebSockets & Push Notifications:** Subscribe a tenant-scoped socket gateway directly to `eventBus` (`pricing.updated`, `permission.changed`, `order.created`, `order.statusChanged`).
- **Patient Availability Layer (B2C):** Add an independent module under `src/modules/` strictly isolated from confidential B2B wholesale pricing tables.