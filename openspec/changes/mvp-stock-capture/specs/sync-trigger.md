# Spec: sync-trigger

## Purpose

The sync-trigger capability orchestrates when and how the sync worker runs, and how its progress is surfaced to the user. It combines three trigger sources: automatic on Wi-Fi, a manual "Sincronizar ahora" button, and an always-visible "Pausar sincronización" toggle. The user is in control without having to understand what's happening: they can start, pause, and resume sync at any time, and progress is shown calmly as "Subiendo producto 3 de 12..." — never as a spinner that disappears, never as raw HTTP errors, never as jargon. The trigger also handles persistent retry: when the app launches, any unsynced products in the database are picked up automatically.

## ADDED Requirements

### Requirement: Auto-sync on Wi-Fi

The app MUST automatically start syncing when the device is connected to Wi-Fi AND there is at least one product in a syncable state. Auto-sync MUST be opt-out (off by default is acceptable too, to be confirmed in design — proposal implies ON by default) and MUST be visible to the user in the sync screen.

#### Scenario: User opens app on Wi-Fi with pending products

- GIVEN the user has 3 products in `ready` state
- AND the device is on Wi-Fi
- WHEN the app is brought to the foreground
- THEN the sync worker starts automatically
- AND a calm "Sincronizando..." indicator appears on the sync screen

#### Scenario: User opens app on cellular with pending products

- GIVEN the user has 3 products in `ready` state
- AND the device is on cellular
- WHEN the app is brought to the foreground
- THEN the sync worker does NOT start automatically (default: Wi-Fi only)
- AND a calm "Esperando Wi-Fi para sincronizar" indicator appears
- AND the user can tap "Sincronizar ahora con datos móviles" to override

#### Scenario: Network type changes from cellular to Wi-Fi

- GIVEN the user is on cellular
- AND there are pending products
- WHEN the device connects to Wi-Fi
- THEN the sync worker starts automatically

### Requirement: Manual "Sincronizar ahora" button

The sync screen MUST always expose a primary "Sincronizar ahora" button that starts the worker on demand, regardless of network type or auto-sync preferences. The button MUST be disabled while a sync is already running, with a calm "Sincronizando..." state.

#### Scenario: Tap manual sync with pending products

- GIVEN the user is on the sync screen
- AND there are pending products
- WHEN the user taps "Sincronizar ahora"
- THEN the worker starts
- AND the button switches to a disabled "Sincronizando..." state
- AND progress is shown: "Subiendo producto 1 de 5..."

#### Scenario: Tap manual sync with nothing pending

- GIVEN the user is on the sync screen
- AND there are no pending products
- WHEN the user taps "Sincronizar ahora"
- THEN nothing happens visibly
- AND a calm hint is shown: "No hay productos pendientes."

#### Scenario: Manual sync with paused toggle

- GIVEN the user has toggled "Pausar sincronización" on
- WHEN the user taps "Sincronizar ahora"
- THEN the worker does NOT start
- AND a calm hint is shown: "La sincronización está pausada."

### Requirement: Always-visible "Pausar sincronización" toggle

The sync screen MUST always show a "Pausar sincronización" toggle, prominently placed and clearly labeled. When ON, the worker MUST NOT start (neither auto nor manual). The toggle state MUST persist across app restarts.

#### Scenario: User pauses sync

- GIVEN the user is on the sync screen
- AND the toggle is OFF
- WHEN the user toggles it ON
- THEN the current sync (if any) stops at the next safe checkpoint
- AND no new auto-sync runs
- AND a calm indicator appears: "Sincronización pausada."

#### Scenario: User resumes sync

- GIVEN the sync is paused
- WHEN the user toggles it OFF
- THEN auto-sync is allowed to run on the next trigger
- AND a calm indicator appears: "Sincronización activada."

#### Scenario: Pause state survives app restart

- GIVEN the user has paused sync
- WHEN the user kills and relaunches the app
- THEN the toggle is still ON
- AND the worker does NOT auto-start

### Requirement: Persistent retry on app launch

On every app launch, the trigger MUST check the products table for any non-final sync state (`pending`, `syncing`, `ready`) and MUST start the worker (subject to the pause toggle and network rules) without requiring any user action. This is the "persistent retry queue" guarantee.

#### Scenario: Launch with pending products on Wi-Fi

- GIVEN there are 5 pending products
- AND sync is not paused
- AND the device is on Wi-Fi
- WHEN the user opens the app
- THEN the worker starts automatically
- AND progress is shown calmly

#### Scenario: Launch with pending products on cellular

- GIVEN there are 5 pending products
- AND sync is not paused
- AND the device is on cellular
- WHEN the user opens the app
- THEN the worker does NOT start
- AND a calm "Esperando Wi-Fi para sincronizar" indicator is shown
- AND the user can override with the manual button

### Requirement: Calm progress surfacing

Progress MUST be shown as a calm, deterministic text line such as "Subiendo producto 3 de 12..." with an unobtrusive indicator. There MUST NOT be anxiety-inducing spinners that disappear without explanation, and there MUST NOT be raw error text shown for transient failures.

#### Scenario: Worker is making progress

- GIVEN the worker is uploading product 3 of 12
- WHEN the user is on the sync screen
- THEN they see "Subiendo producto 3 de 12..." with a calm indicator
- AND no error or warning text

#### Scenario: Transient retry is silent

- GIVEN the worker hits a 503 on the current product
- WHEN the worker is in backoff
- THEN the user sees "Reintentando..." (no error dialog, no "Reintentar" button for transient errors)

#### Scenario: Persistent failure surfaces a single card

- GIVEN a product has exhausted its per-run attempt cap
- WHEN the worker moves on to the next product
- THEN a single card is surfaced: "1 producto no se pudo subir — tocá para ver qué hacer"
- AND it is the ONLY user-visible error in the app
- AND tapping it opens the product in the review screen

### Requirement: One primary action per sync screen

The sync screen MUST have exactly one primary action ("Sincronizar ahora") plus the always-visible pause toggle. There MUST NOT be hidden menus, advanced settings, or power-user controls in the way of the user understanding and controlling sync.

#### Scenario: Sync screen layout

- GIVEN the user opens the sync screen
- WHEN the screen renders
- THEN the visible elements are: the current sync status, the pause toggle, the manual sync button, and a list of pending/active products
- AND there are no buried settings, no log views, no debug toggles in the default view

### Requirement: Error surfacing is delegated to the presenter

The sync trigger MUST classify the failures it observes when starting or orchestrating the worker (network unreachable, auth failure, persistent worker crash) and pass that classification to the user-facing surface. The trigger MUST own the decision of "should this be surfaced to the user, and when?" but MUST NOT own the user-facing Spanish text, the severity, or the suggested action — those are the responsibility of the `error-presentation` spec. The trigger MUST NOT inline a Spanish or English error string in any indicator, hint, or banner; it emits only a classification key, and the presenter renders.

#### Scenario: Network unreachable on worker start

- GIVEN the worker tries to start but the network is unreachable
- WHEN the trigger decides this is worth surfacing
- THEN it emits the classification key `"sin-conexion"` to the sync screen
- AND the presenter renders the title, message, and retry action from its own catalog
- AND no "HTTP" or "fetch failed" text appears anywhere

#### Scenario: Auth failure on any product

- GIVEN the worker hits a 401
- WHEN the trigger relays the failure to the sync screen
- THEN it emits the classification key `"credenciales-invalidas"`
- AND the presenter renders "No pudimos conectar con la tienda. Tocá para actualizarlas."
- AND no HTTP code appears

## Open Questions

- Whether auto-sync defaults to ON or OFF in the first release (proposal implies ON on Wi-Fi; design should confirm).
- Whether the pause toggle is global or per-product (proposal asks the question; spec assumes global pending design).
- Exact UI placement of the progress line — sync screen only, or also a persistent banner on capture/queue screens.
- Whether the worker should also wake up on a background task (e.g., periodic) or only on app foreground (proposal implies foreground + on-launch; design should confirm).
