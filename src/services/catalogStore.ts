import type { CatalogCache, CachedCatalog } from './catalogCache';
import type { Catalog } from './transit';
import { logger } from './logger';

// Used only while the backend has no /catalog/release: refresh a cached catalog once a day.
export const CATALOG_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type State = { data: Catalog | null; error: string | null };

// Shared, cache-first catalog. Screens get the stored copy immediately; the network is only
// asked for the catalog when the backend's release changed (or, without release support,
// when the copy is older than CATALOG_MAX_AGE_MS).
export function createCatalogStore({ cache, fetchCatalog, fetchRelease, now = Date.now }: {
  cache: CatalogCache;
  fetchCatalog: () => Promise<Catalog>;
  // Resolves null when the backend does not expose a release yet.
  fetchRelease: () => Promise<string | null>;
  now?: () => number;
}) {
  let state: State = { data: null, error: null };
  let running: Promise<void> | null = null;
  const listeners = new Set<() => void>();
  const set = (next: State) => { state = next; listeners.forEach(listener => listener()); };

  const download = async (release: string | null) => {
    const data = await fetchCatalog();
    set({ data, error: null });
    try { await cache.write({ release, savedAt: now(), data }); }
    catch (error) { logger.warn('[Catálogo] No se pudo guardar la copia local', error instanceof Error ? error.message : String(error)); }
  };

  const sync = async () => {
    let cached: CachedCatalog | null = null;
    try { cached = await cache.read(); }
    catch (error) { logger.warn('[Catálogo] No se pudo leer la copia local', error instanceof Error ? error.message : String(error)); }
    if (cached) set({ data: cached.data, error: null });

    let release: string | null = null;
    try { release = await fetchRelease(); }
    catch (error) {
      // Offline or backend down: the stored copy is good enough.
      if (cached) { logger.log('[Catálogo] Sin conexión para validar release; se usa la copia local'); return; }
    }
    if (cached) {
      const current = release !== null ? release === cached.release : now() - cached.savedAt < CATALOG_MAX_AGE_MS;
      if (current) { logger.log('[Catálogo] Copia local vigente', { release: cached.release }); return; }
      logger.log('[Catálogo] Actualizando', { from: cached.release, to: release });
      try { await download(release); }
      catch (error) { logger.warn('[Catálogo] Falló la actualización; se mantiene la copia local', error instanceof Error ? error.message : String(error)); }
      return;
    }
    try { await download(release); }
    catch (error) { set({ data: null, error: error instanceof Error ? error.message : 'No se pudieron cargar los datos.' }); }
  };

  const run = () => running ??= sync().finally(() => { running = null; });

  return {
    getState: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    // Idempotent: the first screen to mount starts the sync, later ones share it.
    start: () => { if (!state.data && !state.error) void run(); },
    reload: () => { set({ ...state, error: null }); void run(); },
  };
}
export type CatalogStore = ReturnType<typeof createCatalogStore>;
