# Work-Unit Commit Plan — WU-1

> **Status**: This is the commit sequence I would have made if the directory were a git repo. The repo is not yet `git init`'d, so no commits exist on disk. Apply these once you initialize git.

> **Workflow**: each commit is one work unit. Reviewer reads commit-by-commit and gets a coherent story. Rollback of any single commit leaves the repo in a runnable state (or, where noted, an explicit scaffolding-in-progress state).

> **Convention**: conventional commits (`feat:`, `chore:`, `test:`, `docs:`, `build:`, `ci:`, `style:`, `refactor:`). Bodies explain the WHY, not the file list (the diff shows the file list).

> **Skill source**: `~/.config/opencode/skills/work-unit-commits/SKILL.md` — "Commit by work unit, not by file type. Keep tests with code. Tell a story. Future PR-ready."

---

## Branching

Suggested branch for WU-1: `chore/wu-1-foundation`. PR base: `main`. Merge strategy: squash (keeps the WU atomic in history) or rebase-merge (keeps each commit). Either is fine; squash is recommended for the first PR.

---

## Commit sequence (7 commits)

### 1. `chore: bootstrap Expo SDK 56 + React Native 0.85 + TypeScript strict project`

> **Work unit**: 1.1 (project init). Establishes the toolchain. No app logic yet.

**Files**:
- `package.json`
- `tsconfig.json`
- `app.json`
- `app/_layout.tsx` (placeholder)
- `app/index.tsx` (placeholder)
- `assets/README.md` (icon placeholders documented)
- `.gitignore`
- `.env.example`

**Why this is a unit**: from zero to "the project can be installed and `expo start` boots a placeholder screen." Locks SDK + RN + React versions so every subsequent commit has a stable baseline.

**Acceptance check**: `npx expo install --check` reports no version drift; `tsc --noEmit` runs cleanly against the placeholder screen; `eas.json` exists with the three profiles.

---

### 2. `build: configure Metro + Babel + Tailwind tokens (NativeWind deferred)`

> **Work unit**: 1.3 (tooling baseline, partial — Metro/Babel/Tailwind piece). ESLint/Prettier/Jest land in commit 4; this one isolates the bundler config so a reviewer can audit it independently.

**Files**:
- `metro.config.js`
- `babel.config.js`
- `tailwind.config.js`
- `src/ui/theme.ts` (calm palette seed)

**Why this is a unit**: bundler config and theme tokens are owned by the same mental model (how the code is transformed + how it looks). Committing them together keeps the build green at HEAD even if a future NativeWind upgrade lands mid-PR.

**Deferred-decision note (visible in the commit body)**: NativeWind v3 is no longer published as a stable npm release (latest tag is `4.2.5`; v3 only exists as nightly commit-hash snapshots). The `tailwind.config.js` is wired for v3 (the `presets: [require('nativewind/preset')]` line is commented out, ready to uncomment when a v3-equivalent is chosen). `metro.config.js` carries the same `transformerWithNW` switch in a comment. **Tradeoff**: deferring the choice means WU-2+ cannot yet use `className="..."` syntax; we use RN `StyleSheet` for now. **Risk surfaced in apply-progress**.

**Acceptance check**: `metro.config.js` exports a valid `MetroConfig`; `babel.config.js` presets include `babel-preset-expo`; `tailwind.config.js` parses with the standalone `tailwindcss` 3.4.17 dev dep.

---

### 3. `feat(error-presentation): introduce the 11-key Spanish error catalog`

> **Work unit**: 2.1 + 2.2 (catalog + presenter). The catalog is the most important contract in WU-1 — every other module imports from this file.

**Files**:
- `src/error-presentation/types.ts`
- `src/error-presentation/catalog.ts`
- `src/error-presentation/presenter.ts`
- `src/error-presentation/index.ts` (barrel)

**Why this is a unit**: the catalog is a stable, self-contained API surface. The classifier is a separate work unit (commit 4) because it has its own test matrix and its own risk profile.

**What it guarantees**:
- 11 keys, each with `{ title, message, severity, action? }`.
- Voseo, no "!", no jargon, sentences ≤ 12 words.
- The `presentError(errOrKey, params)` function returns a fresh `CatalogEntry` — never a reference into the catalog.
- A `__DEV__` console.warn logs the raw error + 6-char base36 `correlationId`.
- `WooError`, `ValidationError`, `MigrationError` are exported as the typed sentinels the WU-2 infra layer will throw.

**Acceptance check**: the spec's three named scenarios (`credenciales-invalidas`, `sin-conexion`, `error-inesperado`) match word-for-word; the presenter never returns the raw error message.

---

### 4. `feat(error-presentation): add the SOLE classifier (sync throws raw, presenter classifies)`

> **Work unit**: 2.3 (classifier). The classifier is the single decision point (Design §2 Decision + §10 + error-presentation spec R3, R4, R6).

**Files**:
- `src/error-presentation/classifier.ts`

**Why this is a unit**: the classifier has its own test matrix (12 input shapes → 11 keys). Coupling it to the catalog would inflate the diff and obscure the rule order in review.

**What it guarantees**:
- 401/403 → `credenciales-invalidas`
- 429 → `limite-de-tasa`
- 5xx → `servidor-no-disponible`
- 404 → `tienda-no-accesible`
- `ValidationError` → `datos-invalidos`
- `TypeError: Network request failed` / `AbortError` / fetch-with-network → `sin-conexion`
- EACCES / EPERM → `almacenamiento-error`
- `CAMERA_PERMISSION_DENIED` → `camara-permiso-denegado`
- `file does not exist` / `image not found` → `imagen-faltante`
- anything else → `error-inesperado`
- Always returns a 6-char base36 `correlationId` and preserves the raw `cause` for the dev console.

**Acceptance check**: every rule in Design §10 has at least one test in `__tests__/classifier.test.ts`.

---

### 5. `test(error-presentation): catalog structure + no-jargon lint + spec-asserted strings`

> **Work unit**: 1.7 (catalog tests). Lint lives in the test suite because the catalog is a data object, not a build step. CI grep (commit 6) handles the screen-side guard.

**Files**:
- `src/error-presentation/__tests__/catalog.test.ts`
- `src/error-presentation/__tests__/classifier.test.ts`
- `src/error-presentation/__tests__/presenter.test.ts`
- `src/__tests__/smoke.test.ts`

**Why this is a unit**: tests-only commit. The catalog classifier + presenter are exercised together; adding a new key in a future WU requires updating the catalog's `it.each` matrix.

**What it guarantees**:
- 11 keys, no duplicates, all four fields present.
- Exact-match for the 3 spec-asserted entries (`credenciales-invalidas`, `sin-conexion`, `error-inesperado`).
- No jargon tokens (HTTP, JSON, API, WooCommerce, token, sync, fetch, TypeError, undefined, optifull, Exception, stack).
- No `\b\d{3}\b` regex hits in any title/message.
- No `!` in any title/message.
- Sentence length budget.
- Classifier matrix: 401, 403, 404, 429, 500, 502, 503, network, abort, EACCES, EPERM, camera permission, file missing, validation, fallback.
- Presenter: catalog lookup, key-not-found fallback, param-aware entries, isolation from raw text.
- Smoke test: arithmetic, async/await, `@/` alias resolution to the error-presentation module.

**Acceptance check**: `npm test` is green for all four files.

---

### 6. `ci: forbid leaked jargon + HTTP codes in app/ and src/`

> **Work unit**: 1.4 (CI grep guard). The second layer of the spec's defense-in-depth (error-presentation R1, R5).

**Files**:
- `scripts/ci-error-grep.sh`
- `scripts/ci-no-credentials.sh` (placeholder for WU-5)
- `package.json` (adds `test:ci` script)

**Why this is a unit**: the guard is a pure-build-time check; it doesn't touch any runtime code. Wiring it into `npm run test:ci` is part of the same work.

**What it guarantees**:
- Any `app/**` or `src/**` file (excluding `__tests__/`, `node_modules/`, `.expo/`, `dist/`, `coverage/`, `assets/`, `scripts/`) fails the build on `\b\d{3}\b`, `HTTP`, `JSON`, `fetch failed`, `TypeError`, `undefined is not`, `optifull.cl`.
- The script is POSIX bash (no ripgrep dependency), so it runs on the user's Windows-bash, macOS, Linux, and the GitHub Actions runner unchanged.

**Acceptance check**: `bash scripts/ci-error-grep.sh` exits 0 on a clean tree; exits non-zero with a clear per-file line-citation when a forbidden pattern is planted.

---

### 7. `chore: ESLint 9 flat config + Prettier + Jest with RNTL`

> **Work unit**: 1.3 (tooling baseline, rest of it — lint + format + test runner). Lifted out of commit 2 so a reviewer can audit lint rules independently of bundler config.

**Files**:
- `eslint.config.js`
- `.prettierrc`
- `jest.config.js`
- `jest.setup.ts`

**Why this is a unit**: lint, format, and test-runner configs are the third pillar of the toolchain (after bundler in commit 2 and build in commit 1). Keeping them separate makes a future "upgrade ESLint 9 → 10" commit trivial.

**What it guarantees**:
- `eslint .` is green on the WU-1 source. Rules tightened beyond `eslint-config-expo`:
  - `@typescript-eslint/no-explicit-any: error` (the design forbids `any`).
  - `no-console: warn` with allowlist for `warn`/`error`/`info` (the presenter uses `console.warn`).
  - `no-restricted-syntax` against `console.log` (loud stderr signal for accidental debug logs).
- `prettier --write` produces stable output.
- `jest.config.js` uses the `jest-expo` preset, mocks `expo-secure-store`, `expo-sqlite`, `expo-camera`, `expo-image-picker`, `react-native-reanimated`, polyfills `crypto.randomUUID` for older Node test environments.
- `transformIgnorePatterns` covers NativeWind, Reanimated, Worklets, and the autolinked Expo modules.

**Acceptance check**: `npm run lint` is green; `npm test` is green; `npm run test:ci` is green (orchestrates lint + typecheck + test + grep guard).

---

## What is NOT in WU-1 (deferred by design)

- `src/db/*` — WU-2 (tasks 2.1–2.3)
- `src/infra/*` — WU-2 (task 2.4)
- `src/services/woocommerce/*` — WU-2 (tasks 2.5–2.6) + WU-4 (tasks 4.1–4.2)
- `src/stores/*` — WU-3 (3.1) + WU-4 (4.4)
- `src/domain/*` — WU-2 (task 2.8)
- `src/ui/components/*` — WU-3 + WU-4
- Screens: `/onboarding`, `/(tabs)/capture`, `/(tabs)/queue`, `/(tabs)/queue/[id]`, `/(tabs)/sync`, `/(tabs)/settings` — WU-2 (onboarding/settings) and WU-3/4 (capture/queue/sync)

The placeholder `app/_layout.tsx` and `app/index.tsx` are intentionally minimal so WU-2 can replace them with the real first-launch routing without merge conflict.

---

## Risk register (read these BEFORE applying the commits)

| Risk | Mitigation |
|---|---|
| NativeWind v3 unavailable on npm (latest = v4.2.5; v3 only as nightly snapshots) | `tailwind.config.js` and `metro.config.js` carry commented-out hooks; `tailwindcss@3.4.17` is a dev dep so the config is valid. **Decision pending** before WU-2 lands. |
| `npx create-expo-app` was NOT run; package versions are pinned by hand | All pins were cross-checked against `npm view` for both `latest` and SDK 56's `expo install --check` matrix. Run `npx expo install --check` after `npm install` to surface drift. |
| The user's `.env` file contains real `optifull.cl` credentials | `.gitignore` includes `.env` from day one (commit 1). The user MUST verify `git status` doesn't list `.env` after `git init`. |
| Nativewind v3 caveat: SDK 56 ships with React Native 0.85.2 (a new arch build). If v3 ever comes back, confirm Reanimated 4.1.x compatibility | The `babel.config.js` already wires `react-native-worklets/plugin` (Reanimated 4's runtime requirement). |
| `jest-expo@56.x` may pin Reanimated 3 transitively; Reanimated 4 is in our deps | If `npm install` warns about a peer mismatch, prefer `npm install --legacy-peer-deps`. Document in apply-progress. |

---

## Verification recipe (post-apply)

```bash
# After `git init` + the 7 commits:
git log --oneline   # expect 7 entries in reverse-chronological order
npm install
npx expo install --check
npm run typecheck
npm test            # expect 4 test files green
npm run lint
npm run test:ci     # expect all of the above + the grep guard green
```

When the user (or the verify phase) wants a single-PR squash merge, the squash commit message is:

> `chore(wu-1): bootstrap Expo SDK 56 + tooling + error-presentation catalog`
>
> Establishes the project's foundation: toolchain, bundler, lint, test runner, CI guard, and the typed Spanish error catalog that every other work unit imports from. NativeWind v3 is deferred (latest npm release is v4.2.5; v3 only exists as nightly snapshots); the project's screens will use RN StyleSheet for now and a follow-up decision is required before WU-2.
