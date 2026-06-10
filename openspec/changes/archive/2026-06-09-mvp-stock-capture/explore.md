# Explore — mvp-stock-capture

> Generated 2026-06-08. Validates stack and integration approach before proposal/spec phases.

## Stack validation (Expo SDK 56, 2026)

| Library | Status | Notes |
|---|---|---|
| `expo-camera` | OK | Use `CameraView` component. iOS needs `NSCameraUsageDescription`. Photos default to cache → must persist with `expo-file-system`. |
| `expo-image-picker` | OK | For future "pick from gallery" feature, not for capture. |
| `expo-sqlite` | OK | `SQLiteProvider` + `useSQLiteContext()` pattern. Use tagged template `db.sql\`\`` API. Enable WAL. |
| Drizzle ORM | DEFER | Not needed for MVP. Raw prepared statements are fine. |
| NativeWind | OK (pin v3) | v4 has migration issues. Pin `nativewind@^3` in package.json. |
| EAS Build | OK | Free tier: 30 builds/month. Sufficient for MVP. |

## WooCommerce REST API v3 — critical findings

**Auth**: Consumer Key + Consumer Secret (NOT WordPress Application Passwords). HTTPS Basic Auth.

**Image upload is TWO STEPS**:
1. `POST /wp-json/wp/v2/media` with binary (multipart/form-data) → returns `{id}`
2. `POST /wp-json/wc/v3/products` with `images: [{id: <media_id>}]`

**Product status**: `draft` (default) → `publish` (live). User can choose per-product during review.

**Rate limits**: Not officially documented. Be safe with 5-10 req/s. Bulk upload of N products = 2N requests.

**Pagination**: `?per_page=N&page=N`, headers `X-WP-Total` and `X-WP-TotalPages`.

**Errors**: HTTP 4xx/5xx + JSON `{code, message, data: {status}}`.

## Review-queue design: VALIDATED

User's choice (b) is the right call:
- (a) inline edit-on-capture: REJECTED — too much friction during bulk capture
- **(b) save → review → sync: ACCEPTED** — matches real workflow
- (c) save → sync-to-draft → edit on server: REJECTED — pushes complexity out of app

## Open questions (answer before proposal phase)

1. **WooCommerce auth**: Consumer Key + Consumer Secret (recommended) or WordPress Application Passwords?
2. **Currency**: Integer-only (CLP-style) or decimals accepted but stripped?
3. **Images per product**: Single (MVP) or multi-image gallery?
4. **SKU generation**: Auto (UUID v4) or user-typed or per-store counter?
5. **Sync trigger**: Manual button only, or auto-on-WiFi + manual override?
6. **Category assignment**: Pick from store categories during capture, or during review, or skip for MVP?
7. **Description field**: Include in capture screen, or empty for MVP?
8. **Android**: iOS-only for MVP, or also build for Android (free EAS quota allows both)?

## Risks

- Orphan media items: if image upload succeeds but product creation fails, we have a stray media file in WP. Need rollback or cleanup.
- Bulk upload hits rate limits. Need throttling (e.g., 1 product/sec, batch with delays).
- Expo SDK version drift: pin to SDK 56 in package.json to avoid surprise breaking changes.
- NativeWind v3 vs v4: explicitly pin to v3.

## Deferred (do NOT work on in this change)

- OpenDesigner MCP setup
- Multi-user, auth, roles
- Cloud sync, web admin
- E2E tests (defer to v2)
