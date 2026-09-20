import { useCallback, useEffect, useRef } from 'react';
import { startupLog } from '../services/startupTiming';

export function useViewTiming(name: string, focused = true) {
  const started = useRef(globalThis.performance?.now() ?? Date.now());
  const laidOut = useRef(false);
  const elapsed = () => Math.round((globalThis.performance?.now() ?? Date.now()) - started.current);
  useEffect(() => {
    startupLog(`Vista ${name}: primer render confirmado`, { sinceRenderMs: elapsed() });
    return () => startupLog(`Vista ${name}: desmontada`);
  }, [name]);
  useEffect(() => {
    if (focused) startupLog(`Vista ${name}: enfocada`, { hasLayout: laidOut.current });
  }, [name, focused]);
  return useCallback(() => {
    if (laidOut.current) return;
    laidOut.current = true;
    startupLog(`Vista ${name}: primer layout completado`, {
      sinceRenderMs: Math.round((globalThis.performance?.now() ?? Date.now()) - started.current),
    });
  }, [name]);
}
