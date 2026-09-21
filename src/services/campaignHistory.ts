import type { Campaign } from './startup';

type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<unknown> };
const KEY = 'bus-pereira:campaign-views:v1';
// Serialize read/modify/write operations to preserve counters across overlapping callbacks.
export function createCampaignHistory(storage: Storage) {
  let pending: Promise<unknown> = Promise.resolve();
  function serial<T>(operation: () => Promise<T>): Promise<T> {
    const next = pending.then(operation, operation);
    pending = next.catch(() => {});
    return next;
  }
  async function read(): Promise<Map<string, number>> {
    const raw = await storage.getItem(KEY);
    if (!raw) return new Map();
    const entries: unknown = JSON.parse(raw);
    if (!Array.isArray(entries) || entries.some(entry => !Array.isArray(entry) ||
      typeof entry[0] !== 'string' || !Number.isSafeInteger(entry[1]) || entry[1] < 0)) {
      throw new Error('Historial de campañas no válido');
    }
    return new Map(entries as [string, number][]);
  }
  const write = (counts: Map<string, number>) => storage.setItem(KEY, JSON.stringify([...counts]));
  return {
    reconcile: (campaigns: Campaign[]) => serial(async () => {
      const counts = await read();
      const ids = new Set(campaigns.map(campaign => campaign.id));
      for (const id of counts.keys()) if (!ids.has(id)) counts.delete(id);
      await write(counts);
      return campaigns.filter(campaign => {
        const views = counts.get(campaign.id) ?? 0;
        const eligible = views < campaign.maxViewsPerDevice;
        console.info('[Campañas] Elegibilidad', { id: campaign.id, views, maxViewsPerDevice: campaign.maxViewsPerDevice, eligible });
        return eligible;
      });
    }),
    complete: (campaign: Campaign) => serial(async () => {
      const counts = await read();
      counts.set(campaign.id, Math.min(Number.MAX_SAFE_INTEGER, (counts.get(campaign.id) ?? 0) + 1));
      await write(counts);
    }),
  };
}
