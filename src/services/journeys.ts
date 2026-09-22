import { API_URL, USE_DUMMY_DATA } from './transit';
import { planDemoJourney } from './journeyDemo';
import type { JourneyRequest, JourneyResponse } from '../types/journey';

const invalid = () => new Error('El planificador devolvió un viaje incompleto o incompatible. Intenta nuevamente.');
const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const coordinate = (value: unknown) => record(value) && typeof value.latitude === 'number' &&
  Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 && typeof value.longitude === 'number' &&
  Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
const place = (value: unknown) => coordinate(value) && record(value) && text(value.name) &&
  (value.stopId === undefined || text(value.stopId));
const strings = (value: unknown) => Array.isArray(value) && value.every(text);
const reasons = ['outside_coverage', 'no_service', 'no_connection', 'walking_limit'];

export function parseJourneyResponse(value: unknown): JourneyResponse {
  if (!record(value) || !record(value.data) || !Array.isArray(value.data.itineraries) ||
      !record(value.meta) || value.meta.contractVersion !== 1 ||
      !['backend', 'demo'].includes(String(value.meta.source)) || !text(value.meta.generatedAt) ||
      !Number.isFinite(Date.parse(value.meta.generatedAt))) throw invalid();
  if (!value.data.itineraries.length && !reasons.includes(String(value.meta.noRouteReason))) throw invalid();
  if (value.data.itineraries.length && value.meta.noRouteReason !== undefined) throw invalid();
  const ids = new Set<string>();
  for (const item of value.data.itineraries) {
    if (!record(item) || !text(item.id) || ids.has(item.id) || !Array.isArray(item.legs) || !item.legs.length ||
        !(item.durationSeconds === null || nonnegative(item.durationSeconds)) ||
        !nonnegative(item.walkingDistanceMeters) || !nonnegative(item.transfers) || !Number.isInteger(item.transfers) ||
        !strings(item.warnings)) throw invalid();
    ids.add(item.id);
    const legIds = new Set<string>();
    for (const leg of item.legs) {
      if (!record(leg) || !text(leg.id) || legIds.has(leg.id) || !['walk', 'bus'].includes(String(leg.mode)) ||
          !place(leg.from) || !place(leg.to) || !nonnegative(leg.durationSeconds) || !nonnegative(leg.distanceMeters) ||
          !record(leg.geometry) || !Array.isArray(leg.geometry.coordinates) || leg.geometry.coordinates.length < 2 ||
          !leg.geometry.coordinates.every(coordinate) || !['network', 'approximate'].includes(String(leg.geometry.source))) throw invalid();
      legIds.add(leg.id);
      if (leg.mode === 'bus' && (!text(leg.routeId) || !text(leg.variantId) || !text(leg.routeCode) || !text(leg.headsign) ||
          !text(leg.color) || !/^#[0-9a-f]{6}$/i.test(leg.color) ||
          !record(leg.from) || !text(leg.from.stopId) || !record(leg.to) || !text(leg.to.stopId) ||
          !(leg.waitSeconds === null || nonnegative(leg.waitSeconds)) ||
          !['schedule', 'frequency', 'realtime', 'estimated', 'unavailable'].includes(String(leg.timingSource)) ||
          (leg.timingSource === 'unavailable') !== (leg.waitSeconds === null))) throw invalid();
    }
  }
  const response = value as JourneyResponse;
  for (const item of response.data.itineraries) {
    const buses = item.legs.filter(leg => leg.mode === 'bus');
    const walking = item.legs.reduce((sum, leg) => sum + (leg.mode === 'walk' ? leg.distanceMeters : 0), 0);
    const unknownWait = buses.some(leg => leg.waitSeconds === null);
    const duration = item.legs.reduce((sum, leg) => sum + leg.durationSeconds + (leg.mode === 'bus' ? leg.waitSeconds ?? 0 : 0), 0);
    if (item.transfers !== Math.max(0, buses.length - 1) || Math.abs(walking - item.walkingDistanceMeters) > 2 ||
        unknownWait !== (item.durationSeconds === null) ||
        (item.durationSeconds !== null && Math.abs(duration - item.durationSeconds) > 2)) throw invalid();
    item.legs.forEach((leg, index) => {
      const previous = item.legs[index - 1];
      if (previous && (Math.abs(previous.to.latitude - leg.from.latitude) > 0.00001 ||
          Math.abs(previous.to.longitude - leg.from.longitude) > 0.00001 ||
          (previous.to.stopId && leg.from.stopId && previous.to.stopId !== leg.from.stopId))) throw invalid();
    });
  }
  return response;
}

export async function planJourney(input: JourneyRequest, signal?: AbortSignal): Promise<JourneyResponse> {
  if (signal?.aborted) throw new Error('Consulta cancelada.');
  if (USE_DUMMY_DATA) return parseJourneyResponse(planDemoJourney(input));
  if (!API_URL || !/^https?:\/\//.test(API_URL)) throw new Error('Configura EXPO_PUBLIC_API_URL para conectarte al servicio.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  const timer = setTimeout(abort, 15000);
  try {
    const body = JSON.stringify(input);
    // Temporary payload diagnostics while integrating the journey planner.
    console.log('[Viaje] POST /journeys/plan payload:', body);
    // POST keeps precise user coordinates out of URLs and HTTP access logs.
    const response = await fetch(`${API_URL}/journeys/plan`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
    });
    if ([404, 405, 501].includes(response.status)) throw new Error('La planificación de viajes todavía no está disponible. Intenta más tarde.');
    if (response.status === 422 || response.status === 400) throw new Error('No pudimos planear con esos puntos o preferencias. Revisa tu selección.');
    if (response.status === 429) throw new Error('Hay muchas consultas en este momento. Intenta nuevamente en unos segundos.');
    if (!response.ok) throw new Error('El planificador no está disponible en este momento. Intenta nuevamente.');
    const result = parseJourneyResponse(await response.json());
    if (result.meta.source !== 'backend') throw invalid();
    for (const item of result.data.itineraries) {
      const from = item.legs[0].from;
      const to = item.legs[item.legs.length - 1].to;
      if (item.transfers > input.preferences.maxTransfers || item.walkingDistanceMeters > input.preferences.maxWalkingDistanceMeters + 2 ||
          [ [from, input.origin], [to, input.destination] ].some(([actual, requested]) =>
            Math.abs(actual.latitude - requested.latitude) > 0.00001 || Math.abs(actual.longitude - requested.longitude) > 0.00001 ||
            (requested.stopId !== undefined && actual.stopId !== requested.stopId))) throw invalid();
    }
    return result;
  } catch (error) {
    if (signal?.aborted) throw error;
    if (controller.signal.aborted) throw new Error('El cálculo del viaje tardó demasiado. Intenta nuevamente.');
    if (error instanceof TypeError) throw new Error('No pudimos conectar con el planificador. Revisa tu conexión.');
    if (error instanceof SyntaxError) throw invalid();
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
