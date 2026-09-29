import type { RouteOption } from '../data/catalog';
import type { BusLeg, Itinerary, JourneyLeg, JourneyResponse, WalkLeg } from '../types/journey';

export const formatDistance = (meters: number) => meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
export const formatDuration = (seconds: number) => `${Math.max(1, Math.ceil(seconds / 60))} min`;
export const itineraryTitle = (item: Itinerary) => item.legs.filter(leg => leg.mode === 'bus').map(leg => leg.routeCode).join(' → ') || 'Todo a pie';
export const itineraryColor = (item: Itinerary) => item.legs.find(leg => leg.mode === 'bus')?.color ?? '#475569';
// Null when a wait is unknown: screens then show no total rather than a long disclaimer.
export const itineraryDuration = (item: Itinerary): string | null => item.durationSeconds === null ? null :
  `${item.legs.some(leg => leg.geometry.source === 'approximate' || leg.mode === 'bus' && ['estimated', 'frequency'].includes(leg.timingSource)) ? '≈ ' : ''}${formatDuration(item.durationSeconds)}`;
export function legInstruction(leg: JourneyLeg, index: number, legs: JourneyLeg[]) {
  if (leg.mode === 'walk') return `Camina hasta ${leg.to.name} · ${formatDistance(leg.distanceMeters)} · ${formatDuration(leg.durationSeconds)}`;
  const transfer = legs.slice(0, index).some(previous => previous.mode === 'bus');
  const wait = leg.waitSeconds === null ? 'Espera no disponible'
    : `Espera y abordaje${leg.timingSource === 'estimated' ? ' estimados' : ''}: ${leg.waitSeconds === 0 ? '0 min' : formatDuration(leg.waitSeconds)}`;
  return `${transfer ? 'Transborda al' : 'Toma el'} ${leg.routeCode} en ${leg.from.name}, hacia ${leg.headsign}. Baja en ${leg.to.name}. ${formatDuration(leg.durationSeconds)} en bus. ${wait}.`;
}
export const walkStepLabel = (leg: WalkLeg) => `Camina · ${formatDuration(leg.durationSeconds)} · ${formatDistance(leg.distanceMeters)}`;
export const busWaitLabel = (leg: BusLeg) => leg.waitSeconds === null ? 'Espera no disponible'
  : `Espera y abordaje${leg.timingSource === 'estimated' ? ' estimada' : ''}: ${leg.waitSeconds === 0 ? '0 min' : formatDuration(leg.waitSeconds)}`;

// A 0 m walk only pads the contract when origin/destination is the stop itself; keep it
// when it's the only leg (same-point trip) so nothing ends up empty.
function visibleLegs(itinerary: Itinerary): JourneyLeg[] {
  const legs = itinerary.legs.filter(leg => !(leg.mode === 'walk' && leg.distanceMeters === 0));
  return legs.length ? legs : itinerary.legs;
}

export type LegChip = { kind: 'walk'; id: string; minutes: number } | { kind: 'bus'; id: string; code: string };
// Compact "walk 7 › bus C20 › walk 1" summary for result cards and the detail header.
export const legChips = (itinerary: Itinerary): LegChip[] => visibleLegs(itinerary).map(leg => leg.mode === 'walk'
  ? { kind: 'walk', id: leg.id, minutes: Math.max(1, Math.ceil(leg.durationSeconds / 60)) }
  : { kind: 'bus', id: leg.id, code: leg.routeCode });

export type JourneySchedule = { leaveAt: Date; arriveAt: Date; legs: Map<string, { start: Date; end: Date }> };
// Clock times from the moment of the search. The walk before the first bus absorbs that bus's wait,
// so leaveAt is the latest time to set off and still catch it. Null when any wait is unknown.
export function journeySchedule(itinerary: Itinerary, from: Date): JourneySchedule | null {
  if (!Number.isFinite(from.getTime()) || itinerary.legs.some(leg => leg.mode === 'bus' && leg.waitSeconds === null)) return null;
  const firstBus = itinerary.legs.findIndex(leg => leg.mode === 'bus');
  const leaveAt = from.getTime() + (firstBus >= 0 ? (itinerary.legs[firstBus] as BusLeg).waitSeconds ?? 0 : 0) * 1000;
  let cursor = leaveAt;
  const legs = new Map<string, { start: Date; end: Date }>();
  itinerary.legs.forEach((leg, index) => {
    if (leg.mode === 'bus' && index !== firstBus) cursor += (leg.waitSeconds ?? 0) * 1000;
    const start = cursor;
    cursor += leg.durationSeconds * 1000;
    legs.set(leg.id, { start: new Date(start), end: new Date(cursor) });
  });
  return { leaveAt: new Date(leaveAt), arriveAt: new Date(cursor), legs };
}

export const formatClock = (date: Date) => date.toLocaleTimeString('es-CO', { hour: 'numeric', minute: '2-digit' });

export const timingLabel = (source: BusLeg['timingSource']) => ({
  realtime: 'En vivo', schedule: 'Según horario', frequency: 'Según frecuencia', estimated: 'Estimado', unavailable: 'Sin horario',
})[source];

// Stops ridden on a bus leg, from the catalog variant; null when the stops cannot be matched.
export function rideStopCount(routes: RouteOption[], leg: BusLeg): number | null {
  const sequence = routes.find(route => route.id === leg.routeId)?.variants.find(variant => variant.id === leg.variantId)?.stopSequence;
  const from = leg.from.stopId ? sequence?.indexOf(leg.from.stopId) ?? -1 : -1;
  const to = from >= 0 && leg.to.stopId ? sequence!.indexOf(leg.to.stopId, from + 1) : -1;
  return to > from ? to - from : null;
}

export type JourneyStep =
  | { kind: 'start' | 'end'; id: string; name: string; at: Date | null }
  | { kind: 'walk'; id: string; leg: WalkLeg }
  | { kind: 'board' | 'alight'; id: string; leg: BusLeg; at: Date | null }
  | { kind: 'ride'; id: string; leg: BusLeg };
// Rows of the step-by-step timeline: start, each walk, boarding/ride/alighting per bus, arrival.
export function journeySteps(itinerary: Itinerary, schedule: JourneySchedule | null): JourneyStep[] {
  const legs = visibleLegs(itinerary);
  const steps: JourneyStep[] = [{ kind: 'start', id: 'start', name: legs[0].from.name, at: schedule?.leaveAt ?? null }];
  for (const leg of legs) {
    if (leg.mode === 'walk') { steps.push({ kind: 'walk', id: leg.id, leg }); continue; }
    const times = schedule?.legs.get(leg.id);
    steps.push({ kind: 'board', id: `${leg.id}-board`, leg, at: times?.start ?? null });
    steps.push({ kind: 'ride', id: `${leg.id}-ride`, leg });
    steps.push({ kind: 'alight', id: `${leg.id}-alight`, leg, at: times?.end ?? null });
  }
  steps.push({ kind: 'end', id: 'end', name: legs[legs.length - 1].to.name, at: schedule?.arriveAt ?? null });
  return steps;
}

export function noJourneyMessage(reason: JourneyResponse['meta']['noRouteReason']) {
  switch (reason) {
    case 'outside_coverage': return 'Uno de los puntos está fuera de la cobertura del servicio.';
    case 'no_service': return 'No encontramos servicio disponible para esta hora.';
    case 'walking_limit': return 'No encontramos un viaje con este límite de caminata. Puedes ampliarlo en Opciones.';
    default: return 'No encontramos una conexión con estos puntos y preferencias. Prueba otras opciones o ubicaciones.';
  }
}
