# Spec: store-config

## Purpose

The store-config capability handles the one-time onboarding of a WooCommerce store: the user provides a store URL, a Consumer Key, and a Consumer Secret, and the app validates them against the live store before saving. After a successful save, the credentials live in the device's secure store and are reused for every subsequent sync. The user is never asked to reconfigure the store unless the credentials stop working, in which case the app surfaces a calm, plain-Spanish prompt to re-validate. The capability also exposes a settings screen where the user can review the current configuration, see storage usage, and re-validate or replace the credentials.

## ADDED Requirements

### Requirement: Single onboarding flow on first launch

On first launch, the user MUST be routed to a `/onboarding` screen that asks for store URL, Consumer Key, and Consumer Secret, in that order. The app MUST NOT save any of these values until validation against the live store succeeds.

#### Scenario: First launch with no stored credentials

- GIVEN the app is opened for the first time on a device
- WHEN the app determines no credentials are stored
- THEN the user is taken directly to `/onboarding`
- AND the onboarding screen is the only screen visible — the rest of the app is unreachable until onboarding completes

#### Scenario: First launch with stored credentials

- GIVEN the app is opened and credentials are already stored
- WHEN the app reads the secure store
- THEN the user is taken to the main app (capture or queue)
- AND the onboarding screen is NOT shown

### Requirement: Validation against the live store before save

The app MUST validate the store URL, Consumer Key, and Consumer Secret against the live store BEFORE persisting any of them. Validation is done by issuing a lightweight authenticated request to the store (e.g., `GET /wc/v3/system_status` or `GET /wc/v3/products?per_page=1`).

#### Scenario: Valid credentials

- GIVEN the user has entered URL, Key, and Secret
- WHEN the user taps "Conectar tienda"
- THEN the app issues a validation request to the store
- AND the request returns 200
- AND the credentials are saved to `expo-secure-store`
- AND the user is taken to the main app

#### Scenario: Invalid credentials

- GIVEN the user has entered URL, Key, and Secret
- WHEN the validation request returns 401 or 403
- THEN no credentials are saved
- AND the onboarding flow emits the classification key `credenciales-invalidas` to the user-facing surface
- AND the presenter renders the title, message, severity, and the `open-settings` action from its own catalog
- AND no HTTP code, English text, or Spanish text is inlined by the onboarding flow
- AND the user can correct the values and try again

#### Scenario: Store URL is unreachable

- GIVEN the user has entered a URL that does not resolve
- WHEN the validation request fails with a network error
- THEN no credentials are saved
- AND the onboarding flow emits the classification key `sin-conexion` to the user-facing surface
- AND the presenter renders the title, message, severity, and the `retry` action from its own catalog
- AND no stack trace, English text, or Spanish text is inlined by the onboarding flow

#### Scenario: Store URL is reachable but not a WooCommerce store

- GIVEN the user has entered a URL that responds but is not a WC store
- WHEN the validation request returns 404 on the WC endpoint
- THEN no credentials are saved
- AND the onboarding flow emits the classification key `tienda-no-accesible` to the user-facing surface
- AND the presenter renders the title, message, severity, and suggested action from its own catalog
- AND no Spanish text is inlined by the onboarding flow

### Requirement: URL normalization and validation

The store URL MUST be normalized to a canonical form (https, no trailing slash, no path prefix that would interfere with the WC REST endpoints) before being saved. The app MUST reject URLs that are not https in production builds.

#### Scenario: User enters URL with http://

- GIVEN the user types `http://mitienda.com`
- WHEN the user taps "Conectar tienda"
- THEN the app prompts: "La URL tiene que empezar con https. ¿Querés usar https://mitienda.com?"
- AND on confirm, the URL is normalized to `https://mitienda.com`

#### Scenario: User enters URL with trailing path

- GIVEN the user types `https://mitienda.com/shop/`
- WHEN the user submits
- THEN the URL is normalized to `https://mitienda.com` (paths are stripped)
- AND a plain-Spanish hint is shown: "Quitamos la ruta y usamos solo el dominio."

### Requirement: Credentials stored in `expo-secure-store`

The store URL, Consumer Key, and Consumer Secret MUST be stored in `expo-secure-store`. They MUST NOT be stored in plain AsyncStorage, plain SQLite, or any other non-secure medium. They MUST NOT be logged anywhere in the app.

#### Scenario: Credentials retrieved on next launch

- GIVEN credentials are saved
- WHEN the app launches and the sync worker starts
- THEN the credentials are read from `expo-secure-store`
- AND used to sign the REST requests
- AND never written to plain storage

#### Scenario: No credentials in logs

- GIVEN the app is running
- WHEN any logging statement in the app is inspected
- THEN no occurrence of the actual Consumer Key or Consumer Secret value is present
- AND the URL is logged (or a sanitized form) for debugging

### Requirement: Re-validation on sync failure

If a sync attempt fails with a 401 (or a documented auth-class error), the app MUST surface a prompt for the user to re-validate the credentials in settings. The app MUST NOT silently keep retrying with broken credentials forever.

#### Scenario: Sync fails with 401

- GIVEN the user has stored credentials
- AND a sync attempt returns 401
- WHEN the worker records the failure
- THEN any further product uploads are paused
- AND the sync flow emits the classification key `credenciales-invalidas` to the user-facing surface
- AND the presenter renders the card with the `open-settings` action from its own catalog
- AND tapping the card opens the settings screen with the credentials fields pre-filled

#### Scenario: User updates credentials and re-validates

- GIVEN the user is on the settings screen after a 401
- WHEN the user updates the credentials and taps "Reconectar"
- THEN the app re-runs the live validation
- AND on success, the new credentials are saved
- AND the worker resumes the paused products

### Requirement: Settings screen with re-validate and replace

The app MUST expose a settings screen where the user can see the current store URL, re-validate the credentials, replace the credentials, and view local storage usage. The settings screen MUST be reachable from the main app shell.

#### Scenario: Open settings

- GIVEN the user is in the main app
- WHEN the user taps the settings icon
- THEN the settings screen opens
- AND it shows the current store URL
- AND it offers "Reconectar tienda" and "Reemplazar credenciales" actions
- AND it shows local storage usage in a calm, non-anxiety-inducing format

#### Scenario: Replace credentials

- GIVEN the user is on the settings screen
- WHEN the user taps "Reemplazar credenciales"
- THEN the onboarding form is shown pre-filled with the current values
- AND on submit, the new values are validated before being saved

### Requirement: No hardcoded store defaults

The app MUST NOT ship with any default store URL, Consumer Key, Consumer Secret, category IDs, slugs, or product data for any specific store. The repo MUST be runnable for any WooCommerce store, including a freshly created dev store.

#### Scenario: Fresh install on a new device

- GIVEN a user installs the app fresh
- WHEN the user opens it
- THEN the onboarding screen is shown
- AND no field is pre-populated with a real store value
- AND the placeholder text is generic (e.g., "https://mitienda.com")

#### Scenario: Cloning the public repo

- GIVEN a developer clones the repo
- AND follows the README to build and run
- WHEN the app starts
- THEN the onboarding screen is shown
- AND no optifull.cl (or any other specific store) reference is present in the UI, env, or code

### Requirement: Error surfacing is delegated to the presenter

The store-config flow (onboarding, settings, re-validation triggered by sync failure) MUST classify the failures it can observe (invalid credentials 401/403, network unreachable, URL not a WooCommerce store, sync-time auth failure) and pass that classification to the user-facing surface. The store-config flow MUST own the decision of "is this a validation error on a specific field, a banner, or a card?" and MUST own the decision of "is the user allowed to retry, or must they update credentials?". The store-config flow MUST NOT own the user-facing Spanish text, the severity, or the suggested action — those are the responsibility of the `error-presentation` spec. The store-config flow MUST NOT inline a Spanish or English error string in any banner, card, modal, or inline prompt; it emits only a classification key, and the presenter renders.

#### Scenario: Invalid credentials classified once, rendered centrally

- GIVEN the user submits credentials on the onboarding screen
- WHEN the validation request returns 401 or 403
- THEN the store-config flow emits the classification key `credenciales-invalidas`
- AND the presenter renders the title, message, severity, and the `open-settings` action from its own catalog
- AND the store-config flow has no opinion on what Spanish text the user sees

#### Scenario: URL unreachable on validation

- GIVEN the user submits a URL that does not resolve
- WHEN the validation request fails with a network error
- THEN the store-config flow emits the classification key `sin-conexion`
- AND the presenter renders the title, message, severity, and the `retry` action from its own catalog
- AND no stack trace, English text, or Spanish text is inlined by the store-config flow

#### Scenario: Sync-time 401 emits the same auth classification

- GIVEN the user has stored credentials
- AND a sync attempt returns 401
- WHEN the worker records the failure
- THEN the store-config flow emits the classification key `credenciales-invalidas` (the same key as the onboarding case)
- AND the presenter renders the same title, message, severity, and `open-settings` action from its own catalog
- AND the wording of the card is identical to the onboarding 401 card

## Open Questions

- Exact validation endpoint: `GET /wc/v3/system_status` vs. `GET /wc/v3/products?per_page=1` vs. a dedicated `GET /wc/v3` ping (design decision).
- Whether to support a "test mode" flag that allows http URLs in dev builds (Expo dev server runs on http) — design decision.
- Whether the settings screen should also offer a "clear all local data" reset action (proposal implies it is reachable from settings; behavior to be confirmed).
- Whether the `error-presentation` catalog should be extended with a dedicated `tienda-no-accesible` key for the "URL responds but is not a WooCommerce store" case (404 on the WC endpoint), or whether this should map to `datos-invalidos` with a `field=url` parameter, or fall through to `error-inesperado`. Spec assumes a dedicated key is needed because the recovery action (check the URL, not retry the network) is distinct; design should confirm.
- Whether the http→https confirmation prompt and the trailing-path normalization hint should be expressed as catalog entries (e.g., `confirmacion-https`, `url-normalizada`), or whether the store-config spec should keep owning these as non-error UX prompts. Spec assumes the latter for MVP; design should confirm whether the catalog needs non-error entries.
