# Proposal: mvp-stock-capture

> Rewritten 2026-06-08 with **automatic recovery + non-technical-UX** focus. The end user is a non-technical small-store owner; the app must handle everything under the hood and only ever surface what requires the user's action.

## Intent

The user (a non-technical small-store owner) needs a phone-first way to capture product stock in the field — photos plus name, integer price, category, and short description — and push it to any WooCommerce store. The bottleneck is capture: typing into WP admin on a phone is slow, error-prone, and happens away from the products themselves. A **review queue stage with explicit price confirmation** is required before anything leaves the device, because prices typed in haste are the #1 source of bulk-upload mistakes.

The product philosophy for this app is: **the user should never have to think about what the app is doing under the hood.** Sync is automatic. Retries are silent. Errors are plain Spanish, never stack traces. The user only ever sees a problem when their action is required to fix it.

The repo is public and must remain generic for any WooCommerce store — no hardcoded optifull.cl URLs, slugs, or category IDs.

## Scope

### In Scope
- React Native + Expo SDK 56 + TypeScript app (iOS primary, Android committed)
- Capture screen: multi-image picker via `expo-camera` (`CameraView`), name, integer price (CLP, no decimals), category from store, optional short description
- Local persistence in `expo-sqlite` (raw prepared statements, WAL enabled, versioned migrations) — **local DB is the source of truth, always**
- Review queue screen: per-product edit of name/price/category/description, per-image selection for upload, draft vs publish choice, **mandatory "Confirmar precio" tap on price changes before the product becomes syncable**
- WooCommerce sync: two-step media + product creation via REST API v3, Consumer Key/Secret auth
- Single onboarding flow: first launch asks for store URL + Consumer Key + Secret, **validates them before saving**, done
- Sync trigger: auto on Wi-Fi + manual override + always-visible "Pausar sincronización" toggle (Option C)

### Out of Scope
- OpenDesigner MCP setup (README/landing only at end of project)
- Multi-user, auth, roles, accounts
- Cloud sync between devices, web admin panel
- E2E test suite (defer to v2)
- Barcode scanning, inventory tracking, stock-level changes
- Decimal currencies, tax/shipping fields, variations
- Dry-run preview mode (deferred to design phase as stretch)

## Design Principles (non-negotiable)

### Resilience — the app handles problems, the user doesn't
- **Silent retry with exponential backoff** for transient failures (network blip, 5xx, timeout). User never sees a "try again" button for these — the app just retries.
- **Persistent retry queue** — if the app is closed, killed, or the device sleeps mid-sync, the next launch picks up exactly where it left off. Nothing is ever lost.
- **Idempotent operations** — when a request is uncertain (timeout but might have reached the server), the app uses a stable client-side `local_id` stored in product meta so retries cannot create duplicates. Same product, same `local_id`, never uploaded twice.
- **Automatic orphan-media cleanup** — if product create fails AFTER images were uploaded, the app silently `DELETE`s the uploaded media in the background. The user is never told "I uploaded 3 images and then failed."
- **Credential validation on save** — when the user pastes Consumer Key/Secret, the app hits the store and tests them BEFORE saving. If invalid, the user sees "Las credenciales no funcionan, verificá con el dueño de la tienda." Plain Spanish, no error code.

### UX — built for a non-technical end user
- **One primary action per screen.** No buried menus, no settings rabbit holes.
- **Plain Spanish error messages.** Never "HTTP 401", always "No pudimos conectar con la tienda. Tocá Reintentar." No stack traces ever reach the UI.
- **Progress is visible but not anxiety-inducing.** "Subiendo producto 3 de 12..." with a calm indicator, not a spinner that disappears.
- **No "are you sure?" dialogs for reversible actions.** Confirmations only for destructive ones (delete from review queue).
- **Default values everywhere** — pre-fill category from last used, pre-fill description as empty (with a hint), pre-fill store URL once saved.
- **"Pausar sincronización" toggle is always visible** in the sync screen so the user feels in control without needing to understand the system.
- **Single onboarding flow** — first launch: ask for store URL + Consumer Key + Secret, validate, save. Never ask again unless the creds break.

### Safety nets — non-negotiable
- **Local DB is the source of truth.** The app never trusts the remote as authoritative. If sync fails, the product is still safely in the phone, retrying forever.
- **Review queue is mandatory.** Products only sync after the user explicitly approves them in the review screen. No auto-sync from capture.
- **Price confirmation step** — the review screen shows the price in large type, color-codes changes vs. the captured value, and requires a "Confirmar precio" tap before the product becomes syncable. This is the single most important anti-mistake feature in the app.
- **Default to `draft`** — products sync as drafts unless the user explicitly chooses `publish` per product in the review screen. The store is never polluted with auto-published items.

## Capabilities

### New Capabilities
- `product-capture`: capture form, image persistence, validation of name/price/category
- `local-persistence`: SQLite schema, migrations, CRUD for products and images (source of truth)
- `review-queue`: per-product editing, image selection, **price-confirmation gate**, draft/publish decision
- `woocommerce-sync`: REST client, two-step image + product upload, throttling, silent retry with exponential backoff, persistent retry queue, idempotency via `local_id` in product meta, automatic orphan-media cleanup
- `store-config`: secure storage of credentials, **on-save credential validation against the live store**, settings screen
- `sync-trigger`: auto-on-WiFi detection, manual button, always-visible "Pausar sincronización" toggle, calm progress surfacing
- `error-presentation`: centralized mapping of internal errors → plain Spanish user messages (no jargon, no stack traces)

### Modified Capabilities
None — greenfield project, no existing specs.

## Approach

Expo Router (file-based routing) with screens: `/capture`, `/queue`, `/queue/[id]`, `/sync`, `/settings`, plus a first-launch `/onboarding` flow. State managed with **Zustand** stores per concern (capture draft, queue, sync status, config). SQLite is the source of truth locally; sync is a unidirectional push with optimistic local IDs and remote ID reconciliation. The review queue is the system's checkpoint — nothing leaves the device without explicit per-product approval AND a price-confirmation tap.

The sync engine is a serial worker that pulls pending products from SQLite, applies idempotency via a stable `local_id` field in product meta (so retried/replayed requests map to the same remote item), and runs each product through the two-step media + product creation with exponential backoff on 5xx/429/timeout. Failed steps are retried on next launch — the queue is the SQLite `products` table itself, so "persistent retry queue" = "the app's own database." A background sweeper reconciles any media uploaded without a product and cleans it up.

Errors never bubble to the UI as raw values. A single `error-presentation` module maps every internal failure to a plain-Spanish message and a suggested user action ("Reintentar", "Editar producto", "Contactar al dueño de la tienda"). Credentials are validated against the live store on save and never stored unless valid. Categories are fetched lazily from the store on first capture and cached locally.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `app/` (Expo Router screens) | New | `/onboarding`, `/capture`, `/queue`, `/queue/[id]`, `/sync`, `/settings` |
| `app/_layout.tsx` | New | First-launch routing into `/onboarding` vs. main app |
| `src/db/` | New | SQLite schema, migrations, prepared-statement helpers; `products` table is the retry queue |
| `src/stores/` | New | Zustand stores: capture, queue, sync, config, error |
| `src/services/woocommerce/` | New | REST client, image uploader, product creator, throttle, idempotency layer |
| `src/services/sync-worker.ts` | New | Serial sync worker, exponential backoff, persistent retry on app launch |
| `src/services/credentials.ts` | New | `expo-secure-store` wrapper + live-store validation on save |
| `src/services/orphan-media-sweeper.ts` | New | Background cleanup of uploaded media with no matching product |
| `src/services/error-presentation.ts` | New | Centralized error → plain-Spanish mapping |
| `app.json`, `eas.json` | New | Expo config, iOS Info.plist (`NSCameraUsageDescription`), EAS profiles |
| `.env`, `.env.example` | New | Local creds for dev; `.env` gitignored, `.env.example` committed |
| `README.md` | New | Public-facing: setup, any-store configuration, screenshots |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| **Retry storm on permanently broken creds** | High | Cap retry attempts per product per run; on persistent auth failure, mark product as `needs-attention` and surface a single "1 producto no se pudo subir — tocá para ver qué hacer" card. Never spin forever. |
| **Idempotency collisions if `local_id` strategy is weak** | Med | Store `local_id` as a UUIDv4 in product meta on first upload; on retry, server-side check (`GET /products?meta_key=local_id&meta_value=...`) returns existing product instead of creating a new one. |
| **Orphan-media sweeper races with in-flight uploads** | Med | Sweeper only acts on media older than N minutes with no matching product; uses a `media_id → product_id` reconciliation table in SQLite, not wall-clock alone. |
| **Plain-Spanish error coverage gaps** (some edge case shows raw text) | Med | Every error path in the sync worker MUST route through `error-presentation`; code review rule + a test that greps for HTTP/status codes in screen files. |
| **WooCommerce rate limits throttling bulk uploads** | High | Serial queue, ~1 product/sec, exponential backoff on 429/5xx |
| **Credential leakage in public repo** | Med | `.env` gitignored from day 1; `.env.example` placeholder only; `expo-secure-store` for runtime; never log creds |
| **Hardcoded `optifull.cl` creeping in** | Med | All base URLs, slugs, category IDs are user-entered config; no defaults to a real store; code review rule |
| **SQLite schema migrations breaking existing local data** | Med | Versioned `PRAGMA user_version` migrations; additive changes only in MVP; destructive migrations deferred to v2 |
| **Photo file growth filling device storage** | Low | Persist to app's documents dir (not cache); surface storage usage in settings; allow per-product image deletion pre-sync |

## Rollback Plan

Greenfield app — rollback = delete `app.json`/build artifacts and the local SQLite DB. EAS Build is cloud-based, so abandoning a release = revoke the build and unpublish. No database migration on remote systems to roll back. If sync corrupts the WooCommerce store, the app only creates `draft` products by default; user can bulk-delete drafts in WP admin. No `publish` action without explicit per-product confirmation. The orphan-media sweeper has a dry-run mode (to be confirmed in design phase) so cleanup can be inspected before destructive deletion.

## Dependencies

- Expo SDK 56 (pinned) with `expo-camera`, `expo-image-picker`, `expo-sqlite`, `expo-secure-store`, `expo-file-system`, `expo-network`
- React Native + TypeScript
- Zustand for state
- NativeWind v3 (pinned, NOT v4)
- EAS Build for cloud iOS/Android builds
- A real WooCommerce store (user-provided, configured at runtime) for end-to-end sync testing

## Success Criteria

- [ ] Capture → SQLite → Review → WooCommerce round-trip works for 10 products in a single batch
- [ ] All credentials stored in `expo-secure-store`, validated against the live store before save
- [ ] Public repo: cloning and running the README produces a generic app with no optifull.cl hardcoded
- [ ] EAS build produces a working iOS TestFlight build; Android build also succeeds
- [ ] Sync resumes correctly after app kill mid-batch (no duplicate products, no orphan media)
- [ ] Killing the app during a sync and relaunching picks up the queue without user action
- [ ] Forcing a 500 from the server shows a calm "Reintentando..." indicator — no error dialog, no jargon
- [ ] Invalid credentials on onboarding show "Las credenciales no funcionan, verificá con el dueño de la tienda" and never get saved
- [ ] Editing a price in the review screen requires a "Confirmar precio" tap before the product becomes syncable
- [ ] No HTTP code, stack trace, or English error string appears anywhere in the UI (verified by grep in CI)
- [ ] `.env` and any file with real Consumer Key/Secret is gitignored

## Open Questions (to resolve in design phase)

- Exact exponential-backoff curve (e.g., 1s → 2s → 4s → 8s, cap at 60s, max N attempts per run before surfacing)
- How long a product stays in `needs-attention` state before being auto-retried vs. surfaced
- Whether the orphan-media sweeper needs a `dry-run` toggle in settings for paranoid users
- Whether the "Pausar sincronización" toggle should be global or per-product
- UI placement of the progress indicator ("Subiendo producto 3 de 12...") — sync screen vs. persistent banner
