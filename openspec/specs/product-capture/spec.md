# Spec: product-capture

## Purpose

The product-capture capability is the entry point of the app: it lets a non-technical small-store owner record a product in the field, in seconds, with no paperwork. It captures one or more photos, a product name, an integer price, a category (selected from the store's existing taxonomy), and an optional short description, and persists the result to the local database so it can be reviewed and later synced. The screen is intentionally minimal: one primary action (save), no jargon, defaults that match the previous product so the operator does not retype the same category ten times in a row.

## ADDED Requirements

### Requirement: Multi-image capture with native camera

The capture screen MUST allow the user to attach one or more photos to a product using the device camera, and MUST persist the resulting image files to the app's documents directory (not the OS cache, which can be purged).

#### Scenario: Capture one photo

- GIVEN the user is on the capture screen
- AND the device camera permission is granted
- WHEN the user frames the product and taps the shutter
- THEN the photo is saved to the documents directory
- AND a thumbnail appears in the product's image strip
- AND the capture form remains on screen so the user can add more photos or fill the fields

#### Scenario: Capture multiple photos for the same product

- GIVEN the user has already captured one photo
- WHEN the user captures a second photo without leaving the capture screen
- THEN the second photo is also saved to the documents directory
- AND both thumbnails appear in order in the image strip
- AND the user can add further photos up to a documented per-product maximum (default 5)

#### Scenario: Camera permission denied

- GIVEN the user opens the capture screen for the first time
- WHEN the system prompts for camera permission and the user denies it
- THEN the capture flow emits the classification key `camara-permiso-denegado` to the user-facing surface
- AND the presenter renders the title, message, severity, and suggested action from its own catalog
- AND the primary capture action is disabled
- AND no error code, English text, Spanish text, or stack trace is inlined by the capture flow

#### Scenario: Image persisted to documents directory survives app restart

- GIVEN the user captured three photos
- WHEN the user kills the app and relaunches it
- THEN the three photos are still present in the documents directory
- AND the product draft is still associated with the three image file paths

### Requirement: Required fields with validation

The capture screen MUST require name, integer price, and category. Description is optional. All validation errors MUST be classified via the `error-presentation` spec and rendered by the presenter; the capture flow MUST NOT inline any Spanish or English validation message.

#### Scenario: Save with all required fields filled

- GIVEN the user has filled name, price, and category
- WHEN the user taps the primary save action
- THEN the product is saved to the local database with a UUIDv4 `local_id`
- AND the user is taken to the review queue
- AND the capture form is reset for the next product

#### Scenario: Save with empty name

- GIVEN the user has filled price and category but left the name blank
- WHEN the user taps save
- THEN no product is saved
- AND the capture flow emits the classification key `datos-invalidos` with `field=name` and `reason=required`
- AND the presenter renders the field-level message from its own catalog

#### Scenario: Save with non-integer price

- GIVEN the user types "12,5" in the price field
- WHEN the user attempts to save
- THEN no product is saved
- AND the capture flow emits the classification key `datos-invalidos` with `field=price` and `reason=not-integer`
- AND the presenter renders the field-level message from its own catalog

#### Scenario: Save with negative or zero price

- GIVEN the user types "-100" or "0" in the price field
- WHEN the user attempts to save
- THEN no product is saved
- AND the capture flow emits the classification key `datos-invalidos` with `field=price` and `reason=must-be-positive`
- AND the presenter renders the field-level message from its own catalog

#### Scenario: Category list is empty (store not yet queried)

- GIVEN the user opens the capture screen before categories have been fetched
- WHEN the category selector is opened
- THEN a calm "Cargando categorías..." indicator is shown
- AND the user is not forced to retap or refresh

### Requirement: Defaults that reduce repetitive typing

The capture screen MUST pre-fill the category from the most recently captured product, and MUST leave description empty with a one-line hint placeholder.

#### Scenario: Category pre-filled from last product

- GIVEN the user just saved a product with category "Anteojos de sol"
- WHEN the user opens the capture screen for the next product
- THEN the category selector shows "Anteojos de sol" as the current value
- AND the user can change it with a single tap

#### Scenario: Description defaults to empty with hint

- GIVEN the user opens the capture screen
- WHEN the description field is rendered
- THEN it is empty
- AND it shows a faint hint: "Opcional: una descripción corta"
- AND it accepts free text up to 280 characters

### Requirement: Local-first persistence (no network on capture)

The capture screen MUST NOT perform any network call. The product is saved to the local SQLite database and queued for sync. Sync is a separate, later step.

#### Scenario: Offline capture succeeds

- GIVEN the device has no network connectivity
- WHEN the user captures a product and taps save
- THEN the product is saved locally
- AND no error about network is shown
- AND the product appears in the review queue as "Pendiente de sincronización"

#### Scenario: Network state is never probed during capture

- GIVEN the user is on the capture screen
- WHEN the user inspects the network behavior
- THEN no HTTP request is made from the capture screen
- AND the capture flow is identical online and offline

### Requirement: Error surfacing is delegated to the presenter

The capture flow MUST classify the failures it can observe (camera permission denied, required-field validation, format validation) and pass that classification to the user-facing surface. The capture flow MUST own the decision of "is this field-level validation (inline message) or blocking (modal/banner)?" and MUST own the decision of "which field is in error and why". The capture flow MUST NOT own the user-facing Spanish text, the severity, the suggested action, or the exact wording of inline messages — those are the responsibility of the `error-presentation` spec. The capture flow MUST NOT inline a Spanish or English error string in any field hint, banner, or modal; it emits only a classification key (and the field path where applicable), and the presenter renders.

#### Scenario: Camera permission classified once, rendered centrally

- GIVEN the user has denied camera permission
- WHEN the capture flow determines the primary action cannot be performed
- THEN the capture flow emits the classification key `camara-permiso-denegado`
- AND the presenter renders the title, message, severity, and the action `{ kind: "open-settings" }` from its own catalog
- AND the capture flow has no opinion on what Spanish text the user sees

#### Scenario: Field-level validation routed through `datos-invalidos`

- GIVEN the user attempts to save with one or more invalid required fields
- WHEN the capture flow determines the validation failed
- THEN the capture flow emits `datos-invalidos` with the offending field path(s) and reason code(s)
- AND the presenter renders each field-level message from its own catalog
- AND the capture flow has no opinion on the exact Spanish phrasing of the hint

## Open Questions

- Exact maximum number of images per product (proposal implies a documented cap; default proposed: 5).
- Whether the description field has a hard 280-char limit or a softer validation.
- Whether the `error-presentation` catalog should be extended with a dedicated `camara-permiso-denegado` key, or whether the permission-denied case can be unified under a broader `permiso-denegado` key in design. Spec assumes a dedicated key is needed; design should confirm.
- Whether the `error-presentation` catalog should be extended with explicit `reason` codes for `datos-invalidos` (e.g., `required`, `not-integer`, `must-be-positive`) or whether the field path alone is sufficient. Spec assumes explicit reason codes; design should confirm.
