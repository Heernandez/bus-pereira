import type { BusLeg, Itinerary, JourneyLeg, JourneyResponse, WalkLeg } from '../types/journey';

export const formatDistance = (meters: number) => meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(1)} km`;
export const formatDuration = (seconds: number) => `${Math.max(1, Math.ceil(seconds / 60))} min`;
export const itineraryTitle = (item: Itinerary) => item.legs.filter(leg => leg.mode === 'bus').map(leg => leg.routeCode).join(' → ') || 'Todo a pie';
export const itineraryColor = (item: Itinerary) => item.legs.find(leg => leg.mode === 'bus')?.color ?? '#475569';
export const itineraryDuration = (item: Itinerary) => item.durationSeconds === null ? 'Tiempo total no disponible' :
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

export type TimelineItem =
  | { kind: 'node'; id: string; name: string; color: string }
  | { kind: 'connector'; id: string; leg: JourneyLeg };
// One dot per stop plus one connector per leg, so the sheet can draw a continuous
// line instead of the flat "N. instruction" sentences used by legInstruction.
export function journeyTimeline(itinerary: Itinerary): TimelineItem[] {
  const items: TimelineItem[] = [];
  // A 0 m walk only pads the contract when origin/destination is the stop itself;
  // keep it when it's the only leg (same-point trip) so the timeline isn't empty.
  const withoutPadding = itinerary.legs.filter(leg => !(leg.mode === 'walk' && leg.distanceMeters === 0));
  const legs = withoutPadding.length ? withoutPadding : itinerary.legs;
  legs.forEach((leg, index) => {
    if (index === 0) items.push({ kind: 'node', id: 'origin', name: leg.from.name, color: '#1f6feb' });
    items.push({ kind: 'connector', id: leg.id, leg });
    const isLast = index === legs.length - 1;
    const neighborBus = leg.mode === 'bus' ? leg : legs[index + 1]?.mode === 'bus' ? legs[index + 1] : null;
    items.push({ kind: 'node', id: `${leg.id}-to`, name: leg.to.name, color: isLast ? '#dc2626' : neighborBus ? (neighborBus as BusLeg).color : '#94a3b8' });
  });
  return items;
}

export function noJourneyMessage(reason: JourneyResponse['meta']['noRouteReason']) {
  switch (reason) {
    case 'outside_coverage': return 'Uno de los puntos está fuera de la cobertura del servicio.';
    case 'no_service': return 'No encontramos servicio disponible para esta hora.';
    case 'walking_limit': return 'No encontramos un viaje con este límite de caminata. Puedes ampliarlo en Opciones.';
    default: return 'No encontramos una conexión con estos puntos y preferencias. Prueba otras opciones o ubicaciones.';
  }
}
