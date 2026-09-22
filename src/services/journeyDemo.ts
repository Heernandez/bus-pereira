import { dummyStops, routeOptions, getVariantCoordinates, sliceRouteSegment, type Coordinate, type Location, type RouteOption } from '../data/catalog';
import type { BusLeg, Itinerary, JourneyLeg, JourneyPlace, JourneyRequest, JourneyResponse, WalkLeg } from '../types/journey';

function distance(a: Coordinate, b: Coordinate) {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude - a.latitude) * rad / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin((b.longitude - a.longitude) * rad / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
const place = (stop: Location): JourneyPlace => ({ latitude: stop.latitude, longitude: stop.longitude, name: stop.name, stopId: stop.id });
function walk(from: JourneyPlace, to: JourneyPlace, id: string): WalkLeg {
  const meters = Math.round(distance(from, to));
  return { id, mode: 'walk', from, to, distanceMeters: meters, durationSeconds: Math.ceil(meters / 1.35),
    geometry: { coordinates: [from, to], source: 'approximate' } };
}

// Small, explicitly simulated catalog only. Never used as a fallback for backend failure.
// Demo transfers are possible at a shared stop only; it invents no walkable connections.
export function planDemoJourney(input: JourneyRequest, stops = dummyStops, routes: RouteOption[] = routeOptions): JourneyResponse {
  const origin: JourneyPlace = { ...input.origin, name: 'Origen' };
  const destination: JourneyPlace = { ...input.destination, name: 'Destino' };
  const limit = input.preferences.maxWalkingDistanceMeters;
  const transitStops = stops.filter(stop => stop.type !== 'poi');
  const candidates = (point: JourneyRequest['origin']) => transitStops.filter(stop => point.stopId
    ? stop.id === point.stopId : distance(point, stop) <= limit);
  const starts = candidates(input.origin);
  const ends = new Set(candidates(input.destination).map(stop => stop.id));
  const results: Itinerary[] = [];
  function add(legs: JourneyLeg[]) {
    const walkingDistanceMeters = legs.reduce((sum, leg) => sum + (leg.mode === 'walk' ? leg.distanceMeters : 0), 0);
    if (walkingDistanceMeters > limit) return;
    const busCount = legs.filter(leg => leg.mode === 'bus').length;
    results.push({ id: legs.map(leg => leg.id).join('|'), legs, walkingDistanceMeters,
      transfers: Math.max(0, busCount - 1),
      durationSeconds: legs.reduce((sum, leg) => sum + leg.durationSeconds + (leg.mode === 'bus' ? leg.waitSeconds ?? 0 : 0), 0),
      warnings: ['Simulación: caminatas aproximadas y tiempos de bus y espera ficticios.'],
    });
  }
  const directWalk = walk(origin, destination, 'walk-only');
  if (directWalk.distanceMeters <= limit) add([directWalk]);

  function visit(current: Location, legs: JourneyLeg[], visited: Set<string>, rides: number, previousVariant?: string) {
    if (rides > 0 && ends.has(current.id)) {
      const lastWalk = walk(place(current), destination, 'egress');
      add(lastWalk.distanceMeters > 0 || !input.destination.stopId ? [...legs, lastWalk] : legs);
    }
    if (rides >= Math.min(2, input.preferences.maxTransfers) + 1) return;
    for (const route of routes) for (const variant of route.variants) {
      if (variant.id === previousVariant) continue;
      // Occurrences, not indexOf: loops can visit a stop more than once.
      variant.stopSequence.forEach((stopId, fromIndex) => {
        if (stopId !== current.id) return;
        for (let toIndex = fromIndex + 1; toIndex < variant.stopSequence.length; toIndex++) {
          const next = transitStops.find(stop => stop.id === variant.stopSequence[toIndex]);
          if (!next || visited.has(next.id)) continue;
          const coordinates = sliceRouteSegment(getVariantCoordinates(variant, stops),
            variant.stopSequence.map(id => stops.find(stop => stop.id === id)), fromIndex, toIndex);
          const meters = Math.round(coordinates.reduce((sum, point, index) => index ? sum + distance(coordinates[index - 1], point) : 0, 0));
          const leg: BusLeg = {
            id: `${variant.id}:${fromIndex}:${toIndex}`, mode: 'bus', from: place(current), to: place(next),
            routeId: route.id, variantId: variant.id, routeCode: route.code, headsign: variant.destinationName, color: route.color,
            distanceMeters: meters, durationSeconds: Math.max(60, Math.ceil(meters / 6)), waitSeconds: 180,
            timingSource: 'estimated', geometry: { coordinates, source: 'approximate' },
          };
          visit(next, [...legs, leg], new Set([...visited, next.id]), rides + 1, variant.id);
        }
      });
    }
  }
  for (const start of starts) {
    const access = walk(origin, place(start), `access:${start.id}`);
    visit(start, access.distanceMeters > 0 || !input.origin.stopId ? [access] : [], new Set([start.id]), 0);
  }
  results.sort((a, b) => {
    const preference = input.preferences.optimize;
    const primary = preference === 'least_walking' ? a.walkingDistanceMeters - b.walkingDistanceMeters
      : preference === 'fewest_transfers' ? a.transfers - b.transfers : 0;
    return primary || a.durationSeconds! - b.durationSeconds! || a.transfers - b.transfers;
  });
  const unique = [...new Map(results.map(item => [item.id, item])).values()].slice(0, 3);
  return { data: { itineraries: unique }, meta: { contractVersion: 1, source: 'demo', generatedAt: new Date().toISOString(),
    ...(!unique.length ? { noRouteReason: 'no_connection' as const } : {}) } };
}
