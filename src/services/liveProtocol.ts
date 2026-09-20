import type { Arrival, LiveBus } from './transit';
import type { RouteOption, RouteVariant } from '../data/mockData';
import { validCoordinate } from './liveBuses';

export function backendBus(value: unknown, route?: RouteOption, previous?: LiveBus): LiveBus | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const id = raw.busId ?? raw.vehicleId ?? raw.id;
  const routeId = raw.routeId ?? route?.id ?? previous?.routeId;
  const variantId = raw.variantId ?? previous?.variantId;
  if (typeof id !== 'string' || typeof routeId !== 'string' || typeof variantId !== 'string') return null;
  const point = raw.coordinate ?? { latitude: raw.latitude, longitude: raw.longitude };
  const heading = raw.heading ?? raw.headingDegrees ?? previous?.heading ?? null;
  const eta = raw.etaMinutes ?? raw.arrivalMinutes ?? previous?.etaMinutes ?? null;
  const stamp = raw.lastPositionAt ?? raw.measuredAt ?? previous?.lastPositionAt ?? null;
  return {
    id, routeId, variantId, routeCode: route?.code ?? previous?.routeCode ?? routeId,
    tripId: typeof raw.tripId === 'string' ? raw.tripId : undefined,
    coordinate: validCoordinate(point) ? point : null,
    heading: typeof heading === 'number' && Number.isFinite(heading) ? heading : null,
    etaMinutes: typeof eta === 'number' && eta >= 0 && Number.isFinite(eta) ? eta : null,
    lastPositionAt: typeof stamp === 'string' && Number.isFinite(Date.parse(stamp)) ? stamp : null,
    live: raw.live === true && raw.stale !== true, source: 'gps',
    nextStopId: typeof raw.nextStationId === 'string' ? raw.nextStationId : undefined,
  };
}
export function backendArrival(value: unknown, route: RouteOption, variant: RouteVariant): Arrival | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== 'string') return null;
  const vehicle = raw.vehicle as Record<string, unknown> | undefined;
  const busId = raw.busId ?? raw.vehicleId ?? vehicle?.id;
  return {
    id: raw.id, route, variant,
    vehicle: typeof busId === 'string' ? { id: busId, label: typeof vehicle?.publicLabel === 'string' ? vehicle.publicLabel : route.code } : null,
    tripId: typeof raw.tripId === 'string' ? raw.tripId : null,
    arrivalMinutes: typeof raw.arrivalMinutes === 'number' && raw.arrivalMinutes >= 0 ? raw.arrivalMinutes : null,
    estimatedArrivalAt: typeof raw.estimatedArrivalAt === 'string' ? raw.estimatedArrivalAt : null,
    predictionSource: raw.predictionSource === 'schedule' ? 'schedule' : raw.predictionSource === 'demo' ? 'demo' : raw.live === true ? 'gps' : 'unavailable',
    lastPositionAt: typeof raw.lastPositionAt === 'string' ? raw.lastPositionAt : null,
  };
}
