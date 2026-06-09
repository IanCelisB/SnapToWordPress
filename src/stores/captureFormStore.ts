// src/stores/captureFormStore.ts — in-memory draft state for the
// capture screen (WU-3, product-capture spec R1-R6).
//
// This is one of the few stores that holds EPHEMERAL form state. It
// is NEVER persisted; the form resets to its initial state on every
// app launch. The DB write happens in `save()` and uses the repos
// (`productsRepo` / `imagesRepo`) to commit the product + its
// `product_images` rows.
//
// Validation runs through the error-presentation classifier — no
// Spanish text lives in this file. The form returns a
// `CatalogEntry | null` (via `presentError`) from `validate()`; the
// screen renders it without knowing the underlying key.
//
// The store is intentionally NOT coupled to a specific DB. The
// factory `createCaptureFormStore()` returns a Zustand hook. The
// `buildProduct()` action does NOT write; the capture screen wires
// it to `productsRepo.insert` + `imagesRepo.insert` itself.

import { create } from 'zustand';
import { presentError, type CatalogEntry } from '../error-presentation';
import { uuid } from '../infra/uuid';
import type { ProductStatus } from '../domain/types';

export type CaptureStep = 'camera' | 'form' | 'review';

export type CapturedImage = {
  /** Source URI from expo-camera or expo-image-picker. */
  uri: string;
  /** The on-device file path assigned by the image persistence helper. */
  filePath: string | null;
  /** Stable id within the draft (NOT the localId of the product). */
  draftId: string;
};

export type CaptureFormState = {
  step: CaptureStep;
  name: string;
  /** Stored as a string to preserve what the user typed; coerced to int on save. */
  price: string;
  categoryId: number | null;
  categoryName: string | null;
  description: string;
  imageUris: ReadonlyArray<CapturedImage>;
  /** True while a save is in flight. */
  saving: boolean;
  /** Set on a successful save so the screen can navigate away. */
  lastSavedLocalId: string | null;
};

export type CaptureFormActions = {
  setStep: (step: CaptureStep) => void;
  setName: (name: string) => void;
  setPrice: (price: string) => void;
  setCategory: (categoryId: number | null, categoryName: string | null) => void;
  setDescription: (description: string) => void;
  addImage: (uri: string, filePath: string | null) => void;
  removeImage: (draftId: string) => void;
  setSaving: (saving: boolean) => void;
  setLastSavedLocalId: (id: string | null) => void;
  reset: () => void;
  validate: () => CatalogEntry | null;
  /** Returns the constructed `NewProduct`-shaped object. Does NOT write. */
  buildProduct: () => {
    localId: string;
    name: string;
    price: number;
    categoryId: number | null;
    categoryName: string | null;
    description: string | null;
    status: ProductStatus;
    publishOnSync: boolean;
    priceConfirmed: boolean;
    images: ReadonlyArray<{ filePath: string; position: number }>;
  };
};

export type CaptureFormStore = CaptureFormState & CaptureFormActions;

export const initialCaptureState: CaptureFormState = {
  step: 'camera',
  name: '',
  price: '',
  categoryId: null,
  categoryName: null,
  description: '',
  imageUris: [],
  saving: false,
  lastSavedLocalId: null,
};

const MAX_IMAGES = 5;

let draftCounter = 0;
function makeDraftId(): string {
  draftCounter += 1;
  return `img-${Date.now().toString(36)}-${draftCounter.toString(36)}`;
}

export const createCaptureFormStore = () =>
  create<CaptureFormStore>((set, get) => ({
    ...initialCaptureState,

    setStep: (step) => {
      set({ step });
    },
    setName: (name) => {
      set({ name });
    },
    setPrice: (price) => {
      // Strip non-digit chars. The user explicitly enters an integer
      // (no decimals), so we drop commas, dots, and the empty string
      // here. The validation step enforces the > 0 rule.
      const cleaned = price.replace(/[^\d]/g, '');
      set({ price: cleaned });
    },
    setCategory: (categoryId, categoryName) => {
      set({ categoryId, categoryName });
    },
    setDescription: (description) => {
      set({ description });
    },
    addImage: (uri, filePath) => {
      const state = get();
      if (state.imageUris.length >= MAX_IMAGES) {
        // Silent no-op; the screen renders the limit hint.
        return;
      }
      set({
        imageUris: [
          ...state.imageUris,
          { uri, filePath, draftId: makeDraftId() },
        ],
      });
    },
    removeImage: (draftId) => {
      const state = get();
      set({
        imageUris: state.imageUris.filter((img) => img.draftId !== draftId),
      });
    },
    setSaving: (saving) => {
      set({ saving });
    },
    setLastSavedLocalId: (id) => {
      set({ lastSavedLocalId: id });
    },
    reset: () => {
      set({ ...initialCaptureState });
    },
    validate: () => {
      const state = get();
      const trimmedName = state.name.trim();
      if (trimmedName.length === 0) {
        return presentError('datos-invalidos', {
          field: 'nombre',
          reason: 'required',
        });
      }
      if (state.price.trim().length === 0) {
        return presentError('datos-invalidos', {
          field: 'precio',
          reason: 'required',
        });
      }
      const priceNumber = Number(state.price);
      if (!Number.isInteger(priceNumber)) {
        return presentError('datos-invalidos', {
          field: 'precio',
          reason: 'not-integer',
        });
      }
      if (priceNumber <= 0) {
        return presentError('datos-invalidos', {
          field: 'precio',
          reason: 'must-be-positive',
        });
      }
      if (state.categoryId === null) {
        return presentError('datos-invalidos', {
          field: 'categoria',
          reason: 'required',
        });
      }
      return null;
    },
    buildProduct: () => {
      const state = get();
      const priceNumber = Number(state.price);
      const status: ProductStatus = 'pending';
      const localId = uuid();
      const images = state.imageUris
        .filter((img) => img.filePath !== null)
        .map((img, index) => ({
          filePath: img.filePath as string,
          position: index,
        }));
      return {
        localId,
        name: state.name.trim(),
        price: priceNumber,
        categoryId: state.categoryId,
        categoryName: state.categoryName,
        description:
          state.description.trim().length > 0
            ? state.description.trim()
            : null,
        status,
        publishOnSync: false,
        priceConfirmed: false,
        images,
      };
    },
  }));

export const CAPTURE_FORM_LIMITS = {
  maxImages: MAX_IMAGES,
} as const;
