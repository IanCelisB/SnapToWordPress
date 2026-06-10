# Spec: woocommerce-sync

## Purpose

The woocommerce-sync capability is the only part of the app that talks to a remote store. It takes products the user has approved in the review queue and pushes them to a WooCommerce store via the REST API, handling every failure mode silently: network blips, server hiccups, rate limits, and partial success. It enforces idempotency so retries never create duplicates, throttles requests to respect the store's rate limits, persists its queue across app restarts, and silently cleans up any media items it uploaded but never managed to attach to a product. The user is never shown a raw HTTP code, a stack trace, or an English error string; they only ever see calm, plain-Spanish progress, and at most one "necesita tu atención" card per stuck product.

## ADDED Requirements

### Requirement: Two-step product creation (media, then product)

The sync worker MUST create a product on WooCommerce via two REST calls in order: first upload each selected image to `POST /wp-json/wp/v2/media` (binary), then create the product with `POST /wp-json/wc/v3/products` referencing the uploaded media ids. The product MUST NOT be created unless all its selected media uploads succeeded; partial success is not allowed for a single product.

#### Scenario: Successful product creation

- GIVEN a product with two selected images and valid credentials
- WHEN the sync worker picks it up
- THEN it uploads the first image to `/wp/v2/media` and receives a media id
- AND uploads the second image to `/wp/v2/media` and receives a media id
- AND creates the product via `/wc/v3/products` with `images: [{id: <media1>}, {id: <media2>}]`
- AND on success, the product's `wc_product_id` is stored locally
- AND its status is set to `synced`

#### Scenario: Second image upload fails after first succeeded

- GIVEN a product with two images
- AND the first image uploads successfully
- WHEN the second image upload fails with a transient error
- THEN the first image is treated as orphan
- AND the product is NOT created
- AND the orphan-media sweeper will clean up the first image in the background
- AND the product's status is set to a recoverable state (e.g., `pending`)

#### Scenario: Product creation fails after all media uploaded

- GIVEN a product with two images, both successfully uploaded
- WHEN the product creation call fails with a 5xx
- THEN both media items are marked as `orphan` in `media_uploads`
- AND the product is NOT created
- AND the orphan-media sweeper will clean up the media in the background
- AND the product's status is set to a recoverable state

### Requirement: Idempotent uploads via stable `local_id` (UUIDv4)

Every product MUST carry a stable, client-generated UUIDv4 `local_id` that is sent to the server as product meta. On every retry or resumption, the worker MUST first check the server for an existing product with the same `local_id` meta and, if found, treat the operation as already complete. This guarantees that a retried or replayed request never creates a duplicate product on the server.

#### Scenario: Retry after uncertain network succeeds without duplicate

- GIVEN a product was uploaded but the response was lost in a network timeout
- AND the worker is retrying
- WHEN the worker first runs `GET /wc/v3/products?meta_key=local_id&meta_value=<uuid>`
- THEN the server returns the existing product
- AND the worker stores the returned `wc_product_id` locally
- AND no new product is created
- AND the product's status moves to `synced`

#### Scenario: First-time upload with no existing server-side product

- GIVEN a product's `local_id` is `uuid-A`
- AND no product on the server has `local_id = uuid-A` in its meta
- WHEN the worker checks and then creates the product
- THEN exactly one product is created on the server
- AND its meta contains `local_id = uuid-A`
- AND its `wc_product_id` is stored locally

#### Scenario: Local product deleted and recreated with the same `local_id`

- GIVEN a product was synced successfully
- AND the user later deletes it from the review queue
- AND a future product happens to be created with a different `local_id` (UUIDv4 collision is practically impossible but still disallowed)
- WHEN the new product is uploaded
- THEN it MUST be uploaded as a new product, not mapped to the previously deleted one
- (Note: this scenario describes a no-op guarantee — UUIDv4 collisions are not a practical risk; the requirement is that the worker MUST NOT skip a product just because the same `local_id` once existed for a deleted product. The meta check returns "not found" for the current set of server products, and the worker proceeds to create.)

### Requirement: Serial worker with throttling

The sync worker MUST process products one at a time, serially, with a configurable delay between product completions (default ~1 product/sec, accounting for the 2N requests per product batch). It MUST NOT spawn concurrent product uploads.

#### Scenario: Worker processes a batch of 10 products

- GIVEN 10 products are in `ready` state
- WHEN the worker starts
- THEN it picks the first product and runs the two-step create
- AND waits the configured inter-product delay
- AND then picks the next product
- AND it does NOT process products in parallel

#### Scenario: Worker hits a 429 rate-limit response

- GIVEN the worker is uploading products
- WHEN a request returns HTTP 429
- THEN the worker pauses for the server's `Retry-After` interval (or the next exponential-backoff step)
- AND the product remains in `pending` state
- AND the next attempt respects the new wait

### Requirement: Silent exponential backoff for transient errors

For transient errors (5xx, 408, 429, network timeouts), the worker MUST retry with exponential backoff silently, with no user-visible dialog. Backoff MUST grow (e.g., 1s → 2s → 4s → 8s) and cap at a documented maximum (proposal suggests 60s).

#### Scenario: Server returns 503

- GIVEN a sync request returns HTTP 503
- WHEN the worker handles the response
- THEN it waits for the next backoff interval
- AND retries the same step
- AND the user sees only a calm "Reintentando..." indicator, not an error dialog

#### Scenario: Network drops mid-request

- GIVEN the worker is mid-request and the network drops
- WHEN the request times out
- THEN the worker treats it as transient
- AND waits for the next backoff interval
- AND retries
- AND no user-visible error is shown for a transient network blip

#### Scenario: Persistent 5xx still retries until per-product cap

- GIVEN a product has been retried N times with 5xx (per-product attempt cap)
- WHEN the cap is reached
- THEN the product is moved to `needs-attention` state
- AND a single "1 producto no se pudo subir — tocá para ver qué hacer" card is surfaced
- AND further automatic attempts are suspended for that product until the user takes action

### Requirement: Persistent retry queue (the products table IS the queue)

The sync queue MUST persist across app restarts. Killing the app, force-quitting it, or letting the device sleep MUST NOT lose pending work. The next launch MUST resume from the next pending product.

#### Scenario: App killed mid-batch

- GIVEN the worker is uploading product 3 of 10
- WHEN the user kills the app
- THEN products 1 and 2 remain in `synced`
- AND product 3 and beyond remain in `pending` or `syncing`
- AND on relaunch, the worker resumes from product 3 (or product 4 if 3's partial upload landed on the server — verified via `local_id` lookup)

#### Scenario: App upgraded during pending sync

- GIVEN the app has 12 pending products
- AND the user upgrades the app
- WHEN the user relaunches
- THEN the pending products are still in the products table
- AND the new worker version picks them up and continues

#### Scenario: Device offline for a long period

- GIVEN the user has 5 products in `ready` state
- AND the device is offline for two days
- WHEN the device comes back online
- THEN the worker resumes syncing the 5 products
- AND no product is dropped or skipped

### Requirement: Automatic orphan-media cleanup

Any media item uploaded to the store that is not attached to a successfully created product MUST be deleted from the store in the background, with no user-visible error.

#### Scenario: Orphan media older than N minutes is deleted

- GIVEN a media item is in `media_uploads` with `status = orphan`
- AND it has been orphan for longer than the sweeper threshold (e.g., 5 minutes)
- WHEN the sweeper runs
- THEN it issues `DELETE /wp-json/wp/v2/media/<id>` with `force = true`
- AND the row is removed from `media_uploads`
- AND no user-visible notification is shown

#### Scenario: Sweeper does not race with in-flight uploads

- GIVEN a media item was uploaded 30 seconds ago
- AND a product creation is still in progress
- WHEN the sweeper runs
- THEN it MUST NOT delete the media
- AND it only acts on media older than the threshold with no attached product

#### Scenario: Sweeper handles delete failure

- GIVEN the sweeper tries to delete orphan media
- WHEN the delete request returns 5xx
- THEN the sweeper records the failure
- AND retries the delete on the next sweeper run (with its own backoff)
- AND no user-visible error is shown

### Requirement: Per-product attempt cap to prevent retry storms

Each product MUST have a documented per-run attempt cap. Once exceeded, the product is moved to `needs-attention` and a single plain-Spanish card is surfaced. The worker MUST NOT spin forever on a single broken product.

#### Scenario: Persistent auth failure caps attempts

- GIVEN the credentials are invalid (401)
- AND a product is retried M times (per-run cap, default to be decided in design)
- WHEN the cap is reached
- THEN the product is moved to `needs-attention`
- AND the worker moves on to the next product (it does NOT block the queue on one bad product)
- AND a single card is surfaced in the review screen: "1 producto no se pudo subir — tocá para ver qué hacer"

#### Scenario: User resolves the issue and the product is re-queued

- GIVEN a product is in `needs-attention` due to invalid credentials
- AND the user updates the credentials in settings
- WHEN the user taps "Reintentar" on the card
- THEN the product's status is reset to `ready` (or `pending`)
- AND the next worker run attempts it again

### Requirement: Error classification is delegated to the presenter

The sync worker MUST classify the raw failures it observes (HTTP status, network errors, validation errors, unexpected exceptions) and pass that classification to the user-facing surface. The worker MUST own the decision of "is this transient (silent retry) or terminal (surface to the user)?" and MUST own the decision of "which product is now in `needs-attention`?". The worker MUST NOT own the user-facing Spanish text, the severity, or the suggested action — those are the responsibility of the `error-presentation` spec. The worker MUST NOT inline a Spanish or English error string in any state it persists; it persists only the classification key.

#### Scenario: Worker classifies a 401 and asks the presenter to render

- GIVEN the worker hits a 401
- WHEN the worker decides this is terminal for the current product
- THEN the worker surfaces the classification key `"credenciales-invalidas"` to the user-facing surface
- AND the presenter renders the title, message, severity, and action from its own catalog
- AND the worker has no opinion on what Spanish text the user sees

#### Scenario: Worker keeps transient errors silent

- GIVEN the worker hits a network timeout or 5xx within the attempt cap
- WHEN the worker decides this is transient
- THEN no user-facing error is rendered at all (the worker just retries silently)
- AND the presenter is not consulted

#### Scenario: Worker surfaces a needs-attention card via the presenter

- GIVEN a product exhausts its per-run attempt cap
- WHEN the worker moves on to the next product
- THEN the worker emits a single classification key for the card (e.g. `"producto-bloqueado"`)
- AND the presenter renders it as "1 producto no se pudo subir — tocá para ver qué hacer"
- AND the worker does not own the phrasing

## Open Questions

- Exact exponential backoff curve and per-run attempt cap (proposal says "to be resolved in design").
- Sweeper threshold N (e.g., 5 minutes) and how often the sweeper runs.
- Whether a product that failed only on the second-step product creation (after media uploaded) should immediately queue its media for deletion, or wait for the sweeper.
- Whether the `needs-attention` card is global (across all products) or per-product. The proposal implies a single global count card; design should confirm.
- Whether orphan-media deletion should also run on a fixed schedule, not only on a per-product failure trigger.
