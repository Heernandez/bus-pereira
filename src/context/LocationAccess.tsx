import { startupLog } from '../services/startupTiming';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Location from 'expo-location';
import { resolveLocationAccess, type AccessState } from '../services/locationAccess';
import type { Coordinate } from '../data/mockData';

const adapter = {
  permission: Location.getForegroundPermissionsAsync,
  requestPermission: Location.requestForegroundPermissionsAsync,
  servicesEnabled: Location.hasServicesEnabledAsync,
  enableServices: async () => {
    if (Platform.OS === 'android') await Location.enableNetworkProviderAsync();
  },
};
const Context = createContext<{
  state: AccessState; busy: boolean; coordinate: Coordinate | null;
  positionError: string | null; retry: () => Promise<void>;
  refresh: () => Promise<AccessState>; locate: () => Promise<Coordinate | null>;
  openSettings: () => Promise<void>;
} | null>(null);

export function LocationAccessProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AccessState>('checking');
  useEffect(() => { startupLog('Ubicación: estado', { state }); }, [state]);
  const [busy, setBusy] = useState(false);
  const [coordinate, setCoordinate] = useState<Coordinate | null>(null);
  const [positionError, setPositionError] = useState<string | null>(null);
  const pending = useRef<Promise<AccessState> | null>(null);
  const locating = useRef<Promise<Coordinate | null> | null>(null);
  const mounted = useRef(true);
  const generation = useRef(0);
  const foreground = useRef(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');

  const check = useCallback((request = false): Promise<AccessState> => {
    if (pending.current) return pending.current;
    const operation = (async () => {
      try {
        const next = await resolveLocationAccess(adapter, request);
        if (mounted.current) {
          setState(foreground.current ? next : 'checking');
          if (next !== 'ready') { generation.current++; setCoordinate(null); }
        }
        return next;
      } catch {
        if (mounted.current) { setState('error'); setCoordinate(null); generation.current++; }
        return 'error' as const;
      }
    })();
    pending.current = operation;
    void operation.finally(() => { pending.current = null; });
    return operation;
  }, []);

  const openSettings = useCallback(async () => {
    try {
      if (Platform.OS === 'android' && !(await Location.hasServicesEnabledAsync())) {
        await Linking.sendIntent('android.settings.LOCATION_SOURCE_SETTINGS');
      } else await Linking.openSettings();
    } catch { setPositionError('No se pudieron abrir los ajustes. Ábrelos desde el teléfono.'); }
  }, []);

  const retry = useCallback(async () => {
    setBusy(true);
    setPositionError(null);
    try {
      // Finish an in-flight passive check before showing any system prompt.
      if (pending.current) await pending.current;
      const permission = await adapter.permission();
      if (!permission.granted && !permission.canAskAgain) {
        await Linking.openSettings();
      } else if (permission.granted && Platform.OS === 'ios' && !(await adapter.servicesEnabled())) {
        await Linking.openSettings();
      } else await check(true);
    } catch { setState('error'); }
    finally { if (mounted.current) setBusy(false); }
  }, [check]);

  const locate = useCallback((): Promise<Coordinate | null> => {
    if (locating.current) return locating.current;
    const operation = (async () => {
      if (!foreground.current || await check() !== 'ready') return null;
      const version = generation.current;
      setPositionError(null);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const location = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced, mayShowUserSettingsDialog: false }),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('timeout')), 15000); }),
        ]);
        if (!mounted.current || !foreground.current || version !== generation.current || await check() !== 'ready') return null;
        const value = { latitude: location.coords.latitude, longitude: location.coords.longitude };
        setCoordinate(value);
        return value;
      } catch {
        const access = await check();
        if (mounted.current && access === 'ready') setPositionError('La ubicación está encendida, pero aún no pudimos obtener tu posición. Intenta de nuevo en un lugar con mejor señal.');
        return null;
      } finally { clearTimeout(timer); }
    })();
    locating.current = operation;
    void operation.finally(() => { locating.current = null; });
    return operation;
  }, [check]);

  useEffect(() => {
    mounted.current = true;
    void (async () => {
      try {
        const permission = await adapter.permission();
        if (pending.current) await pending.current;
        if (mounted.current) await check(permission.status === 'undetermined');
      } catch { if (mounted.current) setState('error'); }
    })();
    const subscription = AppState.addEventListener('change', next => {
      foreground.current = next === 'active';
      if (next === 'active') void check();
      else { generation.current++; setState('checking'); }
    });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void check(); }, 3000);
    return () => { mounted.current = false; generation.current++; subscription.remove(); clearInterval(timer); };
  }, [check]);

  return <Context.Provider value={{ state, busy, coordinate, positionError, retry, refresh: check, locate, openSettings }}>{children}</Context.Provider>;
}
export function useLocationAccess() {
  const value = useContext(Context);
  if (!value) throw new Error('LocationAccessProvider requerido');
  return value;
}
