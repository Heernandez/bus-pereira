import { startupSpan } from '../services/startupTiming';
import { useCallback, useEffect, useState } from 'react';

export function useRemoteData<T>(loader: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const finish = startupSpan(`Datos ${loader.name || 'consulta'}`);
    const controller = new AbortController();
    setError(null);
    setData(null);
    void loader(controller.signal).then(value => {
      finish(controller.signal.aborted ? 'cancelado' : 'ok');
      if (!controller.signal.aborted) setData(value);
    }).catch(reason => {
      finish(controller.signal.aborted ? 'cancelado' : 'error');
      if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los datos.');
    });
    return () => { controller.abort(); finish('cancelado'); };
  }, [loader, attempt]);
  return { data, error, reload: useCallback(() => setAttempt(value => value + 1), []) };
}
