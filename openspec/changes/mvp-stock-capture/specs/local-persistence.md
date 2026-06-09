# Spec: local-persistence

## Purpose

The local-persistence capability is the source of truth for the entire app. Every captured product, every captured image, and every sync attempt lives in an on-device SQLite database. The database survives app restarts, app upgrades (via versioned migrations), and process kills mid-sync. It also doubles as the persistent retry queue: a product is "pending sync" as long as the database says so, regardless of whether the app is currently running. The remote WooCommerce store is NEVER authoritative; if sync fails, the product is still safely in the phone.

## ADDED Requirements

### Requirement: SQLite database with WAL and versioned migrations

The app MUST persist all product, image, and sync-state data in a local SQLite database opened with WAL (write-ahead logging) enabled. Schema changes MUST be applied through versioned migrations driven by `PRAGMA user_version`.

#### Scenario: First launch creates the schema

- GIVEN the app is launched for the first time on a device
- WHEN the SQLite database is opened
- THEN all required tables (products, product_images, sync_attempts, store_categories, media_uploads) are created
- AND `PRAGMA user_version` reflects the latest schema version
- AND WAL mode is enabled

#### Scenario: App upgrade with additive migration

- GIVEN the user is on schema version 1
- AND the new app release ships schema version 2 with a new nullable column
- WHEN the user upgrades and relaunches
- THEN the migration from v1 to v2 runs
- AND all existing rows are preserved with the new column defaulted to NULL
- AND no data is lost

#### Scenario: Migration failure on launch

- GIVEN a migration script fails partway through execution
- WHEN the launch sequence detects the failure
- THEN the database is NOT silently left in a half-migrated state
- AND the launch sequence emits the classification key `almacenamiento-error` to the user-facing surface
- AND the presenter renders the title, message, severity, and suggested action from its own catalog
- AND the user is blocked from capturing new products to prevent further corruption

### Requirement: Products table as the source of truth

The `products` table MUST be the authoritative store of every captured product. A product exists locally as soon as the user taps save on the capture screen, regardless of sync state.

#### Scenario: Product exists in DB even when sync fails

- GIVEN the user has saved a product
- WHEN the sync attempt fails for any reason (network, 5xx, auth)
- THEN the row remains in the `products` table
- AND its sync state is set to a recoverable value (e.g., `pending` or `needs-attention`)
- AND the product is still visible in the review queue

#### Scenario: Required product columns

- GIVEN the products table schema
- THEN the following columns MUST exist: `local_id` (UUIDv4, unique), `name` (text), `price` (integer), `category_id` (integer, nullable until store categories load), `category_name` (text, for display without re-fetching), `description` (text, nullable), `status` (enum: `pending` | `ready` | `syncing` | `synced` | `failed` | `needs-attention`), `wc_product_id` (integer, nullable, set on successful sync), `created_at`, `updated_at`

### Requirement: Product images table with stable file references

The `product_images` table MUST store one row per image attached to a product, including a stable reference to the file in the app's documents directory. The file path MUST survive app restarts.

#### Scenario: Multiple images per product

- GIVEN a product has three attached images
- WHEN the rows are read
- THEN three rows exist in `product_images` for that product
- AND each row references a real file in the documents directory
- AND each row has a `position` integer for ordering

#### Scenario: Image file missing on disk

- GIVEN a row exists in `product_images`
- WHEN the sync worker reads it and finds the file is missing on disk
- THEN the row is flagged as `missing` (a `sync_state` column or equivalent)
- AND the product is NOT silently sent to the store with no image
- AND a single `needs-attention` card surfaces for the user, classified as `imagen-faltante` and rendered by the `review-queue` presenter

#### Scenario: Image deletion before sync

- GIVEN a product is in the review queue and not yet synced
- WHEN the user removes an image from the product
- THEN the corresponding `product_images` row is deleted
- AND the file is removed from the documents directory
- AND the product is still syncable with the remaining images

### Requirement: Sync attempts table for retry accounting

The `sync_attempts` table MUST record every sync attempt for a product, with timestamp, error class, and HTTP status, so the worker can apply per-product attempt caps and exponential backoff.

#### Scenario: Attempt recorded on transient failure

- GIVEN a sync attempt fails with a 503 response
- WHEN the worker records the attempt
- THEN a row is inserted in `sync_attempts` with: `product_local_id`, `attempted_at`, `error_class = transient`, `http_status = 503`
- AND the products table is updated to `status = pending` (or equivalent recoverable state)

#### Scenario: Attempt recorded on persistent failure

- GIVEN a sync attempt fails with a 401 (invalid credentials)
- WHEN the worker records the attempt
- THEN a row is inserted in `sync_attempts` with `error_class = auth` and `http_status = 401`
- AND the product is moved to `status = needs-attention`
- AND no further automatic attempts are scheduled for that product until the user resolves the credential issue

### Requirement: Media uploads reconciliation table

The `media_uploads` table MUST track every media item uploaded to WooCommerce, including which product (if any) eventually consumed it, so the orphan-media sweeper can identify uploads that never got attached to a product.

#### Scenario: Successful media + product pair

- GIVEN a media item with remote id 1234 is uploaded for product with `local_id = "uuid-A"`
- WHEN the product is successfully created and references media 1234
- THEN the `media_uploads` row is updated with `attached_product_local_id = "uuid-A"` and `status = attached`

#### Scenario: Media uploaded but product creation fails

- GIVEN a media item with remote id 1234 is uploaded
- AND the subsequent product creation request fails
- WHEN the failure is recorded
- THEN the `media_uploads` row has `status = orphan` and `attached_product_local_id = NULL`
- AND the orphan-media sweeper can later identify and delete it

### Requirement: Categories cache for offline use

The `store_categories` table MUST cache the categories fetched from the WooCommerce store, so the capture screen can offer a category list even when offline.

#### Scenario: Categories cached after fetch

- GIVEN the app fetches categories from the store for the first time
- WHEN the fetch returns
- THEN every category is stored in `store_categories` with its remote id, name, parent id, and `cached_at` timestamp
- AND the capture screen reads from this table rather than calling the network

#### Scenario: Capture offline with stale categories

- GIVEN categories were cached one week ago
- AND the device is now offline
- WHEN the user opens the capture screen
- THEN the cached categories are still offered
- AND a non-blocking hint appears: "Las categorías pueden estar desactualizadas."

### Requirement: Database is the persistent retry queue

A product is "pending sync" as long as its row in the products table has `status = pending` (or any recoverable non-final state). No separate in-memory queue is required; the database IS the queue.

#### Scenario: App killed mid-sync resumes on relaunch

- GIVEN the sync worker is uploading product B and the app is killed
- WHEN the user relaunches the app
- THEN the worker re-reads the products table
- AND finds product B in a non-final state
- AND resumes the sync from the next pending product (using `local_id` to avoid duplicates)

#### Scenario: App upgraded during pending sync

- GIVEN the app has 12 products with `status = pending`
- AND the user upgrades the app
- WHEN the user relaunches
- THEN the pending products are still in the products table
- AND the new app version picks them up and continues syncing
- AND no product is lost across the upgrade

### Requirement: Error surfacing is delegated to the presenter

The local-persistence layer MUST classify the failures it can observe (migration failure, missing image file on disk, any unexpected DB exception surfaced to the user) and pass that classification to the user-facing surface. The local-persistence layer MUST own the decision of "is this recoverable (silent retry) or terminal (block and surface)?" and MUST own the decision of "which row is now in `needs-attention`?". The local-persistence layer MUST NOT own the user-facing Spanish text, the severity, or the suggested action — those are the responsibility of the `error-presentation` spec. The local-persistence layer MUST NOT inline a Spanish or English error string in any user-visible surface; it persists only the classification key and the offending row reference, and the presenter renders.

#### Scenario: Migration failure classified and rendered centrally

- GIVEN a migration script fails partway through execution
- WHEN the launch sequence detects the failure
- THEN the local-persistence layer emits the classification key `almacenamiento-error`
- AND the presenter renders the title, message, severity, and action from its own catalog
- AND the local-persistence layer has no opinion on what Spanish text the user sees

#### Scenario: Missing image on disk emits a needs-attention classification

- GIVEN a row in `product_images` references a file that is no longer on disk
- WHEN the sync worker encounters the missing file
- THEN the worker records `sync_state = missing` on the row
- AND emits the classification key `imagen-faltante` to the surface that renders the product
- AND the `review-queue` presenter renders the explanation and the available actions from its own catalog

## Open Questions

- Exact column types (TEXT vs INTEGER) for `status` and `error_class` enums — likely stored as TEXT with a CHECK constraint, to be decided in design.
- Whether to keep a `sync_attempts` row forever or prune older than N days (the proposal implies a soft cap per product).
- Whether `store_categories` should auto-refresh on a schedule, or only on first launch + on demand.
- Whether the `error-presentation` catalog should be extended with a dedicated `almacenamiento-error` key for migration / DB-level failures, or whether these should fall through to `error-inesperado`. Spec assumes a dedicated key is needed because the recovery action (block new captures) differs from a generic unexpected error; design should confirm.
- Whether the `error-presentation` catalog should be extended with a dedicated `imagen-faltante` key for the "image file missing on disk" case, or whether the case can be expressed through a `datos-invalidos` parameterization. Spec assumes a dedicated key; design should confirm.
