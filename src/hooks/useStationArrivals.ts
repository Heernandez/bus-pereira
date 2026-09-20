import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getArrivals, USE_DUMMY_DATA, type ArrivalsResponse, type LiveBus, type Arrival } from '../services/transit';
import type { RouteOption, RouteVariant } from '../data/mockData';
import { backendArrival, backendBus } from '../services/liveProtocol';
import { LiveBusStore } from '../services/liveBuses';
import { subscribeLive, type ConnectionState, type LiveEvent } from '../services/liveTransport';

const WS_URL = process.env.EXPO_PUBLIC_WS_URL?.trim() || (process.env.EXPO_PUBLIC_API_URL ? `${process.env.EXPO_PUBLIC_API_URL.replace(/^http/, 'ws').replace(/\/$/, '')}/live` : undefined);
type Snapshot = { data: { buses?: LiveBus[]; route?: RouteOption; servingRoutes?: { route: RouteOption; variant: RouteVariant }[]; arrivals?: Arrival[] }; meta: { source: 'demo' | 'live'; refreshAfterSeconds: number; liveAvailable?: boolean } };
export function useLiveTransit<T extends Snapshot>(id: string | undefined, active: boolean, kind: 'station' | 'route', loader: (id: string, signal?: AbortSignal) => Promise<T>) {
  const [result, setResult] = useState<{ key: string; data: T } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('paused');
  const [store] = useState(() => new LiveBusStore());
  const [attempt, setAttempt] = useState(0);
  const key = `${kind}:${id}`;
  useEffect(() => {
    setResult(null); setError(null); store.replace([]); setConnection('paused');
    if (!id || !active) return;
    let disposed = false;
    let generation = 0;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;
    let request: Promise<void> | undefined;
    let buffered: LiveEvent[] = [];
    let lastLoadSucceeded = false;
    let currentSnapshot: T | null = null;
    let snapshotBusIds = new Set<string>();
    let snapshotArrivalIds = new Set<string>();
    const publish = (value: T) => {
      currentSnapshot = value;
      setResult(previous => previous?.key === key && JSON.stringify(previous.data.data) === JSON.stringify(value.data) &&
        previous.data.meta.source === value.meta.source && previous.data.meta.liveAvailable === value.meta.liveAvailable
        ? previous : { key, data: value });
    };
    const channel = `${kind}:${id}`;
    const isActive = () => !disposed && AppState.currentState !== 'background' && AppState.currentState !== 'inactive';
    const applyEvent = (event: LiveEvent) => {
      if (!isActive() || !currentSnapshot) return;
      const snapshot = currentSnapshot;
      if (event.type === 'snapshot_end') {
        store.replace([...snapshotBusIds].flatMap(id => { const bus = store.get(id); return bus ? [bus] : []; }));
        if (snapshot.data.arrivals) publish({ ...snapshot, data: { ...snapshot.data, arrivals: snapshot.data.arrivals.filter(item => snapshotArrivalIds.has(item.id)) } });
        return;
      }
      if (event.type === 'bus_position' || event.type === 'arrival_update') {
        const route = snapshot.data.route ?? snapshot.data.servingRoutes?.find(item => item.route.id === event.routeId)?.route;
        if (!route || (typeof event.routeId === 'string' && route.id !== event.routeId)) return;
        const busId = String(event.busId ?? event.vehicleId ?? '');
        const bus = backendBus(event, route, store.get(busId));
        if (bus) {
          if (event.snapshot) snapshotBusIds.add(bus.id);
          store.upsert(bus);
        }
        if (event.type === 'arrival_update' && snapshot.data.arrivals) {
          const variant = route.variants.find(item => item.id === event.variantId);
          const arrival = variant ? backendArrival(event, route, variant) : null;
          if (arrival) {
            if (event.snapshot) snapshotArrivalIds.add(arrival.id);
            const old = snapshot.data.arrivals.find(item => item.id === arrival.id);
            if (old?.lastPositionAt && arrival.lastPositionAt && Date.parse(old.lastPositionAt) > Date.parse(arrival.lastPositionAt)) return;
            const arrivals = [...snapshot.data.arrivals.filter(item => item.id !== arrival.id), arrival]
              .sort((a, b) => (a.arrivalMinutes ?? Infinity) - (b.arrivalMinutes ?? Infinity) || a.id.localeCompare(b.id));
            publish({ ...snapshot, data: { ...snapshot.data, arrivals } });
          }
        }
      }
      if (event.type === 'bus_removed' && typeof event.busId === 'string') store.remove(event.busId);
      if (event.type === 'arrival_removed' && snapshot.data.arrivals) {
        const arrivals = snapshot.data.arrivals.filter(item => item.id !== event.id);
        if (typeof event.busId === 'string' && !arrivals.some(item => item.vehicle?.id === event.busId)) store.remove(event.busId);
        publish({ ...snapshot, data: { ...snapshot.data, arrivals } });
      }
    };
    const handleEvent = (event: LiveEvent) => {
      if (!isActive()) return;
      if (request) buffered.push(event);
      applyEvent(event);
    };
    const load = (): Promise<void> => {
      if (request) return request;
      if (!isActive()) return Promise.resolve();
      const epoch = generation;
      buffered = [];
      lastLoadSucceeded = false;
      const current = new AbortController(); controller = current;
      clearTimeout(timer);
      const operation = (async () => {
        let refresh = USE_DUMMY_DATA ? 2 : 30;
        try {
          const value = await loader(id, current.signal);
          if (disposed || current.signal.aborted || epoch !== generation) return;
          store.replace(value.data.buses ?? []);
          // Keep vehicle positions only in the normalized store.
          publish({ ...value, data: { ...value.data, buses: undefined } });
          buffered.forEach(applyEvent); buffered = []; lastLoadSucceeded = true;
          setError(null);
          refresh = USE_DUMMY_DATA ? 2 : Math.max(10, Math.min(300, value.meta.refreshAfterSeconds || 30));
          if (USE_DUMMY_DATA) setConnection('demo');
          else if (!WS_URL || value.meta.liveAvailable === false) setConnection('polling');
          else if (!unsubscribe) {
            unsubscribe = subscribeLive({ url: WS_URL, channel, onState: state => { if (state === 'connecting') { snapshotBusIds = new Set(); snapshotArrivalIds = new Set(); } setConnection(state); }, onEvent: handleEvent, onReconnect: async () => { await load(); if (!lastLoadSucceeded) throw new Error('No se pudo sincronizar el estado inicial.'); } });
          }
        } catch (reason) {
          if (disposed || current.signal.aborted || epoch !== generation) return;
          setError(reason instanceof Error ? reason.message : 'No pudimos consultar la información.');
          setConnection('disconnected');
        } finally {
          if (!disposed && !current.signal.aborted && epoch === generation && isActive()) timer = setTimeout(() => void load(), refresh * 1000);
        }
      })();
      request = operation;
      void operation.finally(() => { if (request === operation) request = undefined; });
      return operation;
    };
    const stop = () => { generation++; controller?.abort(); request = undefined; clearTimeout(timer); unsubscribe?.(); unsubscribe = undefined; };
    void load();
    const subscription = AppState.addEventListener('change', state => {
      stop();
      if (state === 'active') void load(); else setConnection('paused');
    });
    return () => { disposed = true; stop(); subscription.remove(); };
  }, [id, active, attempt, kind, loader, store, key]);
  return { data: result?.key === key ? result.data : null, store, connection, error, retry: () => setAttempt(value => value + 1) };
}
export function useStationArrivals(id: string | undefined, active: boolean) {
  return useLiveTransit<ArrivalsResponse>(id, active, 'station', getArrivals);
}
