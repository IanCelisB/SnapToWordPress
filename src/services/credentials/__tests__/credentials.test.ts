// src/services/credentials/__tests__/credentials.test.ts
//
// Coverage for the credentials service after the duplicate file
// (`src/services/credentials/credentials.ts`) was removed. The
// behavior contracts that matter for the activities gating on
// `hasCredentials()` and for the settings form's pre-fill logic.

import {
  clearCredentials,
  hasCredentials,
  loadCredentials,
  saveCredentials,
  validateAndSave,
} from '../../credentials';
import { getItem, setItem } from '../../../infra/secure-store';

const STORE_URL_KEY = 'store_url';
const CONSUMER_KEY_KEY = 'consumer_key';
const CONSUMER_SECRET_KEY = 'consumer_secret';

const TEST_CREDS = {
  baseUrl: 'https://mitienda.com',
  key: 'ck_test_1234567890',
  secret: 'cs_test_1234567890',
} as const;

beforeEach(async () => {
  // Reset the underlying secure store so each test starts clean.
  await clearCredentials();
});

describe('credentials service', () => {
  describe('loadCredentials', () => {
    it('returns null when nothing is stored', async () => {
      const creds = await loadCredentials();
      expect(creds).toBeNull();
    });

    it('returns null when only some keys are present', async () => {
      await setItem(STORE_URL_KEY, 'https://mitienda.com');
      const creds = await loadCredentials();
      expect(creds).toBeNull();
    });

    it('round-trips a stored credential triple', async () => {
      await saveCredentials(TEST_CREDS);
      const loaded = await loadCredentials();
      expect(loaded).toEqual(TEST_CREDS);
    });
  });

  describe('hasCredentials', () => {
    it('returns false on a fresh secure store', async () => {
      const ok = await hasCredentials();
      expect(ok).toBe(false);
    });

    it('returns true after saveCredentials', async () => {
      await saveCredentials(TEST_CREDS);
      const ok = await hasCredentials();
      expect(ok).toBe(true);
    });

    it('returns false again after clearCredentials', async () => {
      await saveCredentials(TEST_CREDS);
      await clearCredentials();
      const ok = await hasCredentials();
      expect(ok).toBe(false);
    });
  });

  describe('clearCredentials', () => {
    it('removes all three keys', async () => {
      await saveCredentials(TEST_CREDS);
      await clearCredentials();
      const url = await getItem(STORE_URL_KEY);
      const key = await getItem(CONSUMER_KEY_KEY);
      const secret = await getItem(CONSUMER_SECRET_KEY);
      expect(url).toBeNull();
      expect(key).toBeNull();
      expect(secret).toBeNull();
    });
  });

  describe('validateAndSave — invalid URL / unreachable host', () => {
    it('persists the (normalized) credentials and returns ok:false on network failure', async () => {
      // A bogus host can't be validated; we still expect the creds
      // to be persisted (this is the deliberate "persist first,
      // validate second" behaviour per commit 124f287). The
      // caller is expected to surface the failure as a non-blocking
      // notice.
      const result = await validateAndSave({
        baseUrl: 'https://no-such-host.invalid',
        key: TEST_CREDS.key,
        secret: TEST_CREDS.secret,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(['credenciales-invalidas', 'sin-conexion', 'tienda-no-accesible'])
          .toContain(result.classification);
        // The URL was canonicalized (no trailing slash) even though
        // validation failed.
        expect(result.normalizedUrl).toBe('https://no-such-host.invalid');
      }
      const stored = await loadCredentials();
      expect(stored).not.toBeNull();
      expect(stored?.baseUrl).toBe('https://no-such-host.invalid');
    });
  });
});
