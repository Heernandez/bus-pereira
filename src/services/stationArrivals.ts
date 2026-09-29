import type { RouteOption, RouteVariant } from '../data/catalog';
import type { Arrival } from './transit';

// What a passenger waiting at a station can board. A bus that ends its variant at a terminal leaves
// again on the variant that starts there, after the driver's layover.
export type Departure = {
  id: string;
  arrival: Arrival;
  // Variant boarded here: at a terminal, the one the bus starts after the layover.
  variant: RouteVariant;
  kind: 'pass' | 'terminal' | 'ends';
  // Only for 'terminal'; null while the catalog does not provide the layover.
  layoverMinutes: number | null;
};

function toDeparture(arrival: Arrival, stationId: string): Departure {
  const { route, variant } = arrival;
  const base = { id: arrival.id, arrival, variant, layoverMinutes: null };
  if (variant.stopSequence?.at(-1) !== stationId) return { ...base, kind: 'pass' };
  const starting = (route.variants ?? []).filter(item => item.stopSequence[0] === stationId);
  // Loop routes restart the same variant.
  const next = starting.find(item => item.id !== variant.id) ?? starting[0];
  if (!next) return { ...base, kind: 'ends' };
  const layover = next.layoverMinutes;
  return { ...base, variant: next, kind: 'terminal',
    layoverMinutes: typeof layover === 'number' && Number.isFinite(layover) && layover >= 0 ? layover : null };
}

export function departureMinutes(item: Departure, arrivalMinutes = item.arrival.arrivalMinutes): number | null {
  return arrivalMinutes === null ? null : arrivalMinutes + (item.layoverMinutes ?? 0);
}

export function departureAt(item: Departure): Date | null {
  const at = item.arrival.estimatedArrivalAt ? Date.parse(item.arrival.estimatedArrivalAt) : NaN;
  return Number.isFinite(at) ? new Date(at + (item.layoverMinutes ?? 0) * 60000) : null;
}

// Station predictions are authoritative: route bus ETAs refer to its next stop.
export function stationDepartures(arrivals: Arrival[], stationId: string): Departure[] {
  const seen = new Set<string>();
  return arrivals.map(item => toDeparture(item, stationId))
    .sort((a, b) => (departureMinutes(a) ?? Infinity) - (departureMinutes(b) ?? Infinity) || a.id.localeCompare(b.id))
    // A scheduled trip that ends here has nobody to pick up.
    .filter(item => item.kind !== 'ends' || item.arrival.vehicle !== null)
    // The backend may also list the bus's next trip from the terminal; keep its earliest departure.
    .filter(item => {
      const key = item.arrival.vehicle ? `${item.arrival.vehicle.id}:${item.variant.id}` : item.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function departuresForRoute(arrivals: Arrival[], stationId: string, routeId: string, variantId?: string): Departure[] {
  return stationDepartures(arrivals, stationId)
    .filter(item => item.arrival.route.id === routeId && (!variantId || item.variant.id === variantId));
}

// One entry per route, whatever its direction, preferring a variant that can be boarded here.
export function routesAtStation(serving: { route: RouteOption; variant: RouteVariant }[], stationId: string) {
  const byRoute = new Map<string, { route: RouteOption; variant: RouteVariant }>();
  for (const item of serving) {
    const current = byRoute.get(item.route.id);
    const boardable = item.variant.stopSequence?.at(-1) !== stationId;
    if (!current || (boardable && current.variant.stopSequence?.at(-1) === stationId)) byRoute.set(item.route.id, item);
  }
  return [...byRoute.values()].sort((a, b) => a.route.code.localeCompare(b.route.code, 'es', { numeric: true }));
}
