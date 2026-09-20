import type { LiveBus } from './transit';
export type BusPatch = Pick<LiveBus, 'id'> & Partial<Pick<LiveBus, 'coordinate' | 'heading' | 'etaMinutes' | 'lastPositionAt' | 'live' | 'nextStopId'>>;
export function isRecentBus(bus: LiveBus, now = Date.now()): boolean {
  const time = Date.parse(bus.lastPositionAt ?? '');
  return !!bus.coordinate && Number.isFinite(time) && time <= now + 10000 && now - time <= 90000;
}
export function validCoordinate(value: unknown): value is NonNullable<LiveBus['coordinate']> {
  if (!value || typeof value !== 'object') return false;
  const point = value as Record<string, unknown>;
  return typeof point.latitude === 'number' && Number.isFinite(point.latitude) && Math.abs(point.latitude) <= 90 &&
    typeof point.longitude === 'number' && Number.isFinite(point.longitude) && Math.abs(point.longitude) <= 180;
}
export function validBus(value: unknown): value is LiveBus {
  if (!value || typeof value !== 'object') return false;
  const bus = value as LiveBus;
  return ['id', 'routeId', 'variantId', 'routeCode'].every(key => typeof (bus as unknown as Record<string, unknown>)[key] === 'string') &&
    (bus.coordinate === null || validCoordinate(bus.coordinate)) && (bus.lastPositionAt === null || Number.isFinite(Date.parse(bus.lastPositionAt))) &&
    (bus.heading === null || typeof bus.heading === 'number' && Number.isFinite(bus.heading)) &&
    (bus.etaMinutes === null || typeof bus.etaMinutes === 'number' && Number.isFinite(bus.etaMinutes) && bus.etaMinutes >= 0) &&
    typeof bus.live === 'boolean' && ['demo', 'gps'].includes(bus.source);
}
// Screen-scoped normalized state. Position changes notify only that bus's subscribers.
export class LiveBusStore {
  private buses = new Map<string, LiveBus>();
  private ids: string[] = [];
  private listListeners = new Set<() => void>();
  private listeners = new Map<string, Set<() => void>>();
  getIds = () => this.ids;
  get = (id: string) => this.buses.get(id);
  subscribeIds = (listener: () => void) => { this.listListeners.add(listener); return () => { this.listListeners.delete(listener); }; };
  subscribe = (id: string, listener: () => void) => {
    const set = this.listeners.get(id) ?? new Set(); set.add(listener); this.listeners.set(id, set);
    return () => { set.delete(listener); if (!set.size) this.listeners.delete(id); };
  };
  private notify(id: string) { this.listeners.get(id)?.forEach(listener => listener()); }
  private updateIds() {
    const next = [...this.buses.keys()];
    if (next.length === this.ids.length && next.every((id, index) => id === this.ids[index])) return;
    this.ids = next; this.listListeners.forEach(listener => listener());
  }
  replace(buses: LiveBus[]) {
    const incoming = new Set(buses.filter(validBus).map(bus => bus.id));
    for (const id of this.buses.keys()) if (!incoming.has(id)) { this.buses.delete(id); this.notify(id); }
    buses.forEach(bus => this.upsert(bus, false)); this.updateIds();
  }
  upsert(bus: LiveBus, notifyList = true) {
    if (!validBus(bus)) return;
    const previous = this.buses.get(bus.id);
    if (previous?.lastPositionAt && bus.lastPositionAt && Date.parse(bus.lastPositionAt) < Date.parse(previous.lastPositionAt)) return;
    if (JSON.stringify(previous) === JSON.stringify(bus)) return;
    this.buses.set(bus.id, bus); this.notify(bus.id); if (notifyList) this.updateIds();
  }
  patch(patch: BusPatch) {
    const previous = this.buses.get(patch.id); if (!previous) return;
    if ('coordinate' in patch && !patch.lastPositionAt) return;
    const next = { ...previous };
    for (const key of ['coordinate', 'heading', 'etaMinutes', 'lastPositionAt', 'live', 'nextStopId'] as const) {
      if (key in patch) Object.assign(next, { [key]: patch[key] });
    }
    this.upsert(next);
  }
  remove(id: string) { if (this.buses.delete(id)) { this.notify(id); this.updateIds(); } }
}
