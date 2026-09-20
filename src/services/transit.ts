import { startupSpan } from './startupTiming';
import { backendArrival, backendBus } from './liveProtocol';
import { getVariantCoordinates, defaultRegion, mockStops, routeOptions, type MockLocation, type RouteOption, type RouteVariant } from '../data/mockData';

// Expo replaces these literal references when bundling.
export const USE_DUMMY_DATA = process.env.EXPO_PUBLIC_USE_DUMMY_DATA !== 'false';
export const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
export type LiveBus = {
  id: string; routeId: string; variantId: string; routeCode: string; tripId?: string;
  coordinate: { latitude: number; longitude: number } | null;
  heading: number | null; etaMinutes: number | null; lastPositionAt: string | null;
  live: boolean; nextStopId?: string; source: 'demo' | 'gps';
};
export type Incident = { id: string; title: string; description?: string };
export type Catalog = {
  city: { id: string; name: string; country: string; defaultRegion: typeof defaultRegion };
  stops: MockLocation[]; stations: MockLocation[]; routes: RouteOption[];
};
export type Arrival = {
  id: string; route: RouteOption; variant: RouteVariant;
  vehicle: { id: string; label: string } | null; tripId: string | null;
  arrivalMinutes: number | null; estimatedArrivalAt: string | null;
  predictionSource: 'demo' | 'gps' | 'schedule' | 'unavailable'; lastPositionAt: string | null;
};
export type ArrivalsResponse = {
  data: { station: MockLocation; servingRoutes: { route: RouteOption; variant: RouteVariant }[]; arrivals: Arrival[]; buses?: LiveBus[]; incidents?: Incident[] };
  meta: { source: 'demo' | 'live'; generatedAt: string; refreshAfterSeconds: number };
};
export type Product = { id: 'round_trip' | '7_days' | '28_days'; name: string; price: number; currency: 'COP'; uses: number | null; validityDays: number | null };

export class ApiError extends Error {
  constructor(public status: number) { super(`El servicio no pudo completar la consulta (${status}).`); }
}
export async function request<T>(path: string, signal?: AbortSignal, headers?: Record<string, string>): Promise<T> {
  if (!API_URL || !/^https?:\/\//.test(API_URL)) throw new Error('Configura EXPO_PUBLIC_API_URL para conectarte al servicio.');
  const finish = startupSpan(`HTTP GET ${path}`);
  let status: number | undefined;
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 12000);
  const url = `${API_URL}${path}`;
  let receivedResponse = false;
  try {
    // Temporary HTTP diagnostics while connecting the mobile app to the backend.
    console.log(`[${new Date().toISOString()}] [HTTP] GET ${url}`);
    const response = await fetch(url, { signal: controller.signal, headers });
    status = response.status;
    receivedResponse = true;
    console.log(`[${new Date().toISOString()}] [HTTP] GET ${url} -> ${response.status}`);
    if (!response.ok) throw new ApiError(response.status);
    const json = await response.json();
    if (!json || !('data' in json)) throw new Error('El servicio devolvió una respuesta no válida.');
    finish('ok', { httpStatus: status });
    return json as T;
  } catch (error) {
    finish(signal?.aborted ? 'cancelado' : controller.signal.aborted ? 'timeout' : 'error', { httpStatus: status });
    if (!receivedResponse) {
      const reason = signal?.aborted ? 'cancelada' : controller.signal.aborted ? 'timeout' : 'error de red';
      console.log(`[${new Date().toISOString()}] [HTTP] GET ${url} -> sin respuesta HTTP (${reason})`);
    }
    if (signal?.aborted) throw error;
    if (controller.signal.aborted) throw new Error('La consulta tardó demasiado. Intenta nuevamente.');
    throw error instanceof Error ? error : new Error('No pudimos conectar con el servicio.');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export async function getCatalog(signal?: AbortSignal): Promise<Catalog> {
  if (USE_DUMMY_DATA) return {
    city: { id: 'pereira', name: 'Pereira', country: 'CO', defaultRegion },
    stops: mockStops, stations: mockStops.filter(stop => stop.type !== 'poi'), routes: routeOptions,
  };
  const [city, stops, stations, routes] = await Promise.all([
    request<{ data: Catalog['city'] }>('/city', signal), request<{ data: MockLocation[] }>('/stops', signal),
    request<{ data: MockLocation[] }>('/stations', signal), request<{ data: RouteOption[] }>('/routes', signal),
  ]);
  return { city: city.data, stops: stops.data, stations: stations.data, routes: routes.data };
}
export async function getArrivals(id: string, signal?: AbortSignal): Promise<ArrivalsResponse> {
  if (!USE_DUMMY_DATA) {
    const response = await request<ArrivalsResponse>(`/stations/${encodeURIComponent(id)}/arrivals`, signal);
    const buses = response.data.buses ?? response.data.arrivals.flatMap(item => {
      const bus = backendBus(item, item.route); return bus ? [bus] : [];
    });
    return { ...response, data: { ...response.data, buses,
      arrivals: response.data.arrivals.map(item => backendArrival(item, item.route, item.variant) ?? item) } };
  }
  const station = mockStops.find(stop => stop.id === id && stop.type !== 'poi');
  if (!station) throw new Error('Estación no encontrada');
  const now = Date.now();
  const servingRoutes = routeOptions.flatMap(route => route.variants.filter(variant => variant.stopSequence.includes(id)).map(variant => ({ route, variant })));
  const buses = createDemoBuses(servingRoutes, station);
  return {
    data: { station, servingRoutes, buses, incidents: [], arrivals: servingRoutes.map(({ route, variant }, index) => ({
      id: `demo:${id}:${variant.id}`, route, variant, vehicle: buses.find(bus => bus.variantId === variant.id) ? { id: `demo:${variant.id}`, label: route.code } : null, tripId: `demo-trip:${variant.id}`,
      arrivalMinutes: 3 + index * 4, estimatedArrivalAt: new Date(now + (3 + index * 4) * 60000).toISOString(), predictionSource: 'demo', lastPositionAt: null,
    })) },
    meta: { source: 'demo', generatedAt: new Date(now).toISOString(), refreshAfterSeconds: 30 },
  };
}
export async function getProducts(signal?: AbortSignal): Promise<Product[]> {
  if (!USE_DUMMY_DATA) return (await request<{ data: Product[] }>('/products', signal)).data;
  return [
    { id: 'round_trip', name: 'Ida y regreso', price: 6000, currency: 'COP', uses: 2, validityDays: null },
    { id: '7_days', name: 'Pasabordo 7 días', price: 42000, currency: 'COP', uses: null, validityDays: 7 },
    { id: '28_days', name: 'Pasabordo 28 días', price: 168000, currency: 'COP', uses: null, validityDays: 28 },
  ];
}

export function createDemoBuses(items: { route: RouteOption; variant: RouteVariant }[], station?: MockLocation): LiveBus[] {
  const now = Date.now();
  return items.flatMap(({ route, variant }, index) => {
    const points = getVariantCoordinates(variant);
    if (points.length < 2) return [];
    const last = station ? points.reduce((nearest, point, i) => {
      const distance = (p: typeof point) => Math.hypot(p.latitude - station.latitude, p.longitude - station.longitude);
      return distance(point) < distance(points[nearest]) ? i : nearest;
    }, 0) : points.length - 1;
    if (last < 1) return [];
    const progress = ((now / 180000 + index * 0.23) % 1) * last;
    const from = Math.min(last - 1, Math.floor(progress));
    const fraction = progress - from;
    const a = points[from]; const b = points[from + 1];
    return [{
      id: `demo:${variant.id}`, routeId: route.id, variantId: variant.id, routeCode: route.code,
      tripId: `demo-trip:${variant.id}`, coordinate: {
        latitude: a.latitude + (b.latitude - a.latitude) * fraction,
        longitude: a.longitude + (b.longitude - a.longitude) * fraction,
      }, heading: (Math.atan2(b.longitude - a.longitude, b.latitude - a.latitude) * 180 / Math.PI + 360) % 360,
      etaMinutes: Math.max(1, Math.ceil((last - progress) / last * 5)), lastPositionAt: new Date(now).toISOString(),
      nextStopId: station?.id ?? variant.stopSequence[Math.min(variant.stopSequence.length - 1, Math.ceil(progress / last * (variant.stopSequence.length - 1)))], live: false, source: 'demo' as const,
    }];
  });
}

export type RouteLiveResponse = {
  data: {
    route: RouteOption; stops: MockLocation[];
    shapes: { variantId: string; coordinates: { latitude: number; longitude: number }[] }[];
    buses?: LiveBus[]; incidents?: Incident[];
    nextDepartures?: { id: string; variantId: string; departureAt: string; destinationName: string }[];
  };
  meta: { source: 'demo' | 'live'; generatedAt: string; refreshAfterSeconds: number; liveAvailable?: boolean };
};
export async function getRouteLive(id: string, signal?: AbortSignal): Promise<RouteLiveResponse> {
  let route: RouteOption;
  let stops: MockLocation[];
  if (USE_DUMMY_DATA) {
    const found = routeOptions.find(route => route.id === id);
    if (!found) throw new Error('Ruta no encontrada');
    route = found; stops = mockStops;
  } else {
    try {
      const response = await request<{ data: RouteLiveResponse['data'] & {
        variants?: { id: string; shape: RouteVariant['geometry']; stations: MockLocation[] }[];
        updatedAt?: string;
      }; meta: RouteLiveResponse['meta'] }>(`/routes/${encodeURIComponent(id)}/live`, signal);
      const data = response.data;
      const stops = data.stops ?? [...new Map((data.variants ?? []).flatMap(variant => variant.stations).map(stop => [stop.id, stop])).values()];
      const shapes = data.shapes ?? (data.variants ?? []).map(item => {
        const variant = data.route.variants.find(variant => variant.id === item.id);
        return { variantId: item.id, coordinates: variant && item.shape.status === 'ready'
          ? getVariantCoordinates({ ...variant, geometry: item.shape }, []) : [] };
      });
      return { data: { ...data, stops, shapes, buses: (data.buses ?? []).flatMap(item => {
        const bus = backendBus(item, data.route); return bus ? [bus] : [];
      }) }, meta: { ...response.meta, generatedAt: data.updatedAt ?? new Date().toISOString(), refreshAfterSeconds: response.meta.refreshAfterSeconds ?? 30, liveAvailable: true } };
    }
    catch (error) { if (!(error instanceof ApiError) || error.status !== 404) throw error; }
    // Older backend: show its actual route geometry, explicitly without live buses.
    const [routeResponse, stopsResponse] = await Promise.all([
      request<{ data: RouteOption }>(`/routes/${encodeURIComponent(id)}`, signal),
      request<{ data: MockLocation[] }>('/stops', signal),
    ]);
    route = routeResponse.data; stops = stopsResponse.data;
  }
  const shapes = route.variants.map(variant => ({ variantId: variant.id,
    coordinates: USE_DUMMY_DATA || variant.geometry.status === 'ready' &&
      (variant.geometry.coordinates.length > 0 || variant.geometry.encodedPolyline)
      ? getVariantCoordinates(variant, stops) : [],
  }));
  return {
    data: { route, stops: stops.filter(stop => route.variants.some(variant => variant.stopSequence.includes(stop.id))), shapes,
      buses: USE_DUMMY_DATA ? createDemoBuses(route.variants.map(variant => ({ route, variant }))) : [], incidents: [], nextDepartures: [] },
    meta: { source: USE_DUMMY_DATA ? 'demo' : 'live', generatedAt: new Date().toISOString(), refreshAfterSeconds: 30, liveAvailable: USE_DUMMY_DATA },
  };
}
