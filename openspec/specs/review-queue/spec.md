# Spec: review-queue

## Purpose

The review-queue capability is the system's mandatory checkpoint: no product leaves the device without explicit per-product approval by the user. The queue screen shows every captured product in a single list with calm, scannable status indicators, and the per-product detail screen lets the user edit any field, choose which images to upload, pick draft vs publish, and confirm the price with a dedicated anti-mistake step. The review screen is the single most important safety surface in the app — it is where the user catches typos in prices, names, and categories before they become live products on the store.

## ADDED Requirements

### Requirement: Mandatory per-product review before sync

A product MUST NOT become syncable until the user has opened it in the review detail screen AND confirmed the price. Sync workers MUST skip any product that is not in the `ready` (or equivalent) state.

#### Scenario: Newly captured product is not syncable

- GIVEN the user just saved a product from the capture screen
- WHEN the user navigates to the sync screen
- THEN the new product does NOT appear in the sync queue
- AND the review queue shows it with a "Pendiente de revisar" indicator

#### Scenario: Worker skips unreviewed product

- GIVEN a product has `status = pending` (not yet reviewed)
- WHEN the sync worker enumerates products to push
- THEN the worker MUST skip it
- AND no API request is made for that product

### Requirement: Queue list with calm status indicators

The review queue list MUST show every captured product with name, price, category, and a plain-Spanish status pill: "Pendiente de revisar", "Listo para subir", "Subiendo...", "Subido", "No se pudo subir".

#### Scenario: Queue with mixed states

- GIVEN the user has 10 captured products in various states
- WHEN the user opens the review queue
- THEN each product appears with its name, price, category, and a status pill
- AND products are sorted with pending reviews at the top
- AND a single primary action "Revisar" is shown on the row for products not yet reviewed

#### Scenario: Tap a product row

- GIVEN the user is on the review queue
- WHEN the user taps a product row
- THEN the per-product review screen opens
- AND the user can edit any field

### Requirement: Edit any field from the review screen

The per-product review screen MUST allow the user to edit name, price, category, description, the list of images to upload, and the draft vs publish choice. All edits MUST be saved back to the local database immediately on blur or on explicit "Guardar cambios" tap (design decision).

#### Scenario: Edit name

- GIVEN the user is on a product's review screen
- WHEN the user changes the name and confirms
- THEN the new name is saved to the products table
- AND the previous value is NOT overwritten without confirmation if it materially changes the product (see price rule)

#### Scenario: Edit description

- GIVEN the user is on a product's review screen
- WHEN the user adds or changes the description
- THEN the new value is saved
- AND no price confirmation is required (description is not a "blast radius" field)

#### Scenario: Deselect an image

- GIVEN a product has three images attached
- WHEN the user deselects one of them in the review screen
- THEN the image is marked as `excluded` in the product_images table
- AND the product will sync with the remaining two images
- AND the file is not deleted from disk (it can be re-selected)

#### Scenario: Choose draft vs publish

- GIVEN the user is on a product's review screen
- WHEN the user toggles "Subir como publicado" on
- THEN the product's `publish_on_sync` flag is set to true
- AND the toggle defaults to OFF (draft) for every product
- AND the user sees a plain-Spanish hint: "Si lo subís publicado, va a aparecer inmediatamente en la tienda."

### Requirement: Mandatory price confirmation gate

If the user edits the price in the review screen, the product MUST NOT become syncable until the user taps a dedicated "Confirmar precio" button. This is the single most important anti-mistake feature in the app.

#### Scenario: Edit price and confirm

- GIVEN the user is on a product's review screen with the original price shown in large type
- WHEN the user changes the price to a new value
- THEN a "Confirmar precio" button appears below the price field
- AND a color-coded delta is shown, with the original and the new value, and the new value highlighted
- AND the product remains in `pending` state
- AND the user MUST tap "Confirmar precio" for the product to move to `ready`

#### Scenario: Edit price but never confirm

- GIVEN the user has changed the price in the review screen
- AND the user navigates away without tapping "Confirmar precio"
- WHEN the user returns to the review queue
- THEN the product shows a "Precio sin confirmar" warning indicator
- AND it is still in `pending` state, NOT syncable

#### Scenario: No price edit

- GIVEN the user opens a product in the review screen
- AND the user does not change the price
- WHEN the user taps "Marcar como listo"
- THEN the product moves to `ready` state without requiring a separate "Confirmar precio" tap
- AND the original captured price is treated as confirmed

#### Scenario: Price edited to zero or negative

- GIVEN the user changes the price to 0 or a negative value
- WHEN the user attempts to confirm
- THEN the confirmation is rejected
- AND the review flow emits the classification key `datos-invalidos` with `field=price` and `reason=must-be-positive`
- AND the presenter renders the field-level message from its own catalog

### Requirement: Delete from review is the only confirmation dialog

The only action in the review screen that requires a "are you sure?" confirmation is destructive: deleting the product from the queue. All other actions (edits, image toggles, draft/publish, confirming price) are reversible and MUST NOT trigger a confirmation dialog.

#### Scenario: Delete product from review

- GIVEN the user is on a product's review screen
- WHEN the user taps "Eliminar de la cola"
- THEN a confirmation dialog appears in plain Spanish: "¿Eliminar este producto? No se subió todavía."
- AND on confirm, the product and its image files are removed from the device
- AND the product is removed from the review queue list

#### Scenario: Edit name does not show a confirmation

- GIVEN the user is on a product's review screen
- WHEN the user changes the name
- THEN no "are you sure?" dialog appears
- AND the change is saved silently

### Requirement: Error surfacing is delegated to the presenter

The review screen MUST classify the failures it can observe (product in `needs-attention` due to missing image on disk, persistent auth failure surfaced by the sync worker, unconfirmed price state, validation rejection on price confirmation) and pass that classification to the user-facing surface. The review screen MUST own the decision of "is this an inline field message, a row-level card, or a blocking modal?" and MUST own the decision of "which product is in `needs-attention` and why". The review screen MUST NOT own the user-facing Spanish text, the severity, or the suggested action — those are the responsibility of the `error-presentation` spec. The review screen MUST NOT inline a Spanish or English error string in any card, banner, field hint, or modal; it emits only a classification key (and the field path where applicable), and the presenter renders.

#### Scenario: Missing image renders via the presenter's catalog

- GIVEN a product is in `needs-attention` state because one of its images is missing on disk
- WHEN the user opens the product in the review screen
- THEN the review flow emits the classification key `imagen-faltante` to the user-facing surface
- AND the presenter renders the explanation and the available actions (re-capture the photo, or remove the missing image) from its own catalog
- AND the review flow has no opinion on the exact Spanish phrasing of the card

#### Scenario: Persistent auth failure renders via the presenter's catalog

- GIVEN a product is in `needs-attention` state due to a persistent 401 (or documented auth-class error)
- WHEN the user opens the product in the review screen
- THEN the review flow emits the classification key `credenciales-invalidas` to the user-facing surface
- AND the presenter renders the explanation and the `open-settings` action from its own catalog
- AND no HTTP code or English text appears

#### Scenario: Unconfirmed price shows a pending-confirmation state, not an error

- GIVEN the user has edited the price in the review screen but not tapped "Confirmar precio"
- WHEN the user returns to the review queue
- THEN the row shows a pending-confirmation indicator, classified as `precio-no-confirmado`
- AND the presenter renders the indicator and the available action ("Confirmar precio") from its own catalog
- AND this is NOT treated as a blocking error — the user can still navigate to the product and confirm

## Open Questions

- Whether to use a single "Marcar como listo" button that auto-confirms price if unchanged, vs. an explicit "Confirmar y marcar como listo" button (proposal's intent is the former).
- Exact color-coding for the price delta (green for lower, red for higher vs. captured value — to be decided in design).
- Whether edits save on every keystroke (with debounce) or only on explicit confirm — design decision.
- Whether the `error-presentation` catalog should be extended with a dedicated `imagen-faltante` key for the missing-image case (the same key is also referenced from `local-persistence`), or whether this can be expressed via `datos-invalidos` with a `field=image` parameter. Spec assumes a dedicated key; design should confirm.
- Whether the `error-presentation` catalog should be extended with a dedicated `precio-no-confirmado` key for the unconfirmed-price state (a state indicator, not a transient failure), or whether the queue list should use a generic pending-confirmation state. Spec assumes a dedicated key; design should confirm.
- Whether the status pills in the queue list (pending / ready / syncing / synced / needs-attention) should each become a catalog entry, or whether the queue list uses a single generic state-pill component whose wording is owned by the presenter. Spec assumes the latter; design should confirm.
