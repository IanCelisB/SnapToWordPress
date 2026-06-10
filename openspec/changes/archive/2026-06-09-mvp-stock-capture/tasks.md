# Tasks: mvp-stock-capture

> Source of truth: `proposal.md` (intent/scope) + 7 `specs/*.md` (behavior) + `design.md` (architecture).
> All tasks below trace to ≥1 spec requirement and ≥1 design section. No orphan tasks.

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 3500–5000 LOC (greenfield: scaffold + 7 capabilities + tests + docs) |
| 400-line budget risk | **High** |
| Chained PRs recommended | **Yes** |
| Suggested split | PR 1: Bootstrap + error-presentation foundation. PR 2: local-persistence + store-config. PR 3: product-capture + review-queue. PR 4: woocommerce-sync + sync-trigger. PR 5: polish + EAS + docs. |
| Delivery strategy | ask-on-risk |
| Chain strategy | **pending** (orchestrator asks user after this forecast) |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| WU-1 | Repo scaffold, tooling, error catalog | PR 1 (base: `main`) | Self-contained. Establishes lint/grep guard. |
| WU-2 | Local SQLite + credentials + first-launch routing | PR 2 (base: `main` after PR 1) | DB is source of truth; onboard flow depends on it. |
| WU-3 | Capture + Review (UI + form + price gate) | PR 3 (base: `main` after PR 2) | Reads/writes `products` table; no remote calls. |
| WU-4 | WC client + sync worker + trigger/orchestrator | PR 4 (base: `main` after PR 3) | Picks up `ready` rows; flips state to `synced`. |
| WU-5 | E2E happy path, README, EAS profiles, polish | PR 5 (base: `main` after PR 4) | Closes the loop. No public-deploy blocker. |

> Work-unit boundaries follow the `work-unit-commits` skill: each unit keeps tests + docs in the same commit/PR so the diff tells a complete story.

---

## Phase 1: Foundation / Infrastructure (Work Unit WU-1)

- [x] 1.1 Initialize Expo SDK 56 project (TypeScript template) at repo root; pin Expo, React, RN versions in `package.json`; commit `app.json` with iOS bundle id + `NSCameraUsageDescription`, Android `CAMERA` + `READ_MEDIA_IMAGES` permissions. **Implements: bootstrap for all 7 specs; Design §4, §15.** **Acceptance:** `npx expo start` boots a dev client; `eas.json` exists with dev/preview/production profiles. **Size:** small. **Deps:** none.

- [x] 1.2 Create folder structure exactly per Design §4: `app/(tabs)/`, `src/{db,infra,services,services/woocommerce,stores,domain,ui/components}`, `__tests__/`, `scripts/`. Add `.gitignore` (node_modules, `.expo`, `ios/`, `android/`, `.env`, `dist/`). **Implements: Design §4, §15.** **Acceptance:** `tree -L 3 src` matches the design; `git status` shows no platform folders. **Size:** small. **Deps:** 1.1.

- [x] 1.3 Tooling baseline: ESLint + Prettier + TypeScript strict (`strict: true`, `noUncheckedIndexedAccess: true`); `jest.config.js` with `jest-expo` preset; `react-native-testing-library`; `tailwind.config.js` pinned to NativeWind v3 + `babel.config.js` with NativeWind plugin; Metro configured. **Implements: Design §4, §12.** **Acceptance:** `npm run lint` passes on empty `src/`; `npm test` runs and a smoke test passes. **Size:** small. **Deps:** 1.1.

- [x] 1.4 CI grep guard: `scripts/ci-error-grep.sh` that fails the build if `app/**/*.tsx` contains any of `\b\d{3}\b`, `HTTP`, `JSON`, `fetch failed`, `TypeError`, `undefined is not`, `optifull.cl`. Wire into `npm run test:ci`. **Implements: `error-presentation` R1, R5 scenarios; Design §12, §14.** **Acceptance:** script exits non-zero on a temp file containing "401"; exits 0 on a clean tree. **Size:** small. **Deps:** 1.3.

- [x] 1.5 Create `src/error-presentation.ts` with the 11-key `ERROR_CATALOG` typed via `as const`; `CatalogEntry` type; `ErrorKey` union. Strings are the exact Spanish voseo from Design §10. **Implements: `error-presentation` R2 + all 11 scenarios; Design §5 (catalog).** **Acceptance:** every key from Design §10 is present; test asserts each entry has `title`/`message`/`severity`; no `!` in any string. **Size:** small. **Deps:** 1.3.

- [x] 1.6 Add `presentError(errOrKey, params)` and `classifyError(err)` in the same file per Design §5 + §10 (classifier rule order). `__DEV__` console.warn includes raw error + a random 6-char base36 `correlationId`. **Implements: `error-presentation` R3, R4, R6; Design §10 (classifier).** **Acceptance:** unit test matrix (WooError 401/403/429/5xx, TypeError network, ValidationError, weird TypeError) returns the correct key; never returns raw text. **Size:** medium. **Deps:** 1.5.

- [x] 1.7 Catalog tests in `__tests__/error-presentation.test.ts`: structure (4 fields), uniqueness of (title,message), no-jargon lint (no digits/`HTTP`/`JSON`/`API`/`WooCommerce`/`token`/`sync`), exhaustive coverage of `presentError(...)` call sites in `src/` and `app/`. **Implements: `error-presentation` R5; Design §12 (catalog tests).** **Acceptance:** all assertions pass on the initial 11 entries; CI fails if a new call site references an undeclared key. **Size:** medium. **Deps:** 1.6.

**Work Unit WU-1 commit boundary:** tasks 1.1–1.7 land as one chained PR (or first commits of PR 1). After merge, every subsequent task can `import { presentError, classifyError } from "../error-presentation"`.

---

## Phase 2: Local Persistence + Store Config (Work Unit WU-2)

> Depends on WU-1. Establishes DB-as-source-of-truth and the first-launch flow.

- [ ] 2.1 `src/db/index.ts` implementing the `DB` contract from Design §5: `exec`, `query<T>`, `run`, `transaction`, `close`. `openDB()` enables `PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`, reads `user_version`. **Implements: `local-persistence` R1; Design §5, §6.** **Acceptance:** integration test opens an in-memory DB, asserts WAL is on, FK is on, `user_version` returns the seed value. **Size:** medium. **Deps:** 1.3.

- [ ] 2.2 `src/db/migrations.ts` with `TARGET_VERSION = 1` and a single `MigrationStep` that runs the v1 schema from Design §6 (`products`, `product_images`, `media_uploads`, `sync_attempts`, `store_categories`, `app_config` + all indexes + CHECK constraints). Throws `MigrationError` on failure. **Implements: `local-persistence` R1, R2, R3; Design §6.** **Acceptance:** integration test runs migration on a temp file → all tables exist, CHECK rejects `status='garbage'`, FK cascade deletes `product_images` when parent `products` row is deleted. **Size:** medium. **Deps:** 2.1.

- [ ] 2.3 Per-table CRUD modules: `src/db/{products,product-images,media-uploads,store-categories,sync-attempts,app-config}.ts`, each exposing typed prepared-statement helpers exactly as scoped by Design §5 (`insertProduct`, `updateProduct`, `listProductsForSync`, `listProductsByStatus`, `deleteProduct`, image CRUD, media status transitions, attempts insert/list, categories upsert/lookup, app_config get/set). **Implements: `local-persistence` R3, R4, R5, R6, R7; Design §5, §6.** **Acceptance:** integration tests cover happy-path insert/read, status transition, FK cascade; queries use `WHERE status IN ('pending','ready')` for `listProductsForSync`. **Size:** large. **Deps:** 2.2.

- [ ] 2.4 `src/infra/{secure-store,file-system,network,http-client}.ts` wrappers: `secure-store` exposes `getItem`/`setItem`/`deleteItem` for 3 keys (`store_url`, `consumer_key`, `consumer_secret`); `file-system` returns `documentDirectory` + `getDirSizeMb()`; `network` wraps `expo-network` `getNetworkStateAsync()`; `http-client` wraps `fetch` with AbortController (30s) and 1 automatic retry on `TypeError: Network request failed` only, throwing `WooError({status, body, cause})`. **Implements: `store-config` R4 + `local-persistence` (orphan sweeper) + Design §8, §15.** **Acceptance:** unit tests: `http-client` retries once on network-reset, does NOT retry on HTTP 5xx, throws `WooError` with `status`; `secure-store` mocks round-trip. **Size:** medium. **Deps:** 1.3.

- [ ] 2.5 `src/services/woocommerce/client.ts` implementing the `WooClient` contract from Design §5: HTTPS Basic auth header, base-URL canonicalization, per-request 30s timeout, methods `getProductByLocalId`, `uploadMedia`, `deleteMedia`, `createProduct`, `listCategories`, `validate` (calls `GET /wc/v3/system_status`). 1 retry on connection-reset at transport layer only. **Implements: `woocommerce-sync` R1, R2, R4; `store-config` R2; Design §5, §8, §12.** **Acceptance:** unit tests with mocked `fetch`: `validate()` returns `{ok:true}` on 200, `credenciales-invalidas`-shaped failure on 401, `tienda-no-accesible` on 404; `getProductByLocalId` parses `meta_data` correctly. **Size:** large. **Deps:** 2.4.

- [ ] 2.6 `src/services/woocommerce/{media,products,categories}.ts` thin wrappers composing the client: `products.ts` includes the idempotency pre-check + `meta_data: [{key:"local_id", value: <uuid>}]` body construction; `media.ts` does multipart upload via `FormData` from a `file://` URI; `categories.ts` calls `listCategories` and returns `WCCategory[]`. **Implements: `woocommerce-sync` R1, R2; Design §5.** **Acceptance:** unit tests assert POST body shape (meta_data present, status=draft by default, `publish_on_sync` toggles to "publish"); `media` constructs FormData with correct filename + mime. **Size:** medium. **Deps:** 2.5.

- [ ] 2.7 `src/services/credentials.ts` implementing `loadCredentials`, `saveCredentials`, `clearCredentials`, `validateAndSave` per Design §5. `validateAndSave` calls `createWooClient(c).validate()` first, persists only on `ok:true`. URL normalization (https prepend, trailing slash strip, path strip) lives here, NOT in the catalog. **Implements: `store-config` R2, R3, R4; Design §11.** **Acceptance:** unit tests: 200 → persists; 401 → returns `{ok:false, classification: "credenciales-invalidas"}`; network error → `"sin-conexion"`; `http://foo` → normalized to `https://foo`; `https://x.com/shop/` → `https://x.com`. **Size:** medium. **Deps:** 2.5, 2.6.

- [ ] 2.8 `src/domain/{types,status,backoff}.ts`: `Product`, `ProductStatus`, `ProductImage`, `MediaUpload`, `SyncAttempt`, `StoreCategory`, `AppConfig`, `WCCredentials`, `WooError`, `ValidationError`, `MigrationError` types; status state-machine helper (`canTransition(from, to)`); pure `backoff(attempt) → ms` returning the exact Design §9 curve. **Implements: `local-persistence` R2, R3; Design §5, §6, §9.** **Acceptance:** unit tests: `backoff(0)=1000`, `backoff(9)=60000`; `canTransition('pending','ready')=true`, `canTransition('synced','pending')=false`. **Size:** small. **Deps:** 1.3.

- [ ] 2.9 `app/_layout.tsx` first-launch routing per Design §11: on mount, `openDB()` → `runMigrations()` → on failure route to `/blocked` with `presentError(almacenamiento-error)`; `loadCredentials()` → if null route to `/onboarding`; else instantiate lazy `WooClient` singleton and route to `/(tabs)/capture`. **Implements: `store-config` R1, R6; `local-persistence` R1 scenario "Migration failure"; Design §11.** **Acceptance:** manual test: fresh install → `/onboarding`; after save → `/(tabs)/capture`; force migration to fail in dev → `/blocked` card with the exact catalog title/message. **Size:** medium. **Deps:** 2.1, 2.2, 2.7.

- [ ] 2.10 `app/onboarding.tsx` screen: URL → key → secret fields, plain-Spanish labels, "Conectar tienda" primary action. On tap: normalize URL in-memory; show the http→https confirmation prompt and the trailing-path hint as in-form UX prompts (NOT catalog entries); call `validateAndSave`; on `ok:false` render via `presentError`; on `ok:true` let `_layout` re-route. No inline Spanish strings for errors. **Implements: `store-config` R1, R2, R3, R4, R5, R6, R8; Design §11.** **Acceptance:** manual test paths: valid creds → capture; bad creds → catalog card; bad URL → catalog card; http URL → confirmation prompt, confirm → https normalized. CI grep test stays green. **Size:** medium. **Deps:** 2.9, 1.6.

- [ ] 2.11 `app/(tabs)/settings.tsx`: read-only store URL display; "Reconectar tienda" (re-runs `validateAndSave`); "Reemplazar credenciales" (re-opens the form pre-filled); calm storage usage line from `file-system.getDirSizeMb()`. No destructive "clear all data" in v1. **Implements: `store-config` R5, R6; Design §11.** **Acceptance:** manual: storage line matches actual `documentDirectory` size; re-validate with broken creds surfaces catalog card; replace persists new creds. **Size:** small. **Deps:** 2.10, 2.4.

**Work Unit WU-2 commit boundary:** tasks 2.1–2.11 land as PR 2. After merge, capture can write to `products`; onboarding is the only entry point.

---

## Phase 3: Capture + Review Queue (Work Unit WU-3)

> Depends on WU-2. Pure local UI — no remote calls. Reads from `products` and `store_categories` tables.

- [ ] 3.1 `src/stores/{capture-store,queue-store,config-store}.ts`: capture-store holds the in-memory draft (name, price, category, description, imageRefs[]); queue-store reads-through `products` table; config-store reads/writes `app_config` rows (`auto_sync_on_wifi`, `sync_paused`). NO credentials in any store. **Implements: `local-persistence` R6, R7; `product-capture` R3; `sync-trigger` R4; Design §7, §15.** **Acceptance:** unit tests: config-store writes through to `app_config`; queue-store subscribes to a custom change-channel and re-renders on `products` mutations. **Size:** medium. **Deps:** 2.3, 2.8.

- [ ] 3.2 Camera permission flow + capture hook: `src/services/camera-permission.ts` requesting `expo-camera` permission; on denial emit `camara-permiso-denegado` key to the error-store. On grant, instantiate `CameraView` in capture screen. **Implements: `product-capture` R1 scenario "Camera permission denied"; Design §5.** **Acceptance:** unit test: permission-denied path returns the catalog key; happy path returns granted. **Size:** small. **Deps:** 1.6.

- [ ] 3.3 Image persistence helper: `src/services/images.ts` writes the camera output to `documentDirectory/products/<local_id>/<n>.jpg`, returns the absolute path. `product_images` row is inserted with `position = n`. Survives restart per `product-capture` R1 scenario. **Implements: `product-capture` R1, R2; `local-persistence` R4; Design §6.** **Acceptance:** unit test: file exists after save; `product_images` row references the path; cap of 5 enforced. **Size:** small. **Deps:** 2.3, 3.2.

- [ ] 3.4 Image picker fallback (`expo-image-picker`) for library imports: same persistence path as the camera flow. **Implements: UX extension of `product-capture` R1.** **Acceptance:** unit test: library URI is copied into documents dir, `product_images` row inserted, no permission key emitted. **Size:** small. **Deps:** 3.3.

- [ ] 3.5 Form validation in capture-store: required-name, integer-price (positive), category-required; emits `datos-invalidos` with `field` + `reason` (`required` | `not-integer` | `must-be-positive`). Reuses the catalog's `datos-invalidos` per-field pattern (Decision §2). **Implements: `product-capture` R2, R6; Design §10.** **Acceptance:** unit test matrix: empty name → key; "12,5" → key; "-100" → key; all valid → no error. **Size:** small. **Deps:** 1.6, 3.1.

- [ ] 3.6 `app/(tabs)/capture.tsx` screen: `CameraView` for multi-shot, image strip with re-order, name/price/category/description inputs, pre-fill category from last product, empty description with hint, primary "Guardar producto" button. On save: `local_id = crypto.randomUUID()`, `status = 'pending'`, `publish_on_sync = 0`, `price_confirmed = 0`, navigate to `/queue` and reset form. No network call. **Implements: `product-capture` R1–R6; `local-persistence` R2; Design §7, §11.** **Acceptance:** manual: offline capture succeeds; required fields validated; defaults applied; CI grep test stays green. **Size:** large. **Deps:** 3.3, 3.4, 3.5, 3.1.

- [ ] 3.7 `app/(tabs)/queue.tsx` list: name, price, category, `StatusPill` per row; sorted with `pending` at top; primary "Revisar" on rows in `pending`; top `NeedsAttentionCard` showing live N count (one card per stuck product set). `StatusPill` is a presenter component with a private state→label map (Decision §9). **Implements: `review-queue` R1, R2, R6; `sync-trigger` R5; Design §5 (`StatusPill`, `NeedsAttentionCard`).** **Acceptance:** component tests: `StatusPill` renders 5 states; `NeedsAttentionCard` shows N=3 → "3 productos no se pudieron subir — tocá para ver". **Size:** large. **Deps:** 3.6, 1.6.

- [ ] 3.8 `app/(tabs)/queue/[id].tsx` edit screen: editable name, price, category, description, image selection (per-image toggle to `excluded` in `product_images`), draft vs publish toggle (`publish_on_sync`). `PriceConfirmGate` component shows "Confirmar precio" only when the price field was edited, with a color-coded delta vs. the captured value. On confirm: set `price_confirmed = 1`, transition `status: pending → ready`. **Implements: `review-queue` R2, R3, R4; Design §5 (`PriceConfirmGate`).** **Acceptance:** component test: `PriceConfirmGate` shows button only on price change; manual: edit + confirm → row moves to `ready`; edit + leave → row stays `pending` with "Precio sin confirmar" pill (via `precio-no-confirmado` key). **Size:** large. **Deps:** 3.7, 1.6.

- [ ] 3.9 Delete flow: "Eliminar de la cola" button in `[id]` screen with a plain-Spanish confirmation dialog ("¿Eliminar este producto? No se subió todavía."). On confirm: `deleteProduct` (cascades `product_images`), remove the files from `documentDirectory`. No confirmation dialog on any other action. **Implements: `review-queue` R5; `local-persistence` R4 scenario "Image deletion before sync".** **Acceptance:** integration test: delete cascades, files removed, row gone from `products`. **Size:** small. **Deps:** 3.8, 2.3.

- [ ] 3.10 Re-queue action: a "Reintentar" button on `needs-attention` rows that transitions `needs-attention → pending|ready` (clears `last_error_key`, sets `next_attempt_at = now`). **Implements: `woocommerce-sync` R8 scenario "User resolves the issue and the product is re-queued"; `review-queue` R6 scenario "Persistent auth failure".** **Acceptance:** unit test: status transition valid; `next_attempt_at` updated; cleared `last_error_key`. **Size:** small. **Deps:** 3.8, 2.8.

**Work Unit WU-3 commit boundary:** tasks 3.1–3.10 land as PR 3. After merge, a user can capture → review → confirm price → delete. No remote calls yet.

---

## Phase 4: WooCommerce Sync + Trigger (Work Unit WU-4)

> Depends on WU-3. Pushes `ready` rows to WC, drives the trigger from Wi-Fi + manual + pause.

- [ ] 4.1 `src/services/sync-worker.ts` implementing `createSyncWorker(deps)` per Design §5: serial iteration over `listProductsForSync`; per-product idempotency pre-check (`getProductByLocalId` → if hit, store `wc_product_id` and short-circuit to `synced`); two-step upload (media × N then product); `paceMs = 1000` between products; per-run cap = 5 transient attempts; backoff curve from `domain/backoff.ts`; `429` respects `Retry-After`; emits the `WorkerEvent` union from Design §5. **Implements: `woocommerce-sync` R1, R2, R3, R4, R5, R6, R8; Design §5, §9.** **Acceptance:** unit tests with mocked `WooClient`: idempotency (pre-check hit → no POST), cap-of-5 advances worker, 401 emits `auth-blocked`, backoff increments per `domain/backoff` curve, `needs-attention` written on cap reached. **Size:** large. **Deps:** 2.6, 2.8, 2.3.

- [ ] 4.2 `src/services/orphan-media-sweeper.ts` per Design §5: scans `media_uploads WHERE status='orphan' AND orphan_since < now - 5min`; `DELETE /wp/v2/media/<id>?force=true`; max 20 items per run; paces deletes at 5/sec; records failures for next run; idempotent on re-run. Runs at end of every worker run AND on a 24h foreground timer (`sweeper_last_run` in `app_config`). **Implements: `woocommerce-sync` R7; `local-persistence` R5; Design §5, §6.** **Acceptance:** unit tests: threshold gate (30s old → not touched; 6min old → touched); 5xx on delete recorded; re-run is idempotent. **Size:** medium. **Deps:** 4.1, 2.3, 2.5.

- [ ] 4.3 `src/services/network-observer.ts` wrapping `expo-network`: emits `{online, type: 'wifi'|'cellular'|'none'}` events. Subscribed in `_layout`; triggers worker on `wifi`-connected event per `sync-trigger` R1 scenario. **Implements: `sync-trigger` R1; Design §15.** **Acceptance:** unit test (mocked): `wifi` event calls `syncWorker.start()` if not paused. **Size:** small. **Deps:** 4.1, 2.4.

- [ ] 4.4 `src/stores/sync-store.ts` + `error-store.ts`: sync-store holds `status: idle|running|paused|auth-blocked|needs-attention`, `progress: {current,total}|null`, `paused: boolean`, `pausedAt: number|null`, `blockedCount: number`. Subscribes to `WorkerEvent`; writes `paused` through to `app_config`. error-store is the only writer via `presentError(...)`; UI subscribes for banner/card rendering. **Implements: `sync-trigger` R1, R3, R4, R5; `woocommerce-sync` R8; Design §5, §7.** **Acceptance:** unit test: `applyEvent({kind:'auth-blocked'})` → state = `auth-blocked`, `blockedCount` increments, error-store gets the `credenciales-invalidas` entry. **Size:** medium. **Deps:** 4.1, 1.6.

- [ ] 4.5 `src/services/sync-trigger.ts` singleton: initialized in `app/_layout.tsx`; on app foreground: if `not paused AND hasReadyRows AND (wifi OR manualOverride)` → `start()`. Wires the network observer. Wires the 24h sweeper timer. **Implements: `sync-trigger` R1, R2, R4; Design §9.** **Acceptance:** integration test: launch with ready rows + wifi → worker started; cellular + auto-sync off → not started; paused → not started. **Size:** medium. **Deps:** 4.3, 4.4, 2.9.

- [ ] 4.6 `app/(tabs)/sync.tsx` screen: `ProgressLine` ("Subiendo producto 3 de 12..."), `PauseToggle` (global, persists), "Sincronizar ahora" primary button, list of pending/active products. Disabled "Sincronizando..." state while running. Calm "No hay productos pendientes" / "La sincronización está pausada" hints — but per `error-presentation` rule, the actual error text comes from the catalog; the calm hint copy itself is also catalog-driven (treated as `info` entries the design §10 already accommodates). **Implements: `sync-trigger` R2, R3, R5, R6, R7; Design §5 (`ProgressLine`, `PauseToggle`).** **Acceptance:** component tests: button disabled when running; toggle persists across app restart; persistent banner appears on capture/queue only while worker active and user not on sync screen. **Size:** large. **Deps:** 4.5, 4.4.

- [ ] 4.7 Persistent banner on `app/(tabs)/capture.tsx` and `app/(tabs)/queue.tsx`: shows progress line only when worker is active AND user is not on `/sync`; tap navigates to `/sync`. **Implements: `sync-trigger` R5; Design §2 decision (Progress indicator placement).** **Acceptance:** manual: open capture while syncing → banner visible; open sync → banner hidden on sync itself. **Size:** small. **Deps:** 4.6, 3.6, 3.7.

- [ ] 4.8 Categories fetch on capture-screen mount per Design §2 (Categories strategy): first mount → `listCategories()` → upsert `store_categories`; subsequent mounts → read from cache, background refresh if `cached_at > 24h`; "Cargando categorías..." only if cache empty AND fetch in-flight; "Las categorías pueden estar desactualizadas" hint if `cached_at > 7d`. Deleted-on-store categories: NOT auto-pruned; flagged `needs-attention` only on next sync 4xx. **Implements: `product-capture` R2 scenario "Category list is empty"; `local-persistence` R6; Design §2 (Q3).** **Acceptance:** integration test: cache hits skip network; stale cache (8d) shows the hint; no auto-prune. **Size:** medium. **Deps:** 2.6, 3.6.

**Work Unit WU-4 commit boundary:** tasks 4.1–4.8 land as PR 4. After merge, end-to-end: capture → review → confirm → sync → "Subido".

---

## Phase 5: Verification, Polish, Public-Repo Hygiene (Work Unit WU-5)

> Depends on WU-4. Closes the loop. No new behavior — only confidence + shippability.

- [ ] 5.1 `__tests__/idempotency.test.ts`: round-trip a product through the worker with a mocked `WooClient` that times-out the first `POST /products`, returns 200 on retry; assert exactly one server-side product, `wc_product_id` stored, status `synced`. **Implements: `woocommerce-sync` R2 + R3 critical coverage; Design §12.** **Acceptance:** test passes deterministically. **Size:** medium. **Deps:** 4.1.

- [ ] 5.2 `__tests__/orphan-sweeper.test.ts`: threshold gate, in-flight media not touched, 5xx on delete recorded and skipped, idempotent on re-run. **Implements: `woocommerce-sync` R7; Design §12.** **Acceptance:** all scenarios pass. **Size:** small. **Deps:** 4.2.

- [ ] 5.3 `__tests__/sync-worker.test.ts` + `__tests__/backoff.test.ts`: backoff curve exact (1,2,4,8,16,32,60,60,60,60); cap of 5 advances worker; 401 emits `auth-blocked`; 429 respects `Retry-After`; status transitions from `syncing` → `synced` | `needs-attention`. **Implements: `woocommerce-sync` R4, R5, R8; Design §12.** **Acceptance:** all assertions pass. **Size:** medium. **Deps:** 4.1, 2.8.

- [ ] 5.4 Component test pass for `StatusPill`, `NeedsAttentionCard`, `PriceConfirmGate`, `ErrorBanner`, `ProgressLine`, `PauseToggle` using RNTL. **Implements: Design §12 (component tests).** **Acceptance:** `npm test` green. **Size:** medium. **Deps:** 3.8, 3.7, 4.6, 1.6.

- [ ] 5.5 End-to-end happy path: a single Jest integration test (or scripted Maestro flow if env supports) that drives capture → review → confirm price → publish toggle → `syncWorker.start()` with a fully mocked `WooClient` → asserts final state `synced` with `wc_product_id` set, and a single catalog card never surfaces. **Implements: integration coverage of all 7 specs; Design §12.** **Acceptance:** green. **Size:** medium. **Deps:** 5.1, 5.3, 5.4.

- [ ] 5.6 Onboarding e2e: fresh-install simulation in dev (delete `app_config` and secure-store keys) → first launch shows `/onboarding` → enter creds → catalog card on 401 → valid creds → land in `/(tabs)/capture`. **Implements: `store-config` R1, R2; Design §11.** **Acceptance:** manual checklist runs cleanly on a dev build. **Size:** small. **Deps:** 2.10, 2.9.

- [ ] 5.7 No-hardcoded-store check: extend `scripts/ci-error-grep.sh` to fail on any `optifull.cl` literal in `app/`, `src/`, `assets/`, `__tests__/`, or `.env.example`. **Implements: `store-config` R7; Design §14 (hardcoded-store creeping in).** **Acceptance:** script exits non-zero on a deliberate `optifull.cl` insertion; clean otherwise. **Size:** small. **Deps:** 1.4.

- [ ] 5.8 No-credential-leak lint: `scripts/ci-no-credentials.sh` that greps `app/`, `src/`, and `__tests__/` for patterns matching `ck_[a-f0-9]{20,}` / `cs_[a-f0-9]{20,}` / Basic-Auth base64 blobs. **Implements: `store-config` R4 scenario "No credentials in logs"; Design §14.** **Acceptance:** script flags a planted secret; passes on clean tree. **Size:** small. **Deps:** 5.7.

- [ ] 5.9 `README.md` with: any-store setup steps; `.env.example` placeholders only; iOS TestFlight + Android build commands; screenshots of capture / queue / sync / onboarding; explanation of the 5 design-decision cards (auto-on-Wi-Fi, global pause, draft-by-default, idempotency, price gate). **Implements: proposal §In Scope (public repo, reusable for any store); `store-config` R7.** **Acceptance:** a fresh clone + README walk-through gets to a running dev build. **Size:** medium. **Deps:** 5.6, 5.7.

- [ ] 5.10 `eas.json` finalized: dev, preview (TestFlight internal), production profiles. iOS bundle id, Android application id, version auto-increment policy. `app.json` camera + media permissions verified for production builds (no dev-only fields leaking). **Implements: proposal §Affected Areas; Design §15.** **Acceptance:** `eas build --profile preview --platform ios` succeeds locally; same for android. **Size:** small. **Deps:** 5.9.

- [ ] 5.11 `.env.example` with placeholder keys only (`STORE_URL=`, `CONSUMER_KEY=`, `CONSUMER_SECRET=`); `.env` in `.gitignore`; verify by `git status` after a dev-time `.env` write. **Implements: `store-config` R4; Design §14.** **Acceptance:** `git status` does not list `.env` after creating it locally. **Size:** small. **Deps:** 1.2.

- [ ] 5.12 Final polish pass: empty-state copy, tab order, NativeWind theme tokens in `src/ui/theme.ts` (calm palette, no jarring reds), launch screen splash, app icon. No new behavior. **Implements: Design §4 (`theme.ts`).** **Acceptance:** app boots into `/capture` cleanly on a fresh install with the calm palette applied. **Size:** small. **Deps:** 5.10.

**Work Unit WU-5 commit boundary:** tasks 5.1–5.12 land as PR 5. After merge, the app is shippable to TestFlight + Play internal testing.

---

## Cross-References Index (for the apply agent)

| Spec | Tasks implementing it |
|------|----------------------|
| `error-presentation` | 1.4, 1.5, 1.6, 1.7, 2.10, 3.2, 3.5, 3.7, 3.8, 4.4, 4.6 |
| `local-persistence` | 1.4, 2.1, 2.2, 2.3, 2.4, 2.8, 2.9, 3.3, 3.9, 4.1, 4.2, 4.8, 5.2 |
| `product-capture` | 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.8 |
| `review-queue` | 3.7, 3.8, 3.9, 3.10 |
| `woocommerce-sync` | 2.5, 2.6, 4.1, 4.2, 4.4, 4.8, 5.1, 5.2, 5.3 |
| `store-config` | 2.4, 2.5, 2.7, 2.9, 2.10, 2.11, 5.6, 5.7, 5.8, 5.9, 5.11 |
| `sync-trigger` | 3.1, 3.7, 4.3, 4.4, 4.5, 4.6, 4.7 |

| Design section | Tasks implementing it |
|----------------|----------------------|
| §2 Architecture Decisions (all 12) | 1.5, 1.6, 2.7, 2.11, 3.5, 3.7, 4.4, 4.6, 4.7, 4.8 |
| §3 Data Flow | 4.1, 4.2, 4.5, 4.6 |
| §4 Folder Structure | 1.1, 1.2, 1.3, 5.12 |
| §5 Module Contracts | 1.5, 1.6, 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 3.1, 4.1, 4.2, 4.4, 4.6 |
| §6 Data Model | 2.2, 2.3 |
| §7 State Model | 3.1, 3.6, 4.4 |
| §8 Networking Layer | 2.4, 2.5, 4.1 |
| §9 Sync Engine | 2.8, 4.1, 4.2, 4.5 |
| §10 Error Presentation | 1.5, 1.6, 1.7, 2.10, 4.4 |
| §11 Onboarding & First Launch | 2.9, 2.10, 2.11, 5.6 |
| §12 Testing Strategy | 1.4, 1.7, 2.1, 2.2, 2.5, 2.7, 5.1, 5.2, 5.3, 5.4, 5.5 |
| §14 Risks & Mitigations | 1.4, 2.5, 2.6, 4.1, 4.2, 5.7, 5.8, 5.11 |
| §15 File Changes Summary | 1.1–1.7, 2.1–2.11, 3.1–3.10, 4.1–4.8, 5.1–5.12 |

---

## Notes for the apply agent

- **No TDD** by user opt-in (`strict_tdd: false`). Tests are co-located with their behavior commit (per `work-unit-commits` skill) but do not gate the implementation commit — they land in the same work unit.
- **No code in this file.** This is a plan. The apply agent generates code following the design's contracts exactly.
- **Commit by work unit, not by file type.** Each WU's tasks land in 1–3 commits with tests/docs in the same commit.
- **No deletions** in any phase. Greenfield project.
- **Strict order:** do not start WU-N+1 tasks until WU-N's blocking tasks are merged. Within a WU, tasks 1.1/1.5-style siblings can run in parallel if independent.
- **If a task feels too big during apply**, split it further; the size tags (`small`/`medium`/`large`) are a planning aid, not a hard limit.
