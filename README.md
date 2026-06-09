# Etiquetador de Productos

Mobile app for photographing products at a small store and pushing them to a WooCommerce REST v3 backend as drafts, with a calm Spanish UI built for a non-technical user.

> **Status**: WU-1 (foundation slice) landed. The error-presentation contract is the only thing other work units depend on; everything else is scaffolded-but-empty.

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
