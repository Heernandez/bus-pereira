import { useEffect, useState } from 'react';
import type { Coordinate } from '../data/catalog';
import { getWalkingRoute, straightLineWalkingRoute, type WalkingRoute } from '../services/walkingDirections';

export type WalkingLeg = { route: WalkingRoute | null; loading: boolean; error: string | null };

const NONE: WalkingLeg = { route: null, loading: false, error: null };

export function useWalkingRoute(origin: Coordinate | null, destination: Coordinate | null): WalkingLeg {
  const [state, setState] = useState<WalkingLeg>(NONE);

  useEffect(() => {
    if (!origin || !destination) { setState(NONE); return; }
    const controller = new AbortController();
    // Instant placeholder so the map never has a gap while the real call is in flight.
    setState({ route: straightLineWalkingRoute(origin, destination), loading: true, error: null });
    getWalkingRoute(origin, destination, controller.signal)
      .then(route => { if (!controller.signal.aborted) setState({ route, loading: false, error: null }); })
      .catch(reason => {
        if (controller.signal.aborted) return;
        const message = reason instanceof Error ? reason.message : 'No pudimos calcular la ruta a pie.';
        console.warn('[Direcciones] Usando línea recta de respaldo', message);
        setState({ route: straightLineWalkingRoute(origin, destination), loading: false, error: message });
      });
    return () => controller.abort();
  }, [origin?.latitude, origin?.longitude, destination?.latitude, destination?.longitude]);

  return state;
}
