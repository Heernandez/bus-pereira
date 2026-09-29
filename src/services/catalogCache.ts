import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { base64url, decode64 } from './passProtocol';
import type { Catalog } from './transit';

// Bump when the Catalog shape changes: older caches are then ignored and re-downloaded.
const CACHE_VERSION = 1;
const DATA_KEY = `bus-pereira:catalog:v${CACHE_VERSION}`;
const SECRET_KEY = 'bus-pereira.catalog-key.v1';
const AAD = new TextEncoder().encode(DATA_KEY);

export type CachedCatalog = { release: string | null; savedAt: number; data: Catalog };
type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<unknown>; removeItem: (key: string) => Promise<unknown> };
type SecretStore = { getItemAsync: (key: string) => Promise<string | null>; setItemAsync: (key: string, value: string) => Promise<unknown> };

// The catalog (~200 KB) is too large for SecureStore, so it is encrypted with XChaCha20-Poly1305
// and stored in `storage`; only the 256-bit key lives in `secrets` (Android Keystore / iOS Keychain).
export function createCatalogCache({ storage, secrets, randomBytes }: {
  storage: Storage; secrets: SecretStore; randomBytes: (length: number) => Uint8Array;
}) {
  let keyPromise: Promise<Uint8Array> | undefined;
  const key = () => keyPromise ??= (async () => {
    const stored = await secrets.getItemAsync(SECRET_KEY);
    if (stored) return decode64(stored);
    const created = randomBytes(32);
    await secrets.setItemAsync(SECRET_KEY, base64url(created));
    return created;
  })().catch(error => { keyPromise = undefined; throw error; });

  return {
    async read(): Promise<CachedCatalog | null> {
      const stored = await storage.getItem(DATA_KEY);
      if (!stored) return null;
      try {
        const [nonce, sealed] = stored.split('.').map(decode64);
        const plain = xchacha20poly1305(await key(), nonce, AAD).decrypt(sealed);
        return JSON.parse(new TextDecoder().decode(plain)) as CachedCatalog;
      } catch {
        // Tampered, corrupted or encrypted with a lost key: drop it and download again.
        await storage.removeItem(DATA_KEY);
        return null;
      }
    },
    async write(value: CachedCatalog) {
      const nonce = randomBytes(24);
      const sealed = xchacha20poly1305(await key(), nonce, AAD).encrypt(new TextEncoder().encode(JSON.stringify(value)));
      await storage.setItem(DATA_KEY, `${base64url(nonce)}.${base64url(sealed)}`);
    },
  };
}
export type CatalogCache = ReturnType<typeof createCatalogCache>;
