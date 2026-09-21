import data from './dummyData.json';
import polyline from '@mapbox/polyline';

export type LocationType = 'stop' | 'station' | 'poi';

export type Coordinate = {
  latitude: number;
  longitude: number;
};

export type Location = {
  id: string;
  name: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  type: LocationType;
};

export type RouteVariant = {
  id: string;
  direction: 'outbound' | 'return';
  destinationName: string;
  stopSequence: string[];
  geometry: {
    provider: 'mock' | 'google-routes' | 'manual';
    status: 'pending' | 'ready';
    encodedPolyline: string | null;
    coordinates: Coordinate[];
  };
};

export type RouteOption = {
  id: string;
  code: string;
  name: string;
  description: string;
  mode: 'bus';
  color: string;
  duration: string;
  transfers: string;
  stops: string;
  variants: RouteVariant[];
};

export const defaultRegion = data.city.defaultRegion;

export const dummyStops: Location[] = data.stops as Location[];

export const routeOptions: RouteOption[] = data.routes as RouteOption[];

export const getStopById = (id: string) => dummyStops.find((stop) => stop.id === id);

// Real stops can sit within meters of each other (e.g. separate boarding/alighting bays for the
// same corridor), so the single raw-nearest stop isn't always the one a given route actually
// serves. Callers try these candidates closest-first and fall back to the nearest one.
const CANDIDATE_STOP_LIMIT = 5;

export const getNearestStops = (point: Coordinate, stops: Location[]): Location[] =>
  stops
    .filter(stop => stop.type !== 'poi')
    .map(stop => ({
      stop,
      distance: Math.abs(stop.latitude - point.latitude) + Math.abs(stop.longitude - point.longitude),
    }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, CANDIDATE_STOP_LIMIT)
    .map(({ stop }) => stop);

export const findDirectVariant = (route: RouteOption, originId: string, destinationId: string) =>
  route.variants.find(variant => {
    const from = variant.stopSequence.indexOf(originId);
    return from >= 0 && variant.stopSequence.indexOf(destinationId, from + 1) > from;
  });

export const hasDirectRoute = (routes: RouteOption[], originId: string, destinationId: string) =>
  routes.some(route => Boolean(findDirectVariant(route, originId, destinationId)));

export const getVariantCoordinates = (variant: RouteVariant, stops: Location[] = dummyStops): Coordinate[] => {
  if (variant.geometry.coordinates.length > 0) {
    return variant.geometry.coordinates;
  }

  if (variant.geometry.encodedPolyline) {
    return polyline.decode(variant.geometry.encodedPolyline).map(([latitude, longitude]) => ({
      latitude,
      longitude,
    }));
  }

  return variant.stopSequence
    .map((stopId) => stops.find(stop => stop.id === stopId))
    .filter((stop): stop is Location => Boolean(stop));
};

function nearestCoordinateIndex(coordinates: Coordinate[], target: Coordinate, startAt: number): number {
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let index = startAt; index < coordinates.length; index += 1) {
    const point = coordinates[index];
    const distance = Math.hypot(point.latitude - target.latitude, point.longitude - target.longitude);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

// Snaps stops [startStopIndex, endStopIndex] onto the route shape in that order, advancing the
// search cursor monotonically. Without this, a nearby-but-wrong point on the shape (e.g. a sibling
// station a few meters from the real one, or an earlier bend of the road) can outrank the actual
// stop purely on raw distance, since a whole-array nearest search has no notion of stop order.
function snapStopsToShape(coordinates: Coordinate[], stops: (Coordinate | undefined)[], startStopIndex: number, endStopIndex: number, cursor: number): number {
  let matched = -1;
  for (let index = startStopIndex; index <= endStopIndex; index += 1) {
    const stop = stops[index];
    if (!stop) continue;
    const found = nearestCoordinateIndex(coordinates, stop, cursor);
    if (found < 0) continue;
    cursor = found;
    matched = found;
  }
  return matched;
}

// Slices a full route shape down to the boarding→alighting segment a passenger actually rides,
// instead of painting the whole terminal-to-terminal geometry. stopCoordinates must be the full,
// in-order coordinates for the variant's stopSequence, so every earlier stop can be snapped first.
export function sliceRouteSegment(
  coordinates: Coordinate[],
  stopCoordinates: (Coordinate | undefined)[],
  fromStopIndex: number,
  toStopIndex: number,
): Coordinate[] {
  const from = stopCoordinates[fromStopIndex];
  const to = stopCoordinates[toStopIndex];
  if (!from || !to) return [];
  if (coordinates.length < 2) return [from, to];
  const fromShapeIndex = snapStopsToShape(coordinates, stopCoordinates, 0, fromStopIndex, 0);
  if (fromShapeIndex < 0) return [from, to];
  const toShapeIndex = snapStopsToShape(coordinates, stopCoordinates, fromStopIndex + 1, toStopIndex, fromShapeIndex + 1);
  if (toShapeIndex < 0 || toShapeIndex <= fromShapeIndex) return [from, to];
  return coordinates.slice(fromShapeIndex, toShapeIndex + 1);
}
