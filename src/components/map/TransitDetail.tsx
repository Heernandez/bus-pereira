import React, { memo, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Arrival, ArrivalsResponse, RouteLiveResponse, LiveBus } from '../../services/transit';
import type { RouteOption, RouteVariant } from '../../data/catalog';
import { LiveBusStore, isRecentBus } from '../../services/liveBuses';
import type { ConnectionState } from '../../services/liveTransport';
import { DataStatus } from '../DataStatus';

export function connectionLabel(state: ConnectionState) {
  return { live: 'Conectado en vivo', demo: 'Simulación', polling: 'Actualización periódica', disconnected: 'Sin conexión en vivo', connecting: 'Conectando…', paused: 'Actualización pausada' }[state];
}
export function useBus(store: LiveBusStore, id: string) {
  const subscribe = useCallback((listener: () => void) => store.subscribe(id, listener), [store, id]);
  const snapshot = useCallback(() => store.get(id), [store, id]);
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
export function useFreshBus(bus: LiveBus | undefined) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(timer); }, []);
  return !!bus && isRecentBus(bus, Math.max(now, Date.now()));
}
type SelectRoute = (route: RouteOption, variant: RouteVariant, tripId?: string) => void;
const ArrivalRow = memo(function ArrivalRow({ item, store, onSelect }: { item: Arrival; store: LiveBusStore; onSelect: SelectRoute }) {
  const bus = useBus(store, item.vehicle?.id ?? '');
  const fresh = useFreshBus(bus);
  const minutes = item.vehicle ? fresh ? bus?.source === 'demo' ? bus.etaMinutes : item.arrivalMinutes : null : item.arrivalMinutes;
  const label = bus?.source === 'demo' || item.predictionSource === 'demo' ? 'Simulación' : item.vehicle && !fresh ? 'Posición no disponible o antigua' : item.predictionSource === 'schedule' ? 'Según horario' : fresh && bus?.live ? 'GPS reciente' : 'Sin señal en vivo';
  return <Pressable style={styles.card} accessibilityRole="button" accessibilityLabel={`Ver ruta ${item.route.code} hacia ${item.variant.destinationName}`} onPress={() => onSelect(item.route, item.variant, item.tripId ?? undefined)}>
    <View style={[styles.stripe, { backgroundColor: item.route.color }]} />
    <View style={styles.body}><View style={styles.row}><Text style={styles.code}>{item.route.code}</Text><View style={styles.grow}><Text style={styles.name}>{item.route.name}</Text><Text style={styles.meta}>Hacia {item.variant.destinationName}</Text></View><Text style={styles.eta}>{minutes === null ? 'Sin estimación' : `${minutes} min`}</Text></View><Text style={styles.meta}>{label}</Text></View>
  </Pressable>;
});
function Incidents({ items }: { items: ArrivalsResponse['data']['incidents'] }) {
  return <>{items?.map(item => <View key={item.id} style={styles.incident}><Text style={styles.name}>{item.title}</Text>{item.description && <Text style={styles.meta}>{item.description}</Text>}</View>)}</>;
}
export function StationDetail({ response, store, connection, error, retry, onSelect }: {
  response: ArrivalsResponse | null; store: LiveBusStore; connection: ConnectionState; error: string | null; retry: () => void; onSelect: SelectRoute;
}) {
  if (!response) return <DataStatus error={error} retry={retry} />;
  return <FlatList data={response.data.arrivals} keyExtractor={item => item.id}
    renderItem={({ item }) => <ArrivalRow item={item} store={store} onSelect={onSelect} />}
    ListHeaderComponent={<>
      <Text style={styles.status}>{connectionLabel(connection)}</Text>
      {error && <DataStatus error={error} retry={retry} />}
      <Text style={styles.section}>Rutas que pasan por aquí</Text>
      <View style={styles.pills}>{response.data.servingRoutes.map(({ route, variant }) => <Pressable key={variant.id} style={styles.pill} onPress={() => onSelect(route, variant)} accessibilityRole="button"><Text style={[styles.name, { color: route.color }]}>{route.code}</Text><Text style={styles.meta}>Hacia {variant.destinationName}</Text></Pressable>)}</View>
      <Incidents items={response.data.incidents} />
      <Text style={styles.section}>Próximos buses</Text>
    </>}
    ListEmptyComponent={<Text style={styles.empty}>No hay buses próximos actualmente.{response.data.servingRoutes.length ? ' Puedes seleccionar una ruta para ver su recorrido.' : ' No hay rutas registradas en esta estación.'}</Text>} />;
}
const BusInfo = memo(function BusInfo({ store, id, selected, stops }: { store: LiveBusStore; id: string; selected: boolean; stops: RouteLiveResponse['data']['stops'] }) {
  const bus = useBus(store, id);
  const fresh = useFreshBus(bus);
  if (!bus) return selected ? <Text style={styles.empty}>Este bus ya no está disponible en el recorrido.</Text> : null;
  const nextStop = stops.find(stop => stop.id === bus.nextStopId);
  return <View style={[styles.bus, selected && { borderColor: '#1f6feb' }]}><Text style={styles.name}><Ionicons name="bus" size={16} /> {bus.routeCode} · {bus.id}</Text>
    <Text style={styles.meta}>{!fresh ? 'GPS antiguo o posición no disponible' : bus.source === 'demo' ? 'Movimiento simulado' : bus.live ? 'GPS reciente' : 'Sin señal en vivo'}</Text>
    <Text style={styles.meta}>Próxima estación: {nextStop?.name ?? 'Sin información'}</Text>
    <Text style={styles.eta}>{fresh && bus.etaMinutes !== null ? `${bus.etaMinutes} min aprox.` : 'Sin estimación'}</Text></View>;
});
function RouteBuses({ store, selectedBusId, stops }: { store: LiveBusStore; selectedBusId?: string; stops: RouteLiveResponse['data']['stops'] }) {
  const ids = useSyncExternalStore(store.subscribeIds, store.getIds, store.getIds);
  return <>{selectedBusId && !ids.includes(selectedBusId) && <Text style={styles.empty}>El bus seleccionado ya no está disponible.</Text>}{ids.length ? ids.map(id => <BusInfo key={id} id={id} store={store} selected={id === selectedBusId} stops={stops} />) : <Text style={styles.empty}>No hay buses activos disponibles.</Text>}</>;
}
export function RouteDetail({ response, variantId, selectedBusId, store, connection, error, retry, onSelect }: {
  response: RouteLiveResponse | null; variantId?: string; selectedBusId?: string; store: LiveBusStore; connection: ConnectionState; error: string | null; retry: () => void; onSelect: SelectRoute;
}) {
  if (!response) return <DataStatus error={error} retry={retry} />;
  const { route, stops, shapes } = response.data;
  const variant = route.variants.find(item => item.id === variantId) ?? route.variants[0];
  return <ScrollView contentContainerStyle={{ paddingBottom: 8 }}>
    <Text style={styles.status}>{connectionLabel(connection)}</Text>
    {response.meta.liveAvailable === false && <Text style={styles.empty}>El servicio de buses en vivo aún no está disponible para esta ruta.</Text>}
    {error && <DataStatus error={error} retry={retry} />}
    <View style={styles.pills}>{route.variants.map(item => <Pressable key={item.id} style={[styles.pill, variant?.id === item.id && { borderColor: route.color }]} onPress={() => onSelect(route, item)} accessibilityRole="button"><Text style={styles.name}>{item.direction === 'outbound' ? 'Ida' : 'Regreso'}</Text><Text style={styles.meta}>{item.destinationName}</Text></Pressable>)}</View>
    {(!variant || !shapes.find(shape => shape.variantId === variant.id)?.coordinates.length) && <Text style={styles.empty}>Recorrido sin geometría disponible.</Text>}
    <Incidents items={response.data.incidents} />
    <Text style={styles.section}>Buses de la ruta</Text><RouteBuses store={store} selectedBusId={selectedBusId} stops={stops} />
    <Text style={styles.section}>Estaciones del recorrido · {variant?.destinationName ?? 'Sin sentido definido'}</Text>
    {variant?.stopSequence.map((id, index) => <View key={`${id}:${index}`} style={styles.stop}><Text style={styles.dot}>●</Text><View><Text style={styles.name}>{index + 1}. {stops.find(stop => stop.id === id)?.name ?? 'Estación sin información'}</Text>{index < variant.stopSequence.length - 1 && <Text style={styles.line}>│</Text>}</View></View>)}
    {!!response.data.nextDepartures?.length && <><Text style={styles.section}>Próximas salidas</Text>{response.data.nextDepartures.map(item => <Text key={item.id} style={styles.meta}>{item.destinationName} · {new Date(item.departureAt).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</Text>)}</>}
  </ScrollView>;
}
const styles = StyleSheet.create({
  status: { color: '#0f766e', fontSize: 12, fontWeight: '700', marginBottom: 10 }, section: { color: '#111827', fontSize: 16, fontWeight: '800', marginVertical: 10 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, pill: { borderWidth: 1, borderColor: '#dbe2ea', backgroundColor: '#fff', borderRadius: 12, padding: 10 },
  card: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' }, stripe: { width: 6 }, body: { padding: 12, flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 }, grow: { flex: 1 }, code: { backgroundColor: '#dbeafe', borderRadius: 10, padding: 8, color: '#1f6feb', fontSize: 17, fontWeight: '800' },
  name: { color: '#111827', fontSize: 13, fontWeight: '700' }, meta: { color: '#64748b', fontSize: 12, marginTop: 4 }, eta: { color: '#0f766e', fontWeight: '700', fontSize: 12, marginTop: 4 },
  empty: { color: '#64748b', fontSize: 13, lineHeight: 20, paddingVertical: 10 }, incident: { backgroundColor: '#fef3c7', borderRadius: 12, padding: 12, marginTop: 8 },
  bus: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff', marginBottom: 8 }, stop: { flexDirection: 'row', gap: 12 }, dot: { color: '#1f6feb', fontSize: 16 }, line: { color: '#94a3b8', height: 20 },
});
