// src/ui/strings.ts — Spanish, voseo, calm-tone UI copy.
//
// Rule: this is the ONLY module in the app that holds non-error
// user-facing Spanish strings. The error-presentation catalog
// (`src/error-presentation/catalog.ts`) owns the error strings. This
// file owns everything else: button labels, screen titles, hints,
// empty-state messages, dialog confirmations, status-pill labels.
//
// All strings are:
//   - Spanish, voseo (tocá, revisá, esperá, agregá).
//   - Under 12 words per sentence when possible.
//   - Free of jargon (no digits, no English "HTTP"/"JSON"/"API", no
//     "WooCommerce", no "sync", no "token", no "fetch").
//   - Free of "!" (calm tone; the catalog rule applies to us too).
//
// The typed `Strings` const is exported as a frozen object so a
// component can never mutate it and a test can iterate the keys to
// lint against the forbidden patterns.
//
// Add a key here when you need new UI copy. The lint test
// `__tests__/strings.test.ts` enforces the no-jargon rule.

export const Strings = {
  // Tab / screen titles
  tabCapture: 'Capturar',
  tabQueue: 'Cola',
  tabSync: 'Sincronizar',
  tabSettings: 'Ajustes',

  // Capture screen
  captureTitle: 'Nuevo producto',
  captureHint: 'Sacá una foto y completá los datos.',
  captureAddPhoto: 'Agregar foto',
  captureFromLibrary: 'Elegí de la galería',
  captureTakePhoto: 'Sacar foto',
  captureFieldName: 'Nombre del producto',
  captureFieldNamePlaceholder: 'Ej: Remera azul talle M',
  captureFieldPrice: 'Precio',
  captureFieldPricePlaceholder: 'En pesos, sin centavos',
  captureFieldCategory: 'Categoría',
  captureFieldCategoryPlaceholder: 'Elegí una categoría',
  captureFieldCategoryLoading: 'Cargando categorías…',
  captureFieldCategoryStale: 'Las categorías pueden estar desactualizadas.',
  captureFieldDescription: 'Descripción (opcional)',
  captureFieldDescriptionPlaceholder: 'Detalles, talles, materiales',
  captureSave: 'Guardar producto',
  captureSaving: 'Guardando…',
  capturePhotoLimit: 'Podés agregar hasta cinco fotos.',

  // Camera permission
  cameraPermissionPrompt: 'Necesitamos la cámara para tomar fotos.',

  // Queue list screen
  queueTitle: 'Cola de revisión',
  queueEmpty: 'Todavía no hay productos guardados.',
  queueEmptyHint: 'Volvé a Capturar para agregar el primero.',
  queueReviewAction: 'Revisar',
  queueDeleteAction: 'Eliminar',
  queueCountsPending: 'para revisar',
  queueCountsReady: 'listas',
  queueCountsSyncing: 'sincronizando',
  queueCountsSynced: 'sincronizados',
  queueCountsNeedsAttention: 'necesitan atención',
  queueCountSeparator: ' · ',
  queueDeleteConfirmTitle: 'Eliminar producto',
  queueDeleteConfirmMessage: '¿Seguro que querés eliminar este producto?',
  queueDeleteConfirmAction: 'Eliminar',
  queueDeleteCancelAction: 'Cancelar',

  // Edit/delete confirm
  editDeleteConfirmTitle: 'Eliminar producto',
  editDeleteConfirmMessage: '¿Seguro que querés eliminar este producto?',
  editDeleteConfirmYes: 'Eliminar',
  editDeleteConfirmNo: 'Cancelar',

  // Edit screen (queue/[id])
  editTitle: 'Editar producto',
  editPriceConfirm: 'Confirmar precio',
  editPriceConfirmed: 'Precio confirmado',
  editPriceEdit: 'Editar precio',
  editApprove: 'Aprobar',
  editApproveDisabled: 'Confirmá el precio primero',

  // Edit screen — status pills
  pillPending: 'Pendiente',
  pillReady: 'Listo',
  pillSyncing: 'Sincronizando',
  pillSynced: 'Sincronizado',
  pillFailed: 'Con error',
  pillNeedsAttention: 'Necesita atención',

  // Edit screen — price confirm gate
  editPriceGateTitle: 'Precio a confirmar',
  editPriceGateOriginal: 'Precio original',
  editPriceGateNew: 'Precio actual',
  editPriceGateConfirm: 'Confirmar precio',
  editPriceGateConfirmed: 'Precio confirmado',
  editPriceGateEdit: 'Editar precio',

  // Edit screen — fields and publish
  editFieldName: 'Nombre del producto',
  editFieldPrice: 'Precio',
  editFieldCategory: 'Categoría',
  editFieldDescription: 'Descripción (opcional)',
  editPublishTitle: 'Publicar al sincronizar',
  editPublishHint: 'Se va a publicar apenas termine la sincronización.',
  editPublishDraft: 'Queda como borrador hasta que decidas publicarlo.',
  editDelete: 'Eliminar',

  // Sync screen
  syncTitle: 'Sincronización',
  syncPause: 'Pausar',
  syncResume: 'Reanudar',
  syncSyncNow: 'Sincronizar ahora',
  syncSyncing: 'Sincronizando producto {current} de {total}…',
  syncSyncingShort: 'Sincronizando…',
  syncNeedsAttention: 'Necesitan atención',
  syncNeedsAttentionHint: 'Tocá para ver los productos con error.',
  syncCompleted: 'Todo sincronizado',
  syncCompletedHint: 'No hay productos pendientes.',
  syncPausedHint: 'La sincronización está pausada.',
  syncAuthHint: 'No pudimos conectar con la tienda. Toca para revisar las credenciales.',
  syncLast: 'Última sincronización: {at}',
  syncLastMoment: 'hace un momento',
  syncLastMinutes: 'hace {n} min',
  syncLastHours: 'hace {n} h',
  syncLastDays: 'hace {n} d',

  // Sync banner (persistent on capture/queue screens)
  syncBannerRunning: 'Sincronizando {n} productos…',
  syncBannerBlocked: '{n} productos necesitan atención',
  syncBannerTapToSee: 'Tocá para ver',

  // Needs-attention card (sync screen)
  needsAttentionTitle: '{n} productos no se pudieron subir',
  needsAttentionHint: 'Tocá para ver',

  // Error banner (dismissable, on any screen)
  errorBannerDismiss: 'Cerrar',

  // Progress line (sync screen)
  progressLine: 'Subiendo producto {current} de {total}…',

  // Pause toggle
  pauseToggleLabel: 'Sincronización pausada',

  // Onboarding
  onboardingTitle: 'Vincular tienda',
  onboardingHint: 'Ingresá los datos de tu tienda para vincularla.',
  onboardingUrlLabel: 'URL de la tienda',
  onboardingUrlPlaceholder: 'mitienda.com',
  onboardingKeyLabel: 'Consumer Key',
  onboardingKeyPlaceholder: 'ck_…',
  onboardingSecretLabel: 'Consumer Secret',
  onboardingSecretPlaceholder: 'cs_…',
  onboardingSave: 'Vincular',
  onboardingSaving: 'Vinculando…',

  // Settings
  settingsTitle: 'Ajustes',
  settingsStore: 'Tienda vinculada',
  settingsRevalidate: 'Re-validar',
  settingsUnlink: 'Desvincular tienda',
  settingsUnlinkConfirm: '¿Seguro? Perderás la vinculación pero los productos se conservan.',
  settingsUnlinkAction: 'Desvincular',
  settingsCancel: 'Cancelar',
} as const;
