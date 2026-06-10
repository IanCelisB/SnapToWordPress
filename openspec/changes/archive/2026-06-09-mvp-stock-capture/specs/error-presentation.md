# Spec: error-presentation

## Purpose

The error-presentation capability is the **single source of truth** for every error the user sees. It owns one question only: **"Given an error key (or a raw internal error), what plain-Spanish title, message, severity, and suggested action do I show the user?"** It does NOT decide when to retry, when to surface, or which error class a situation belongs to — those are the responsibilities of `woocommerce-sync` and `sync-trigger`. This module centralizes tone, vocabulary, and string quality so that a non-technical end user never sees a stack trace, an HTTP code, an English string, or two differently-phoned messages for the same kind of failure.

The module is small by design: a typed catalog of error keys mapped to plain-Spanish strings, plus a classifier that turns raw internal errors (HTTP responses, network failures, validation failures, unexpected exceptions) into catalog keys. Its entire value is that **every** screen, dialog, banner, and toast in the app goes through it — enforced by a CI grep test that fails the build if any screen file contains raw error text, status codes, or untranslated exception messages.

## ADDED Requirements

### Requirement: Single source of truth for user-facing error messages

Every error that reaches a user-facing surface (toast, banner, dialog, inline message, empty state) MUST flow through the error-presentation module. No screen MAY render raw error text, HTTP status codes, exception messages, or English strings directly. A CI grep test MUST fail the build if any `app/` screen file contains forbidden patterns: `\b\d{3}\b` (HTTP codes), `HTTP`, `JSON`, `fetch failed`, `TypeError`, `undefined is not`, or any English-only error string known to leak from libraries. The catalog entry for each key MUST include a `title`, `message`, `severity`, and optional `action`, and MUST be the only source of those strings.

#### Scenario: A new screen introduces an error toast

- GIVEN a developer adds a new screen that may show an error
- WHEN the screen renders
- THEN it imports the error-presentation module
- AND calls `presentError(key)` or `presentError(rawError)` for any error state
- AND never inlines a Spanish or English string

#### Scenario: CI grep test catches a leaked status code

- GIVEN a developer writes `error.message` directly into a `<Text>` in a screen file
- AND that message contains "401"
- WHEN CI runs the grep test
- THEN the build fails
- AND the failure message points to the offending file and line

#### Scenario: CI grep test catches a leaked exception

- GIVEN a developer writes `String(err)` into a banner
- WHEN CI runs the grep test
- THEN the build fails
- AND the developer is forced to route through the catalog or add a new key

### Requirement: Plain-Spanish error catalog

The module MUST expose a typed catalog of error keys. Each entry MUST contain exactly four fields:
- `title` — one line, plain Spanish, no jargon, no code, no English
- `message` — one to two lines, plain Spanish, actionable when possible ("Tocá Reintentar", "Verificá tu conexión", "Abrí Ajustes")
- `severity` — one of `info`, `warning`, `error`, `blocking`
- `action` — optional, one of `{ kind: "retry" }`, `{ kind: "open-settings" }`, `{ kind: "edit-product", productId: string }`, `{ kind: "contact-support" }`

All Spanish strings MUST use voseo ("verificá", "tocá", "revisá"), MUST NOT use exclamation marks (calm tone), and SHOULD keep sentences under twelve words when possible. The catalog MUST be exported as a plain data object (not buried inside JSX or components) so a single test file can iterate it.

#### Scenario: Auth failure entry

- GIVEN the catalog entry for `credenciales-invalidas`
- WHEN the test inspects it
- THEN `title` is "No pudimos conectar con la tienda"
- AND `message` is "Verificá las credenciales en Ajustes."
- AND `severity` is `blocking`
- AND `action` is `{ kind: "open-settings" }`

#### Scenario: Network unreachable entry

- GIVEN the catalog entry for `sin-conexion`
- WHEN the test inspects it
- THEN `title` is "Sin conexión"
- AND `message` is "Vamos a reintentar automáticamente cuando vuelvas a tener señal."
- AND `severity` is `warning`
- AND `action` is `{ kind: "retry" }`

#### Scenario: Unknown error entry is calm and reassuring

- GIVEN the catalog entry for `error-inesperado`
- WHEN the test inspects it
- THEN `title` is "Algo salió mal"
- AND `message` is "El producto quedó guardado en el teléfono, lo vamos a intentar subir de nuevo."
- AND `severity` is `error`
- AND `action` is `{ kind: "retry" }`
- AND it never contains a stack trace or technical term

### Requirement: Error classification from raw failures

The module MUST expose a classifier that takes a raw internal error and returns a catalog key. The classifier MUST handle at least these cases: HTTP `401` or `403` → `credenciales-invalidas`; HTTP `5xx` → `servidor-no-disponible`; HTTP `429` → `limite-de-tasa`; network timeout or offline → `sin-conexion`; validation error with a field path → `datos-invalidos` (with the field path attached as a parameter); anything else → `error-inesperado`. The classifier MUST NEVER return the raw error text as a "key" — unknown failures always fall through to `error-inesperado`.

#### Scenario: Classifier maps a 401 to credenciales-invalidas

- GIVEN the sync layer catches a `Response` with status `401`
- WHEN the sync layer calls `classifyError(err401)`
- THEN the result is the key `"credenciales-invalidas"`
- AND never `"http_401"` or `"Error: 401 Unauthorized"`

#### Scenario: Classifier maps a network timeout to sin-conexion

- GIVEN the sync layer catches a `TypeError: Network request failed`
- WHEN the sync layer calls `classifyError(timeout)`
- THEN the result is the key `"sin-conexion"`

#### Scenario: Classifier maps an unknown error to error-inesperado

- GIVEN the capture layer catches a `TypeError: undefined is not a function`
- WHEN the capture layer calls `classifyError(weirdErr)`
- THEN the result is the key `"error-inesperado"`
- AND the raw message is logged to the developer console only
- AND it is NOT included in the returned key

### Requirement: No raw exception text ever reaches the user

The module MUST ensure that the only strings ever passed to a user-facing component come from the catalog. In `__DEV__` mode, raw errors MUST go to the developer console (`console.warn` or `console.error`) for debugging, but MUST NOT appear in any `<Text>`, `<Toast>`, `<Banner>`, or `<Dialog>`. The `presentError` function MUST return only the catalog entry; it MUST NOT return the raw error, and the raw error MUST NOT be interpolated into the message.

#### Scenario: Unknown exception during capture

- GIVEN a `TypeError` is thrown deep inside the capture save flow
- WHEN the capture layer catches it and calls `presentError(err)`
- THEN the user sees the `error-inesperado` catalog entry
- AND the developer console shows the raw error and stack trace
- AND no part of the raw text reaches the UI

#### Scenario: 5xx response during sync

- GIVEN the sync worker receives a 503 response
- WHEN the worker calls `presentError(err503)`
- THEN the user sees the `servidor-no-disponible` catalog entry
- AND the raw 503 body is logged to the developer console only

### Requirement: Centralized tone and vocabulary

All Spanish strings in the catalog MUST follow a single style: voseo, no exclamation marks, no technical terms (no "HTTP", "JSON", "API", "token", "sync"), sentences under twelve words when possible, calm and reassuring. The catalog MUST be the only place these strings are defined — duplicate string literals across screens MUST be detected by the CI grep test.

#### Scenario: Lint test catches English in a catalog entry

- GIVEN a developer adds a new entry with message "An error occurred"
- WHEN CI runs the no-jargon lint
- THEN the build fails
- AND the developer must rewrite the message in plain Spanish

#### Scenario: Lint test catches exclamation mark in a catalog entry

- GIVEN a developer writes message "¡Reintentá ahora!"
- WHEN CI runs the tone lint
- THEN the build fails
- AND the developer must remove the exclamation marks and rephrase calmly

#### Scenario: Lint test catches jargon in a catalog entry

- GIVEN a developer writes message "Error en la API de WooCommerce"
- WHEN CI runs the no-jargon lint
- THEN the build fails
- AND the developer must rewrite without "API" or "WooCommerce"

### Requirement: Testable catalog and exhaustive coverage

The catalog MUST be exported as data so a single test file can:
1. Assert that every error key referenced in the app's source code has a catalog entry
2. Assert that every catalog entry has all four required fields (`title`, `message`, `severity`, `action` is optional but the rest are required)
3. Assert that every `message` passes the no-jargon lint (no digits like "401", no English-only tokens, no "HTTP", no "JSON")
4. Assert that the catalog is internally consistent (no two keys have the same `title` and `message`)

The CI test MUST fail with a clear message pointing to the missing key or the offending entry.

#### Scenario: A new error key is used in code but missing from the catalog

- GIVEN a developer writes `presentError("imagen-demasiado-grande")` in the capture layer
- AND no catalog entry exists for that key
- WHEN the coverage test runs
- THEN the build fails
- AND the failure message says `Missing catalog entry for "imagen-demasiado-grande"`

#### Scenario: A catalog entry is missing the severity field

- GIVEN a developer adds an entry with only `title` and `message`
- WHEN the structure test runs
- THEN the build fails
- AND the failure message points to the entry name

#### Scenario: Every catalog entry passes the no-jargon lint

- GIVEN the catalog is fully populated
- WHEN the lint test runs against every `message`
- THEN the test passes
- AND the build proceeds

## Open Questions

- Whether the catalog is stored as TypeScript const-asserted object, a JSON file, or generated from a YAML source — to be decided in design.
- How the `action` is consumed by the UI layer (route by `kind`, or call a handler registered per kind) — design concern, not a spec concern.
- Whether the `__DEV__` console logging should also include a correlation id to help debug field reports from real users — to be decided in design.
- How many catalog entries are needed at MVP (proposal implies ~6–8 core keys; design should confirm the full list).
- Where the boundary sits between classifier-in-error-presentation and classifier-in-sync: does the sync layer pass raw errors to the presenter and let it classify, or does the sync layer pre-classify and pass a key? Spec assumes **the presenter owns classification** so the catalog and the classifier stay co-located, but this is the single biggest open question for design.
