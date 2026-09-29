import { startupSpan } from './startupTiming';
import { backendArrival, backendBus } from './liveProtocol';
import type { Region } from 'react-native-maps';
import { getVariantCoordinates, type Location, type RouteOption, type RouteVariant } from '../data/catalog';
import { logger } from './logger';

// Expo replaces this literal reference when bundling.
export const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
export type LiveBus = {
  id: string; routeId: string; variantId: string; routeCode: string; tripId?: string;
  coordinate: { latitude: number; longitude: number } | null;
  heading: number | null; etaMinutes: number | null; lastPositionAt: string | null;
  live: boolean; nextStopId?: string; source: 'demo' | 'gps';
};
export type Incident = { id: string; title: string; description?: string };
export type Catalog = {
  city: { id: string; name: string; country: string; defaultRegion: Region };
  stops: Location[]; stations: Location[]; routes: RouteOption[];
};
export type Arrival = {
  id: string; route: RouteOption; variant: RouteVariant;
  vehicle: { id: string; label: string } | null; tripId: string | null;
  arrivalMinutes: number | null; estimatedArrivalAt: string | null;
  predictionSource: 'demo' | 'gps' | 'schedule' | 'unavailable'; lastPositionAt: string | null;
};
export type ArrivalsResponse = {
  data: { station: Location; servingRoutes: { route: RouteOption; variant: RouteVariant }[]; arrivals: Arrival[]; buses?: LiveBus[]; incidents?: Incident[] };
  meta: { source: 'demo' | 'live'; generatedAt: string; refreshAfterSeconds: number };
};
export type Product = { id: string; name: string; price: number; currency: 'COP'; uses: number | null; validityDays: number | null };

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
    logger.log(`[${new Date().toISOString()}] [HTTP] GET ${url}`);
    const response = await fetch(url, { signal: controller.signal, headers });
    status = response.status;
    receivedResponse = true;
    logger.log(`[${new Date().toISOString()}] [HTTP] GET ${url} -> ${response.status}`);
    if (!response.ok) throw new ApiError(response.status);
    const json = await response.json();
    if (!json || !('data' in json)) throw new Error('El servicio devolvió una respuesta no válida.');
    finish('ok', { httpStatus: status });
    return json as T;
  } catch (error) {
    finish(signal?.aborted ? 'cancelado' : controller.signal.aborted ? 'timeout' : 'error', { httpStatus: status });
    if (!receivedResponse) {
      const reason = signal?.aborted ? 'cancelada' : controller.signal.aborted ? 'timeout' : 'error de red';
      logger.log(`[${new Date().toISOString()}] [HTTP] GET ${url} -> sin respuesta HTTP (${reason})`);
    }
    if (signal?.aborted) throw error;
    if (controller.signal.aborted) throw new Error('La consulta tardó demasiado. Intenta nuevamente.');
    throw error instanceof Error ? error : new Error('No pudimos conectar con el servicio.');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
}
export async function getCatalog(signal?: AbortSignal): Promise<Catalog> {
  const [city, stops, stations, routes] = await Promise.all([
    request<{ data: Catalog['city'] }>('/city', signal), request<{ data: Location[] }>('/stops', signal),
    request<{ data: Location[] }>('/stations', signal), request<{ data: RouteOption[] }>('/routes', signal),
  ]);
  return { city: city.data, stops: stops.data, stations: stations.data, routes: routes.data };
}
// Changes whenever the backend edits routes or stations; null while the backend lacks the endpoint.
export async function getCatalogRelease(signal?: AbortSignal): Promise<string | null> {
  try {
    const response = await request<{ data: { release: string | number } }>('/catalog/release', signal);
    const release = response.data?.release;
    if ((typeof release !== 'string' || !release) && !Number.isFinite(release)) throw new Error('El servicio devolvió un release de catálogo no válido.');
    return String(release);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}
export async function getArrivals(id: string, signal?: AbortSignal): Promise<ArrivalsResponse> {
  const response = await request<ArrivalsResponse>(`/stations/${encodeURIComponent(id)}/arrivals`, signal);
  const buses = response.data.buses ?? response.data.arrivals.flatMap(item => {
    const bus = backendBus(item, item.route); return bus ? [bus] : [];
  });
  return { ...response, data: { ...response.data, buses,
    arrivals: response.data.arrivals.map(item => backendArrival(item, item.route, item.variant) ?? item) } };
}
export async function getProducts(signal?: AbortSignal): Promise<Product[]> {
  return (await request<{ data: Product[] }>('/products', signal)).data;
}

export type RouteLiveResponse = {
  data: {
    route: RouteOption; stops: Location[];
    shapes: { variantId: string; coordinates: { latitude: number; longitude: number }[] }[];
    buses?: LiveBus[]; incidents?: Incident[];
    nextDepartures?: { id: string; variantId: string; departureAt: string; destinationName: string }[];
  };
  meta: { source: 'demo' | 'live'; generatedAt: string; refreshAfterSeconds: number; liveAvailable?: boolean };
};
export async function getRouteLive(id: string, signal?: AbortSignal): Promise<RouteLiveResponse> {
  try {
    const response = await request<{ data: RouteLiveResponse['data'] & {
      variants?: { id: string; shape: RouteVariant['geometry']; stations: Location[] }[];
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
    request<{ data: Location[] }>('/stops', signal),
  ]);
  const route = routeResponse.data;
  const stops = stopsResponse.data;
  const shapes = route.variants.map(variant => ({ variantId: variant.id,
    coordinates: variant.geometry.status === 'ready' &&
      (variant.geometry.coordinates.length > 0 || variant.geometry.encodedPolyline)
      ? getVariantCoordinates(variant, stops) : [],
  }));
  return {
    data: { route, stops: stops.filter(stop => route.variants.some(variant => variant.stopSequence.includes(stop.id))), shapes,
      buses: [], incidents: [], nextDepartures: [] },
    meta: { source: 'live', generatedAt: new Date().toISOString(), refreshAfterSeconds: 30, liveAvailable: false },
  };
}
