import { startupSpan } from './startupTiming';
import { USE_DUMMY_DATA } from './transit';
import polyline from '@mapbox/polyline';
import type { Coordinate } from '../data/catalog';

const GOOGLE_MAPS_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY;
const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';
const WALKING_SPEED_METERS_PER_SECOND = 1.35; // ~4.9 km/h, average adult walking pace.
const TIMEOUT_MS = 12000;

export type WalkingRoute = {
  coordinates: Coordinate[];
  distanceMeters: number;
  durationSeconds: number;
  source: 'google-directions' | 'straight-line';
};

function haversineMeters(a: Coordinate, b: Coordinate): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinDLon * sinDLon;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Pure and synchronous: used both as the dummy-mode result and as the caller's
// visual fallback when the real API call fails, so the map never has a gap.
export function straightLineWalkingRoute(origin: Coordinate, destination: Coordinate): WalkingRoute {
  const distanceMeters = haversineMeters(origin, destination);
  return {
    coordinates: [origin, destination],
    distanceMeters,
    durationSeconds: Math.round(distanceMeters / WALKING_SPEED_METERS_PER_SECOND),
    source: 'straight-line',
  };
}

const STATUS_MESSAGES: Record<string, string> = {
  ZERO_RESULTS: 'Google no encontró una ruta a pie entre estos puntos.',
  NOT_FOUND: 'No pudimos ubicar alguno de los puntos para calcular la ruta a pie.',
  OVER_QUERY_LIMIT: 'Se alcanzó el límite de consultas de rutas a pie. Intenta más tarde.',
  REQUEST_DENIED: 'El servicio de rutas a pie rechazó la solicitud. Revisa la configuración de la API key.',
  INVALID_REQUEST: 'La solicitud de ruta a pie no fue válida.',
  UNKNOWN_ERROR: 'Error temporal del servicio de rutas a pie. Intenta nuevamente.',
};

export async function getWalkingRoute(
  origin: Coordinate,
  destination: Coordinate,
  signal?: AbortSignal,
): Promise<WalkingRoute> {
  if (USE_DUMMY_DATA) return straightLineWalkingRoute(origin, destination);
  if (!GOOGLE_MAPS_API_KEY) throw new Error('Configura EXPO_PUBLIC_GOOGLE_MAPS_API_KEY para calcular rutas a pie.');

  const finish = startupSpan('Ruta a pie Directions');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, TIMEOUT_MS);
  const params = new URLSearchParams({
    origin: `${origin.latitude},${origin.longitude}`,
    destination: `${destination.latitude},${destination.longitude}`,
    mode: 'walking',
    key: GOOGLE_MAPS_API_KEY,
  });
  let receivedResponse = false;
  try {
    // Never log the full URL: it contains the API key.
    console.log(`[${new Date().toISOString()}] [Direcciones] GET directions mode=walking`);
    const response = await fetch(`${DIRECTIONS_URL}?${params.toString()}`, { signal: controller.signal });
    receivedResponse = true;
    console.log(`[${new Date().toISOString()}] [Direcciones] GET directions -> HTTP ${response.status}`);
    if (!response.ok) throw new Error(`El servicio de rutas a pie respondió con un error (${response.status}).`);
    const json = await response.json();
    console.log(`[${new Date().toISOString()}] [Direcciones] status=${json.status}`);
    if (json.status !== 'OK') throw new Error(STATUS_MESSAGES[json.status] ?? `El servicio de rutas a pie devolvió un estado no reconocido (${json.status}).`);
    const leg = json.routes?.[0]?.legs?.[0];
    const points = json.routes?.[0]?.overview_polyline?.points;
    if (!leg || !points) throw new Error('El servicio de rutas a pie devolvió una respuesta incompleta.');
    const coordinates = polyline.decode(points).map(([latitude, longitude]) => ({ latitude, longitude }));
    finish('ok');
    return { coordinates, distanceMeters: leg.distance?.value ?? 0, durationSeconds: leg.duration?.value ?? 0, source: 'google-directions' };
  } catch (error) {
    finish(signal?.aborted ? 'cancelado' : controller.signal.aborted ? 'timeout' : 'error');
    if (!receivedResponse) {
      const reason = signal?.aborted ? 'cancelada' : controller.signal.aborted ? 'timeout' : 'error de red';
      console.log(`[${new Date().toISOString()}] [Direcciones] GET directions -> sin respuesta HTTP (${reason})`);
    }
    if (signal?.aborted) throw error;
    if (controller.signal.aborted) throw new Error('El cálculo de la ruta a pie tardó demasiado. Intenta nuevamente.');
    throw error instanceof Error ? error : new Error('No pudimos calcular la ruta a pie.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
