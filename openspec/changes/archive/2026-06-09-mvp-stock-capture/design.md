# Design: mvp-stock-capture

> **Source of truth**: `proposal.md` + the 7 delta specs. This document RESOLVES the open questions the specs surfaced and CONCRETIZES the architecture. It does NOT add requirements.

## 1. Technical Approach

A serial, SQLite-as-queue sync engine pushes per-product batches through a two-step media + product upload to WooCommerce REST v3. Idempotency is enforced by a stable UUIDv4 `local_id` carried in product meta and pre-checked via `GET /wc/v3/products?meta_key=local_id`. Local DB is authoritative; the remote is reconciled in by setting `wc_product_id` on success. All failures are classified once at the boundary of `error-presentation` and rendered from a typed catalog — no raw text ever reaches a screen. Auth lives in `expo-secure-store`, validated against the live store on save.

The layering is strict: `app/` (Expo Router screens) → `src/stores/` (Zustand) → `src/services/` (domain logic) → `src/db/` + `src/infra/` (raw SQLite + `fetch`). The presenter (`error-presentation`) is the only module that owns user-facing Spanish strings. All other modules emit classification keys.

## 2. Architecture Decisions

### Decision: Error classifier lives in `error-presentation`, sync layer passes RAW errors

**Choice**: Sync worker throws/catches raw `Error` objects (with `.status` for HTTP) and passes them to `presentError(rawError)`. The presenter is the SOLE owner of classification.
**Alternatives**: Sync pre-classifies and emits keys — rejected because (a) the catalog and the classifier would live in different files, drifting over time; (b) a 401 from onboarding vs. from sync would risk different keys; (c) the spec explicitly says "presenter owns classification".
**Rationale**: Co-locating catalog + classifier guarantees the same key for the same raw failure regardless of where it surfaced. Resolves **Q7**.

### Decision: Backoff curve and per-run attempt cap

**Choice**: Curve = `1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s, 60s, 60s` (capped). Per-run cap = **5 attempts within a single worker invocation** for transient errors. After 5 transient failures the product is moved to `needs-attention` and the worker advances. 401/403/404-cap bypass the cap (handled by the auth-class path below).
**Rationale**: 5 × avg ~16s = ~80s of in-worker time, well under the 30s iOS background budget. Capping at 60s prevents pathological waits. Per-RUN (not per-lifetime) so a product can be retried again on next launch — aligns with "kill app mid-sync, relaunch, it picks up". Resolves **Q1**.

### Decision: `needs-attention` aggregation — single card with N

**Choice**: One card per distinct (classification key × set of stuck products). The card reads "**N productos no se pudieron subir — tocá para ver**" where N is a live count. Tapping it routes to a filtered review-queue list (filtered to `status = needs-attention`).
**Rationale**: Avoids "wall of error cards" if 30 products hit a store outage. Still surfaces the problem; still one tap away. Resolves **Q5**.

### Decision: Pause toggle is global

**Choice**: One `paused: boolean` in the `sync-config` store; persisted in SQLite (`app_config` table). No per-product pause.
**Rationale**: Per-product pause is a power-user feature that violates "one primary action per screen". The review queue already lets the user leave a product in `pending` (skipping it) by simply not tapping "Marcar como listo". Resolves **Q4**.

### Decision: Auto-sync default ON on Wi-Fi

**Choice**: ON by default. First launch writes `auto_sync_on_wifi = 1` to `app_config`. User can disable in settings.
**Rationale**: Friend is the only user; the proposal's intent is "it just works". A "no, sync is off" surprise on a poor connection is worse than an automatic sync on Wi-Fi. Resolves the sync-trigger open question.

### Decision: Persistent queue = `products` table; sweeper runs on every worker invocation AND on a 24h timer

**Choice**: The `products` table is the queue (no in-memory mirror). The orphan-media sweeper runs (a) at the END of every worker run, scanning for `media_uploads WHERE status='orphan' AND orphan_since < now - 5min`; (b) once per 24h on app foreground (cheap, ensures backlog drains even when no new uploads occur).
**Rationale**: Belt + suspenders for the most dangerous failure mode (uploaded media with no product). 5-min threshold prevents racing in-flight uploads (per the local-persistence spec). Resolves the woocommerce-sync open question about sweeper cadence.

### Decision: Catalog is a TypeScript `as const` object in `error-presentation.ts`

**Choice**: A single file exporting `ERROR_CATALOG: Record<ErrorKey, CatalogEntry>` typed via `as const`. The classifier lives in the same file as a pure function. Tests iterate the object directly.
**Rationale**: Simplest possible form; tree-shakable; one source of truth; works with the grep + structure tests the spec requires. Rejected JSON (no type-safety), rejected YAML (build step, no value at MVP scale).

### Decision: Idempotency uses pre-check + post-store, not just meta-only

**Choice**: Before every `POST /wc/v3/products`, the worker runs `GET /wc/v3/products?per_page=1&meta_key=local_id&meta_value=<uuid>`. If exactly one match, it stores that `wc_product_id` and short-circuits to `synced`. If zero, it proceeds with `POST`. The new product is created with `meta_data: [{key: "local_id", value: "<uuid>"}]`. Meta is also written into the new product's `meta_data` so future retries (even on a different device) can find it.
**Rationale**: This is the spec's idempotency rule, made concrete. UUIDv4 collision is practically impossible but the pre-check also handles "the network timed out AFTER the server processed the request" cleanly. Resolves the spec's open question on idempotency mechanics.

### Decision: Draft by default, explicit publish

**Choice**: Every product's `publish_on_sync` defaults to `0` (draft). The `POST /wc/v3/products` body sets `status: publish_on_sync ? "publish" : "draft"`. The user toggles per-product in the review screen. The store never receives a `publish` status without an explicit per-product user action.
**Rationale**: Spec rule; proposal principle. Resolves **Q6**.

### Decision: Catalog extended with the 5 spec-flagged missing keys

**Choice**: ADD the 5 missing keys as dedicated catalog entries (not parameterized through `datos-invalidos`):

| Key | When | Severity | Action |
|---|---|---|---|
| `camara-permiso-denegado` | `expo-camera` permission denied | blocking | `open-settings` |
| `almacenamiento-error` | SQLite migration / DB exception | blocking | `contact-support` |
| `imagen-faltante` | `product_images` row references missing file | error | `edit-product` |
| `precio-no-confirmado` | row state, not a failure | info (not error) | `edit-product` |
| `tienda-no-accesible` | URL resolves but 404 on WC endpoint | blocking | `retry` |

`datos-invalidos` is KEPT for field-level validation (`field` + `reason` params) — these are inline form errors, not cards. The two patterns are distinct surfaces and stay distinct in the catalog.
**Rationale**: Each of the 5 has a different recovery action. Collapsing them into `datos-invalidos` would force the UI to switch on `field`/`reason` to decide which action to render — exactly the kind of branching the presenter is supposed to hide. Resolves **Q2**.

### Decision: URL normalization prompts stay in the form, NOT in the catalog

**Choice**: The "La URL tiene que empezar con https" confirmation and the "Quitamos la ruta" hint are owned by the store-config screen, not the error catalog. The catalog covers **errors and blocked states**; UX prompts about user input are not errors.
**Rationale**: Keeps the catalog focused. Mixing UX prompts in would dilute the contract: "catalog entry = something went wrong or is blocked". Resolves **Q8**.

### Decision: Status pills in review-queue are a single presenter component, not 5 catalog entries

**Choice**: One `StatusPill({ state: ProductStatus })` component that maps the 5 states to plain-Spanish labels in a private lookup owned by the component. The wording lives in the component file, not the error catalog.
**Rationale**: Status pills are happy-path labels, not error states. They are stable UI vocabulary, not recoverable failures. Putting them in the catalog would conflate "no hay Wi-Fi" with "Subido" — both are not errors. Resolves **Q9**.

### Decision: Categories strategy — eager fetch on first capture-screen mount, stale-while-revalidate after

**Choice**: `GET /wc/v3/products/categories?per_page=100` runs the first time the capture screen mounts after onboarding. The list is cached in `store_categories` with `cached_at`. On subsequent capture-screen mounts, the cache is shown INSTANTLY (offline-safe) and a background refresh runs if `cached_at` is older than 24h. A "Cargando categorías..." indicator shows ONLY if the cache is empty AND the network fetch is in-flight. A "Las categorías pueden estar desactualizadas" hint shows if `cached_at` is older than 7 days (per local-persistence spec).
**Handling of deleted-on-store categories**: a category is removed from the cache ONLY when the user selects it AND the next sync attempt returns a 4xx referencing that `category_id` — at which point the product is flagged `needs-attention` with classification `datos-invalidos` `field=category`. We do NOT auto-prune categories on refresh (avoids races with in-flight captures).
**Rationale**: Best balance of offline-first, fresh-enough, and never-blocking-the-user. Resolves **Q3**.

### Decision: Progress indicator — sync screen primary, persistent banner on capture/queue when active

**Choice**: "Subiendo producto N de M..." is the SYNC SCREEN's primary line. A small persistent banner appears on `/capture` and `/queue` ONLY while the worker is active and the user is NOT on the sync screen. Tap banner = go to sync screen. No banner while paused or while no work is pending.
**Rationale**: Matches the proposal's "calm, deterministic" line and the sync-trigger spec, while still letting the user see "yes, things are happening" if they wander to a different screen. Resolves the sync-trigger open question on placement.

### Decision: Validation endpoint = `GET /wc/v3/system_status`

**Choice**: Validation calls `GET /wc/v3/system_status` with the candidate key/secret. 200 = valid. 401/403 = `credenciales-invalidas`. Network error = `sin-conexion`. 404 on this endpoint specifically = `tienda-no-accesible`.
**Rationale**: Cheaper than `products?per_page=1`; works for any WC store regardless of product count; returns 404 for non-WC URLs. Resolves store-config open question.

### Decision: No background periodic worker

**Choice**: The worker runs only on app foreground + on-launch + on-network-change (Wi-Fi detected). No OS-level background task. iOS doesn't permit long-running JS background tasks anyway, and a background-fetch battery cost is a non-feature for personal use.
**Rationale**: "Persistent queue = the DB" already gives us "it picks up where it left off" on next launch. Resolves the sync-trigger open question on background tasks.

## 3. Data Flow

```
┌─────────────┐   save()    ┌────────────┐
│ /capture UI │ ──────────► │ products   │  source of truth
└─────────────┘             │  (SQLite)  │
        ▲                   └─────┬──────┘
        │ review/edit              │ read ready/pending
┌───────┴────────┐                  ▼
│ /queue/[id] UI │         ┌──────────────────┐
└────────────────┘         │ sync-trigger.ts  │  auto-on-wifi / manual
                           │ (Zustand)        │  / launch
                           └────────┬─────────┘
                                    │ startWorker()
                                    ▼
                           ┌────────────────────┐
                           │ sync-worker.ts     │  serial, ~1 product/s
                           │ backoff: 1..60s    │  cap: 5 attempts/run
                           └────┬───────────────┘
                                │
        ┌───────────────────────┼────────────────────────┐
        ▼                       ▼                        ▼
 ┌─────────────┐         ┌──────────────┐         ┌───────────────┐
 │ idempotency │         │ media step   │         │ product step  │
 │ GET ?meta_  │ ──────► │ POST /wp/v2/ │ ──────► │ POST /wc/v3/  │
 │ key=local_  │         │ media        │         │ products      │
 │ id          │         │ (binary)     │         │ + meta_data   │
 └─────────────┘         └──────────────┘         └───────┬───────┘
                                                          │ ok
                                                          ▼
                                                  ┌───────────────┐
                                                  │ set wc_product│
                                                  │ _id, status = │
                                                  │ synced        │
                                                  └───────────────┘

On transient failure: 1..60s backoff, retry same step.
On cap reached: product.status = needs-attention, worker advances.
On auth failure (401/403): worker pauses the whole queue, emits
  credenciales-invalidas card (no further products attempted).
```

## 4. Folder Structure

```
EtiquetadorDeProductos/
├── app/                                  # Expo Router (file-based)
│   ├── _layout.tsx                       # First-launch routing
│   ├── onboarding.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx                   # Bottom tabs
│   │   ├── capture.tsx
│   │   ├── queue.tsx
│   │   ├── queue/[id].tsx                # Per-product review
│   │   ├── sync.tsx
│   │   └── settings.tsx
│   └── +not-found.tsx
├── src/
│   ├── db/
│   │   ├── index.ts                      # openDB(), PRAGMA WAL
│   │   ├── migrations.ts                 # versioned via user_version
│   │   ├── products.ts                   # CRUD prepared statements
│   │   ├── product-images.ts
│   │   ├── media-uploads.ts
│   │   ├── store-categories.ts
│   │   ├── sync-attempts.ts
│   │   └── app-config.ts
│   ├── infra/
│   │   ├── http-client.ts                # fetch wrapper, timeouts
│   │   ├── secure-store.ts               # expo-secure-store wrapper
│   │   ├── file-system.ts                # documents dir helpers
│   │   └── network.ts                    # expo-network wrapper
│   ├── services/
│   │   ├── credentials.ts                # validate-and-save
│   │   ├── woocommerce/
│   │   │   ├── client.ts                 # auth + base URL
│   │   │   ├── media.ts                  # POST /wp/v2/media
│   │   │   ├── products.ts               # POST /wc/v3/products + meta lookup
│   │   │   └── categories.ts             # GET /wc/v3/products/categories
│   │   ├── sync-worker.ts                # serial worker, backoff, cap
│   │   ├── orphan-media-sweeper.ts       # background cleanup
│   │   └── network-observer.ts           # Wi-Fi event subscription
│   ├── stores/
│   │   ├── capture-store.ts              # draft form state
│   │   ├── queue-store.ts                # list view state
│   │   ├── sync-store.ts                 # running/paused/pause toggle
│   │   ├── config-store.ts               # auto-sync, thresholds
│   │   └── error-store.ts                # presentError writes here
│   ├── domain/
│   │   ├── types.ts                      # Product, ProductStatus, Image, etc.
│   │   ├── status.ts                     # status state machine
│   │   └── backoff.ts                    # pure: attempt → ms
│   ├── ui/
│   │   ├── components/
│   │   │   ├── StatusPill.tsx            # presenter component
│   │   │   ├── NeedsAttentionCard.tsx    # presenter component
│   │   │   ├── ErrorBanner.tsx           # presenter component
│   │   │   ├── ProgressLine.tsx          # "Subiendo N de M..."
│   │   │   ├── PauseToggle.tsx
│   │   │   └── PriceConfirmGate.tsx
│   │   └── theme.ts                      # NativeWind tokens
│   └── error-presentation.ts              # catalog + classifier
├── __tests__/
│   ├── error-presentation.test.ts        # catalog structure + lint
│   ├── sync-worker.test.ts               # backoff curve, cap behavior
│   ├── idempotency.test.ts               # local_id round-trip
│   ├── orphan-sweeper.test.ts
│   └── components/                       # RNTL
├── scripts/
│   └── ci-error-grep.sh                  # forbidden pattern test
├── app.json
├── eas.json
├── .env.example
├── .gitignore
├── README.md
├── jest.config.js
├── tsconfig.json
├── tailwind.config.js                    # NativeWind v3
└── package.json
```

## 5. Module Contracts

### `db/index.ts`

```ts
export type DB = {
  exec(sql: string, params?: unknown[]): Promise<void>;
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  run(sql: string, params?: unknown[]): Promise<{ changes: number }>;
  transaction<T>(fn: (tx: DB) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};
export async function openDB(): Promise<DB>;
```

Owns: connection lifecycle, WAL enable, `PRAGMA user_version` reads/writes, migration runner. NEVER holds prepared-statement state outside a transaction.

### `db/migrations.ts`

```ts
export const TARGET_VERSION = 1;
export async function runMigrations(db: DB): Promise<void>;
```

Owns: the ordered list of migration steps. Each step is `(db) => sql[]`. Pure of all business logic; only schema. On failure → throws a typed `MigrationError`; the `_layout.tsx` launch sequence catches it and emits `almacenamiento-error`.

### `db/products.ts`

```ts
export function insertProduct(db: DB, p: NewProduct): Promise<void>;
export function updateProduct(db: DB, id: string, patch: Partial<Product>): Promise<void>;
export function getProduct(db: DB, id: string): Promise<Product | null>;
export function listProductsForSync(db: DB): Promise<Product[]>;
export function listProductsByStatus(db: DB, status: ProductStatus): Promise<Product[]>;
export function deleteProduct(db: DB, id: string): Promise<void>;
```

Owns: prepared-statement CRUD for `products`. `listProductsForSync` returns rows where `status IN ('ready', 'pending')` ordered by `created_at`. Does NOT touch `wc_product_id` (sync-worker owns that).

### `services/woocommerce/client.ts`

```ts
export type WCCredentials = { baseUrl: string; key: string; secret: string };
export function createWooClient(creds: WCCredentials): WooClient;
export type WooClient = {
  getProductByLocalId(localId: string): Promise<WCProduct | null>;
  uploadMedia(fileUri: string, filename: string): Promise<{ id: number }>;
  deleteMedia(mediaId: number): Promise<void>;
  createProduct(body: NewWCProductBody): Promise<WCProduct>;
  listCategories(): Promise<WCCategory[]>;
  validate(): Promise<{ ok: true } | { ok: false; reason: ValidationError }>;
};
```

Owns: HTTPS Basic auth header, base-URL canonicalization, per-request 30s timeout, 1 retry on connection-reset (NOT on HTTP error — that's the worker's job). All request methods throw `WooError` with `.status` and `.body`; the classifier in `error-presentation` is the only consumer of those fields.

### `services/sync-worker.ts`

```ts
export type WorkerEvent =
  | { kind: "started"; total: number }
  | { kind: "progress"; current: number; total: number; productId: string }
  | { kind: "retrying"; productId: string; attempt: number; delayMs: number }
  | { kind: "needs-attention"; productId: string; classification: ErrorKey }
  | { kind: "auth-blocked" }                 // 401/403: pause everything
  | { kind: "finished"; succeeded: number; failed: number };
export type Worker = { start(): Promise<void>; stop(): Promise<void> };
export function createSyncWorker(deps: SyncDeps): Worker;
```

Owns: serial iteration, backoff schedule (`1, 2, 4, 8, 16, 32, 60, 60, 60, 60`), per-product cap of 5 transient attempts per run, idempotency pre-check, the two-step upload, the post-upload status update, calling the orphan-media sweeper at end of run. Emits events — the Zustand `sync-store` subscribes.

### `services/orphan-media-sweeper.ts`

```ts
export type SweepResult = { deleted: number; failed: number; skipped: number };
export async function sweepOrphanMedia(db: DB, client: WooClient, opts?: {
  olderThanMs?: number;   // default 5 * 60 * 1000
  maxItems?: number;      // default 20
}): Promise<SweepResult>;
```

Owns: scanning `media_uploads WHERE status='orphan' AND orphan_since < now - olderThanMs`, deleting via `DELETE /wp/v2/media/<id>?force=true`, recording failures, throttling to ≤5 deletes/sec. Does NOT race with in-flight uploads (5-min floor).

### `services/credentials.ts`

```ts
export async function saveCredentials(c: WCCredentials): Promise<void>;
export async function loadCredentials(): Promise<WCCredentials | null>;
export async function clearCredentials(): Promise<void>;
export async function validateAndSave(c: WCCredentials): Promise<
  | { ok: true }
  | { ok: false; classification: ErrorKey }
>;
```

Owns: `expo-secure-store` keys, `validateAndSave` does `createWooClient(c).validate()` first and only persists on `ok: true`. Never logs key/secret.

### `error-presentation.ts`

```ts
export type ErrorKey =
  | "credenciales-invalidas"
  | "sin-conexion"
  | "servidor-no-disponible"
  | "limite-de-tasa"
  | "datos-invalidos"
  | "camara-permiso-denegado"
  | "almacenamiento-error"
  | "imagen-faltante"
  | "precio-no-confirmado"
  | "tienda-no-accesible"
  | "error-inesperado";

export type CatalogEntry = {
  title: string;
  message: string;
  severity: "info" | "warning" | "error" | "blocking";
  action?: { kind: "retry" } | { kind: "open-settings" }
         | { kind: "edit-product"; productId: string }
         | { kind: "contact-support" };
};

export const ERROR_CATALOG: Record<ErrorKey, CatalogEntry>;

export function classifyError(err: unknown): ErrorKey;
export function presentError(err: unknown | ErrorKey, params?: {
  field?: string; reason?: string; productId?: string;
}): CatalogEntry;
```

Owns: ALL user-facing Spanish strings, the classifier, and the lookup. Every other module calls `presentError(...)` — never inlines a string. The `__DEV__` console warns with the raw error + a generated `correlationId` (random 6-char base36) for field debugging.

### `stores/*`

Zustand stores follow the same pattern:

```ts
type SyncState = {
  status: "idle" | "running" | "paused" | "auth-blocked" | "needs-attention";
  progress: { current: number; total: number } | null;
  paused: boolean;
  pausedAt: number | null;
  blockedCount: number;     // for the needs-attention card
  setPaused: (p: boolean) => void;
  applyEvent: (e: WorkerEvent) => void;
};
```

Each store's initial state is loaded from `app_config` (persisted SQLite) on first import; subsequent updates write through to `app_config` so the pause state survives app kill (per sync-trigger spec). The `error-store` is the only one that holds catalog-entry-shaped data; UI components subscribe to it for banner/card rendering.

## 6. Data Model (SQLite, v1)

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE products (
  local_id            TEXT PRIMARY KEY,                -- UUIDv4
  name                TEXT NOT NULL,
  price               INTEGER NOT NULL CHECK (price > 0),
  category_id         INTEGER,                         -- nullable until store categories load
  category_name       TEXT,                            -- for display without re-fetch
  description         TEXT,
  status              TEXT NOT NULL                    -- enum-as-TEXT, see status.ts
                      CHECK (status IN ('pending','ready','syncing','synced','failed','needs-attention')),
  publish_on_sync     INTEGER NOT NULL DEFAULT 0,      -- 0=draft, 1=publish
  price_confirmed     INTEGER NOT NULL DEFAULT 0,      -- review-queue gate
  wc_product_id       INTEGER,                         -- set on success
  last_error_key      TEXT,                            -- ErrorKey or NULL
  last_attempt_at     INTEGER,                         -- epoch ms
  next_attempt_at     INTEGER,                         -- epoch ms (for backoff persistence)
  created_at          INTEGER NOT NULL,
  updated_at          INTEGER NOT NULL
);
CREATE INDEX idx_products_status    ON products(status);
CREATE INDEX idx_products_next      ON products(next_attempt_at)
  WHERE status IN ('pending','ready');

CREATE TABLE product_images (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  product_local_id    TEXT NOT NULL REFERENCES products(local_id) ON DELETE CASCADE,
  file_path           TEXT NOT NULL,                   -- absolute in documents dir
  position            INTEGER NOT NULL,                -- order in the strip
  sync_state          TEXT NOT NULL DEFAULT 'pending'  -- 'pending' | 'excluded' | 'missing'
                      CHECK (sync_state IN ('pending','excluded','missing')),
  created_at          INTEGER NOT NULL
);
CREATE INDEX idx_images_product ON product_images(product_local_id);

CREATE TABLE media_uploads (
  id                          INTEGER PRIMARY KEY AUTOINCREMENT,
  wc_media_id                 INTEGER NOT NULL UNIQUE,
  product_local_id            TEXT REFERENCES products(local_id) ON DELETE SET NULL,
  status                      TEXT NOT NULL
                                CHECK (status IN ('uploaded','attached','orphan')),
  orphan_since                INTEGER,
  uploaded_at                 INTEGER NOT NULL,
  attached_at                 INTEGER
);
CREATE INDEX idx_media_orphans ON media_uploads(status, orphan_since)
  WHERE status = 'orphan';

CREATE TABLE sync_attempts (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  product_local_id    TEXT NOT NULL REFERENCES products(local_id) ON DELETE CASCADE,
  attempted_at        INTEGER NOT NULL,
  error_class         TEXT NOT NULL                    -- 'transient' | 'auth' | 'validation' | 'unexpected'
                      CHECK (error_class IN ('transient','auth','validation','unexpected')),
  error_key           TEXT NOT NULL,                   -- ErrorKey
  http_status         INTEGER,
  attempt_in_run      INTEGER NOT NULL
);
CREATE INDEX idx_attempts_product ON sync_attempts(product_local_id, attempted_at DESC);

CREATE TABLE store_categories (
  wc_category_id      INTEGER PRIMARY KEY,
  name                TEXT NOT NULL,
  parent_id           INTEGER,
  cached_at           INTEGER NOT NULL
);

CREATE TABLE app_config (
  key                 TEXT PRIMARY KEY,
  value               TEXT NOT NULL
);
-- rows seeded on first launch:
--   'store_url'            (text, the canonical base url)
--   'auto_sync_on_wifi'    ('1' default, then user-editable)
--   'sync_paused'          ('0' default)
--   'sweeper_last_run'     (epoch ms, for the 24h cadence)
```

**Status state machine** (`domain/status.ts`):
`pending` → (user confirms price) → `ready` → (worker picks up) → `syncing` → (success) → `synced` | (cap reached) → `needs-attention`. From `needs-attention` → (user taps "Reintentar") → `pending`/`ready`. `synced` is terminal in MVP.

**Migrations**: only additive in v1 (`TARGET_VERSION = 1`). `runMigrations` is a list of `MigrationStep` functions; each opens a transaction, runs SQL, bumps `PRAGMA user_version`. A failed step throws `MigrationError`; the launcher surfaces `almacenamiento-error` and blocks new captures.

## 7. State Model

| Concern | Store | Persisted? | Boundary |
|---|---|---|---|
| Capture draft (current form) | `capture-store` | NO (in-memory only; reset on save) | UI-only |
| Review queue list | `queue-store` | NO (derived from `products` table) | Read-through: store loads from DB on mount, subscribes to a change-channel (custom event emitter on the DB module) for live updates |
| Sync status, pause toggle, progress, blocked count | `sync-store` | Pause toggle + `auto_sync_on_wifi` only, in `app_config` | Worker events flow in; UI subscribes |
| Credentials (key/secret/URL) | — (NOT a Zustand store) | `expo-secure-store` | Read on demand by `createWooClient` |
| Active errors / banners | `error-store` | NO (rebuilt on next surface event) | UI subscribes; `presentError` is the only writer |
| App config (auto-sync on Wi-Fi, sweeper last run) | read directly from `app_config` table | SQLite | One-row-per-key |

Zustand is used for ephemeral UI/session state only. **Nothing security-sensitive ever lives in a Zustand store.** The DB is the source of truth for products; `app_config` is the source of truth for preferences; `expo-secure-store` is the source of truth for credentials.

## 8. Networking Layer

`infra/http-client.ts` wraps `fetch` with: 30s timeout (AbortController), 1 automatic retry on `TypeError: Network request failed` only (handled at the transport layer — distinct from the worker's 5x per-product retry). It does NOT retry on HTTP errors; those bubble to the worker. All callers receive `WooError` with `{ status?: number; body?: unknown; cause?: unknown }`.

The `WooClient` (above) injects auth headers: `Authorization: Basic base64(key:secret)`. HTTPS only in production; the store-config flow's `validate()` rejects `http://` URLs in non-dev builds via a `__DEV__` guard, but the saved value is always `https://` (the URL-normalization UX prompt handles the user's input).

Rate limiting: the worker paces at ~1 product/sec via a `paceMs` parameter (default 1000ms), accounting for the 2N requests per product. On 429, the worker respects `Retry-After` (parsed from the response header), then falls back to the backoff schedule.

## 9. Sync Engine

The full state machine in one paragraph: the `sync-trigger` (a singleton initialized in `app/_layout.tsx`) calls `syncWorker.start()` on (a) app launch if `pending` rows exist AND not paused AND (Wi-Fi OR manual override); (b) Wi-Fi network change event if `auto_sync_on_wifi = 1`; (c) manual "Sincronizar ahora" tap. The worker iterates `listProductsForSync` ordered by `created_at`, applies the idempotency pre-check, runs the two-step upload with backoff, records a `sync_attempts` row on every attempt, moves the product to `synced` on success (storing `wc_product_id`) or `needs-attention` on cap. After the run, the orphan-media sweeper runs once. On 401/403 the worker emits `auth-blocked`, which the `sync-store` translates into the `credenciales-invalidas` card via `presentError`; the worker then stops and waits for the user to re-validate credentials.

Backoff schedule: `1s, 2s, 4s, 8s, 16s, 32s, 60s, 60s, 60s, 60s` (capped at 60s). Per-run attempt cap: **5 transient attempts** within a single worker invocation. After the 5th transient failure for a product, the product moves to `needs-attention` and the worker advances to the next. (Note: backoff schedule has 10 steps; the cap is set to 5 so the worker doesn't spend >2 minutes on a single product, and the `needs-attention` flow is reached quickly. If the user re-queues, the cap resets because it is per-RUN, not per-lifetime.)

## 10. Error Presentation

The catalog (initial 11 keys):

| Key | title | message | severity | action |
|---|---|---|---|---|
| `credenciales-invalidas` | No pudimos conectar con la tienda | Verificá las credenciales en Ajustes. | blocking | `open-settings` |
| `sin-conexion` | Sin conexión | Vamos a reintentar automáticamente cuando vuelvas a tener señal. | warning | `retry` |
| `servidor-no-disponible` | La tienda no responde | Vamos a reintentar en unos segundos. | warning | (none) |
| `limite-de-tasa` | La tienda nos pidió una pausa | Reanudamos en un momento. | info | (none) |
| `datos-invalidos` | Revisá este campo | (per-field inline, set by the form) | warning | (inline only) |
| `camara-permiso-denegado` | Necesitamos la cámara | Activala desde Ajustes para sacar fotos. | blocking | `open-settings` |
| `almacenamiento-error` | No pudimos abrir la base local | Reintentá al abrir la app, o contactanos. | blocking | `contact-support` |
| `imagen-faltante` | Falta una imagen | Sacá la foto de nuevo o quitá esta imagen. | error | `edit-product` |
| `precio-no-confirmado` | Precio sin confirmar | Tocá "Confirmar precio" para poder subirlo. | info | `edit-product` |
| `tienda-no-accesible` | Esta URL no es una tienda | Verificá la URL y volvé a intentar. | blocking | `retry` |
| `error-inesperado` | Algo salió mal | El producto quedó guardado en el teléfono, lo vamos a intentar subir de nuevo. | error | `retry` |

`presentError(errOrKey, params)` returns the catalog entry. The UI then renders title+message+action — never interpolates `err.message`. `__DEV__` `console.warn` includes the raw error and a `correlationId` (random 6-char base36 generated per call) for field-debug.

**Classifier rule (Q7)**: the `classifyError` function in this file is the SOLE classifier. It checks in order:
1. `err instanceof WooError && err.status === 401/403` → `credenciales-invalidas`
2. `err instanceof WooError && err.status === 429` → `limite-de-tasa`
3. `err instanceof WooError && err.status >= 500` → `servidor-no-disponible`
4. `err instanceof ValidationError` → `datos-invalidos` with `field`/`reason`
5. `err.code === "ECONNABORTED" || err.message?.includes("Network request failed")` → `sin-conexion`
6. `err.code === "EACCES" || err.code === "EPERM"` (file system) → `almacenamiento-error`
7. `err.code === "CAMERA_PERMISSION_DENIED"` → `camara-permiso-denegado`
8. `err.message?.includes("file does not exist")` (image-missing) → `imagen-faltante`
9. else → `error-inesperado`

The sync worker throws `WooError` and `ValidationError` — it does NOT classify.

## 11. Onboarding & First Launch

`app/_layout.tsx` runs the following on mount, in order:
1. `openDB()` + `runMigrations()` — on failure, route to a `/blocked` screen with the `almacenamiento-error` card.
2. `loadCredentials()` — if null, route to `/onboarding`.
3. If present, set the global `WooClient` (lazy singleton in `infra/woo-singleton.ts`), then route to `/(tabs)/capture`.

`/onboarding` collects URL → key → secret. On "Conectar tienda" tap:
1. URL is normalized in-memory (https + strip trailing slash + strip trailing path) BEFORE validation; the user is shown the normalized form with a plain-Spanish hint (this is a UX prompt, not a catalog entry — see Decision §2).
2. `validateAndSave(normalized)` is called; on `ok: false`, `presentError(result.classification)` renders the catalog card.
3. On `ok: true`, the credentials are persisted; the layout re-routes to `/(tabs)/capture`.

`/settings` shows: current store URL (read-only), "Reconectar tienda" (re-runs `validateAndSave` with current creds), "Reemplazar credenciales" (opens the form prefilled), and a calm "Almacenamiento usado: ~12 MB" line reading from `file-system.ts`. No "clear all data" in v1 — the friend is non-technical; a destructive reset is a v2 concern.

## 12. Testing Strategy

| Layer | What to test | Approach |
|---|---|---|
| Unit — domain | `backoff.ts` curve (1,2,4,8,16,32,60,60,60,60); `status.ts` transitions; classifier (`classifyError` matrix of 12 input shapes → 11 keys) | Jest, no RN |
| Unit — catalog | `ERROR_CATALOG` structure (every entry has title+message+severity), no-jargon lint (no `!`, no digits, no "HTTP"/"JSON"/"API", no "WooCommerce"), uniqueness of (title, message) pairs, exhaustive key coverage by grepping `src/**/*.ts` for `presentError("…"` and `presentError(<key>)` references | Jest |
| Unit — sync | idempotency: `GET meta_key=local_id` returns existing → no second POST; backoff increments; cap of 5 advances the worker; 401 emits `auth-blocked`; orphan media sweep at end of run | Jest with mocked `WooClient` |
| Unit — sweeper | threshold (5 min) gate; in-flight media not touched; 5xx on delete is recorded and skipped; idempotent on re-run | Jest with mocked `WooClient` |
| Unit — credentials | `validateAndSave` rejects on 401; persists on 200; URL normalization (http→https, trailing path) | Jest with mocked `WooClient.validate` |
| Integration — DB | migrations from v0 → v1 in a temp file; prepared statements work; FK cascade deletes product_images when product deleted; CHECK constraints reject bad status values | Jest with `expo-sqlite` in-memory via `better-sqlite3` adapter or `expo-sqlite/next` test mode |
| Component | `StatusPill` renders the 5 states; `NeedsAttentionCard` aggregates N; `PriceConfirmGate` shows the confirm button only on price change; `ErrorBanner` renders the catalog entry without inlining | RNTL |
| E2E (optional) | Happy path: capture → review → confirm price → sync → "Subido" | Maestro flow (deferred; spec marks E2E as out-of-scope for MVP, so this is a stretch) |
| CI grep | `app/**/*.tsx` MUST NOT contain `\b\d{3}\b` HTTP codes, `HTTP`, `JSON`, `fetch failed`, `TypeError`, `undefined is not`, or any English error string in a user-facing position | `scripts/ci-error-grep.sh` runs in `npm test:ci` |

Critical coverage: the idempotency test (no duplicate products after retry) and the catalog structure test (no missing keys) are the two tests that, if green, prove the spec's two most important guarantees.

## 13. Open Questions — RESOLVED

| # | Question | Decision |
|---|---|---|
| 1 | Backoff curve + per-run cap | `1, 2, 4, 8, 16, 32, 60, 60, 60, 60` capped at 60s; cap = **5 attempts per run**; cap is per-RUN (resets on next worker invocation) |
| 2 | Spec-flagged missing catalog keys | ADD all 5 (`camara-permiso-denegado`, `almacenamiento-error`, `imagen-faltante`, `precio-no-confirmado`, `tienda-no-accesible`) as dedicated entries. `datos-invalidos` stays for inline form errors with `field`/`reason` |
| 3 | Category source strategy | Eager on first capture-screen mount, cached, stale-while-revalidate (>24h background refresh), never blocks the UI; deleted-on-store categories only flagged on next-sync 4xx (no auto-prune) |
| 4 | Pause toggle scope | Global (single `paused` in `app_config`); per-product "skip" is achieved by leaving it in `pending` |
| 5 | Needs-attention aggregation | One card with live N count: "**N productos no se pudieron subir — tocá para ver**"; tap routes to filtered review-queue list |
| 6 | Draft vs publish | `publish_on_sync` defaults to 0; user toggles per-product in review; `POST` body sets `status: publish_on_sync ? "publish" : "draft"` |
| 7 | Classifier boundary | **Presenter owns classification** (sync throws raw `WooError`/`ValidationError`; `classifyError` in `error-presentation.ts` is the sole classifier). Confirmed in Decision §2 |
| 8 | URL prompts in catalog? | NO — the http→https confirmation and the trailing-path hint stay in the form as UX prompts. Catalog covers errors and blocked states only |
| 9 | Status pills | One `StatusPill` component with a private state→label map owned by the component. NOT 5 catalog entries |

All 9 resolved. None blocked.

## 14. Risks & Mitigations

| Risk | Mitigation in this design |
|---|---|
| **Retry storm on persistent 401** | Worker emits `auth-blocked` on 401/403, which pauses the queue and surfaces a single `credenciales-invalidas` card. No product is retried until the user re-validates. The 5-attempt cap is a defense-in-depth for other transient classes |
| **Idempotency collision** | UUIDv4 generated via `crypto.randomUUID()` at capture time. Pre-check `GET /wc/v3/products?per_page=1&meta_key=local_id&meta_value=<uuid>` runs on EVERY product upload, not only retries. Unit-tested in `idempotency.test.ts` |
| **Orphan-media sweeper races** | 5-min floor (`olderThanMs = 5 * 60 * 1000`) on `orphan_since`; sweeper also bounded by `maxItems = 20` per run; deletes paced at 5/sec |
| **Plain-Spanish error coverage gap** | CI grep test (`scripts/ci-error-grep.sh`) fails the build on any `app/**` file containing a forbidden pattern; `__tests__/error-presentation.test.ts` asserts every referenced key has a catalog entry |
| **WooCommerce rate limits** | Serial worker, 1 product/sec, respects `Retry-After` on 429, exponential backoff as fallback |
| **Credential leakage in public repo** | `.env` gitignored from day 1; `.env.example` placeholders only; creds only in `expo-secure-store`; lint test asserts no key/secret literals in `src/` |
| **Hardcoded `optifull.cl` creeping in** | Lint test asserts no occurrence of `optifull.cl` in `app/`, `src/`, or `assets/` (deferred to a `scripts/ci-no-store-defaults.sh` — a follow-up commit in the same change) |
| **SQLite migration breaks existing data** | v1 is additive only; `runMigrations` is transactional; failure surfaces `almacenamiento-error` and BLOCKS new captures — the user cannot create new state on a half-migrated DB |
| **Photo file growth** | Files in `FileSystem.documentDirectory` (not cache); settings shows usage; per-image deselect in review; per-image delete in review detail |
| **Background-task battery cost** | Decision §2: NO periodic background task. Worker runs on launch + foreground + Wi-Fi event. Persistent-queue guarantee is the DB itself |

## 15. File Changes Summary

| File | Action | Description |
|---|---|---|
| `app/_layout.tsx` | Create | First-launch routing; DB init + migration guard; `sync-trigger` singleton init |
| `app/onboarding.tsx` | Create | URL + key + secret form; uses `presentError` exclusively |
| `app/(tabs)/capture.tsx` | Create | Camera, image strip, name/price/category/description; route to `/queue` on save |
| `app/(tabs)/queue.tsx` | Create | List with `StatusPill`; needs-attention banner; tap row → `[id]` |
| `app/(tabs)/queue/[id].tsx` | Create | Edit form, `PriceConfirmGate`, draft/publish toggle, image deselect, delete |
| `app/(tabs)/sync.tsx` | Create | Progress line, `PauseToggle`, "Sincronizar ahora" button, product list |
| `app/(tabs)/settings.tsx` | Create | URL display, revalidate, replace, storage usage |
| `src/db/index.ts` | Create | WAL, FK on, prepared-statement helper |
| `src/db/migrations.ts` | Create | v1 schema; throw `MigrationError` on failure |
| `src/db/products.ts`, `product-images.ts`, `media-uploads.ts`, `store-categories.ts`, `sync-attempts.ts`, `app-config.ts` | Create | Per-table CRUD via prepared statements |
| `src/infra/http-client.ts`, `secure-store.ts`, `file-system.ts`, `network.ts` | Create | Transport + storage primitives |
| `src/services/credentials.ts` | Create | `validateAndSave` + `expo-secure-store` wrapper |
| `src/services/woocommerce/{client,media,products,categories}.ts` | Create | Per-endpoint WC client; throws `WooError` |
| `src/services/sync-worker.ts` | Create | Serial worker, backoff, idempotency, cap, event emitter |
| `src/services/orphan-media-sweeper.ts` | Create | 5-min floor sweep, 5/sec delete, bounded per run |
| `src/services/network-observer.ts` | Create | `expo-network` subscription, emits Wi-Fi events |
| `src/stores/{capture,queue,sync,config,error}-store.ts` | Create | One concern per store; credentials NEVER in a store |
| `src/domain/{types,status,backoff}.ts` | Create | Pure types + transitions + curve |
| `src/ui/components/{StatusPill,NeedsAttentionCard,ErrorBanner,ProgressLine,PauseToggle,PriceConfirmGate}.tsx` | Create | Presenter components; consume catalog entries |
| `src/ui/theme.ts` | Create | NativeWind v3 tokens |
| `src/error-presentation.ts` | Create | Catalog + classifier + `presentError` |
| `__tests__/*.test.ts` | Create | Unit + integration (see §12) |
| `scripts/ci-error-grep.sh` | Create | Forbidden-pattern grep |
| `app.json`, `eas.json`, `.env.example`, `.gitignore` | Create | Expo config; EAS dev/preview/production profiles; placeholder env; `.env` in gitignore |
| `README.md` | Create | Public-facing setup; ANY-store config; screenshots; iOS TestFlight + Android build steps |
| `jest.config.js`, `tsconfig.json`, `tailwind.config.js` (NativeWind v3), `package.json` | Create | Tooling: Jest + RNTL preset; strict TS; NativeWind v3 pinned |

**No deletions.** Greenfield project. No existing files to remove.

## 16. Migration / Rollout

No production data to migrate. Rollout = EAS Build → TestFlight (internal) → App Store (v1). Rollback = revoke the EAS build + unpublish. The local SQLite DB is per-device; no remote data to roll back. If sync corrupts the WC store, the user can bulk-delete the drafts they uploaded (worst case). The orphan-media sweeper has a 5-min grace period and a 20-item cap, so a runaway sweeper cannot destroy live media.

The `publish_on_sync = 0` default is the single most important safety net: nothing reaches the public store without an explicit per-product user action. Combined with the review-queue's mandatory price-confirmation gate, the blast radius of any single bug is "drafts in WP admin" — recoverable in one click.

---

**Design complete.** All 9 spec open questions resolved. All 4 proposal open questions resolved. Ready for `sdd-tasks`.
