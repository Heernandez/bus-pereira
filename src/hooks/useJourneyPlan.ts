import { useCallback, useEffect, useMemo, useState } from 'react';
import { planJourney } from '../services/journeys';
import type { JourneyRequest, JourneyResponse } from '../types/journey';

export type JourneyQuery = Omit<JourneyRequest, 'departureTime'>;
export function useJourneyPlan(query: JourneyQuery | null) {
  const [attempt, setAttempt] = useState(0);
  const serialized = query ? JSON.stringify(query) : null;
  const key = useMemo(() => ({ serialized, attempt }), [serialized, attempt]);
  const [state, setState] = useState<{ key: typeof key; data: JourneyResponse | null; error: string | null } | null>(null);
  useEffect(() => {
    if (!serialized) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const request: JourneyRequest = { ...JSON.parse(serialized), departureTime: new Date().toISOString() };
      void planJourney(request, controller.signal).then(data => {
        if (!controller.signal.aborted) setState({ key, data, error: null });
      }).catch(error => {
        if (!controller.signal.aborted) setState({ key, data: null,
          error: error instanceof Error ? error.message : 'No pudimos calcular el viaje.' });
      });
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [serialized, key]);
  // Hide results from previous endpoints immediately, before effect cleanup runs.
  const current = serialized && state?.key === key ? state : null;
  return { data: current?.data ?? null, error: current?.error ?? null,
    loading: Boolean(serialized && !current), reload: useCallback(() => setAttempt(value => value + 1), []) };
}
