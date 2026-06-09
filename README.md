# Etiquetador de Productos

Mobile app for photographing products at a small store and pushing them to a WooCommerce REST v3 backend as drafts, with a calm Spanish UI built for a non-technical user.

> **Status**: WU-1 through WU-4 complete. The app captures products, queues them, syncs to WooCommerce, and presents errors in calm Spanish.

<!-- screenshots coming soon -->

## What's in this slice (WU-1)

- Expo SDK 56 + React Native 0.85.2 + React 19.2.0 + TypeScript 5.9.2 (strict mode).
- File-based routing via `expo-router` (placeholder `_layout.tsx` + `index.tsx`).
- `expo-secure-store`, `expo-sqlite`, `expo-camera`, `expo-image-picker`, `zustand` pinned.
- Jest + `@testing-library/react-native` + `jest-expo` preset.
- ESLint 9 (flat config) + Prettier.
- Tailwind v3 config (no NativeWind runtime — see `COMMITS.md` for the deferred-decision note).
- EAS Build profiles: `development`, `preview`, `production`.
- The `error-presentation` module: 11-key catalog + classifier + presenter, with the no-jargon lint, exhaustive spec-string assertions, and a 6-char `correlationId` for dev-console field debugging.
- `scripts/ci-error-grep.sh` — fails the build on any `app/` or `src/` file containing forbidden patterns (`\b\d{3}\b`, `HTTP`, `JSON`, `fetch failed`, `TypeError`, `undefined is not`, `optifull.cl`).

## What's NOT in this slice

- Local SQLite persistence (WU-2)
- Store-config + onboarding screens (WU-2)
- Capture, review-queue, sync screens (WU-3, WU-4)
- Sync worker + WC REST client (WU-4)
- EAS submit profiles + README polish (WU-5)

See `openspec/changes/mvp-stock-capture/tasks.md` for the full plan.

## Design Decisions

1. **Auto-sync on Wi-Fi** — The sync worker starts automatically when the device connects to Wi-Fi. This is the default because the user's store has limited bandwidth and manual syncing is error-prone. The preference is persisted in `app_config` and can be toggled in Settings.

2. **Global pause** — A single pause toggle controls the entire sync pipeline. When paused, neither auto-sync nor manual sync proceeds. The flag lives in `app_config` and is checked at every worker checkpoint (start, per-product iteration).

3. **Draft-by-default** — Products are published as WooCommerce drafts, not live. The user must explicitly set `publishOnSync` to push a product as published. This prevents accidental public listing of incomplete products.

4. **Idempotency** — The upload pipeline performs a pre-check (`GET /wc/v3/products?meta_key=local_id`) before creating a product. If the server already has the product (e.g. from a previous interrupted run), the worker short-circuits to `synced` without a duplicate POST.

5. **Price gate** — The review queue requires the user to confirm the price before a product can be synced. This prevents the most common mistake: uploading a product with a wrong price. The gate compares original vs. current price and shows the delta.

## Local setup (after the user runs `git init`)

```bash
# 1. Install
npm install

# 2. Run lint + typecheck + tests + the CI grep guard
npm run test:ci

# 3. Start the dev client (boots to the WU-1 placeholder screen)
npm start

# 4. Copy .env.example → .env, fill in WC_STORE_URL / WC_CONSUMER_KEY / WC_CONSUMER_SECRET
cp .env.example .env
# then edit .env
```

## Project layout

```
.
├── app/                    # Expo Router screens (placeholder in WU-1)
├── src/
│   ├── db/                 # (WU-2) SQLite layer
│   ├── error-presentation/ # ✅ The single source of truth for Spanish errors
│   ├── infra/              # (WU-2) fetch wrapper, secure-store, file-system
│   ├── services/           # (WU-2 + WU-4) WC client, sync worker, sweeper
│   ├── stores/             # (WU-3 + WU-4) Zustand stores
│   ├── domain/             # (WU-2) pure types + backoff curve
│   ├── ui/                 # (WU-3) presenter components
│   ├── __tests__/          # cross-cutting test files
│   └── error-presentation/__tests__/  # ✅ Catalog / classifier / presenter tests
├── scripts/                # ✅ CI grep guard
├── openspec/changes/mvp-stock-capture/  # SDD artifacts
└── package.json
```

## Architectural rules (and where they live)

| Rule | Owner | File |
|---|---|---|
| All Spanish user-facing strings | `error-presentation` | `src/error-presentation/catalog.ts` |
| All error classification | `error-presentation` | `src/error-presentation/classifier.ts` |
| The only public entry points | barrel | `src/error-presentation/index.ts` |
| WC creds storage | `expo-secure-store` (NOT a store) | (WU-2) `src/infra/secure-store.ts` |
| Network retries | `http-client` (transport) + `sync-worker` (logic) | (WU-2 / WU-4) |
| Status state machine | `domain` | (WU-2) `src/domain/status.ts` |

## Forbidden patterns (CI guard)

The `scripts/ci-error-grep.sh` script fails the build if `app/**` or `src/**` (excluding `__tests__/`, `node_modules/`, etc.) contains:

- `\b\d{3}\b` — HTTP status codes
- `HTTP`, `JSON` — English jargon
- `fetch failed`, `TypeError`, `undefined is not` — raw runtime errors
- `optifull.cl` — the user's current store domain (this is a generic repo)

Add new patterns in the script's `PATTERNS` line; tests stay green.
