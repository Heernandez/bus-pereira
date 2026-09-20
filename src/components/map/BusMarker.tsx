import React, { memo, useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Animated, Platform, StyleSheet, Text, View } from 'react-native';
import { Marker, AnimatedRegion } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { LiveBusStore } from '../../services/liveBuses';
import type { LiveBus } from '../../services/transit';
import { useBus, useFreshBus } from './TransitDetail';

type Props = { bus: LiveBus; selected: boolean; onSelect: (bus: LiveBus) => void };
function MovingBusMarker({ bus, selected, onSelect }: Props) {
  const marker = useRef<React.ElementRef<typeof Marker>>(null);
  const initial = useRef(bus.coordinate!);
  const [animated] = useState(() => new AnimatedRegion({ ...initial.current, latitudeDelta: 0, longitudeDelta: 0 }));
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    if (!bus.coordinate) return;
    if (Platform.OS === 'android') marker.current?.animateMarkerToCoordinate(bus.coordinate, 700);
    else {
      const motion = animated.timing({ ...bus.coordinate, latitudeDelta: 0, longitudeDelta: 0, duration: 700, useNativeDriver: false, toValue: 0 });
      motion.start();
      return () => motion.stop();
    }
  }, [bus.coordinate?.latitude, bus.coordinate?.longitude, animated]);
  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => { marker.current?.redraw(); setTracking(false); }, 250);
    return () => clearTimeout(timer);
  }, [bus.routeCode, bus.heading, bus.live, selected]);
  const onPress = useCallback(() => onSelect(bus), [bus, onSelect]);
  const chip = <View style={[styles.chip, selected && styles.selected]}>
    <Ionicons name="bus" size={17} color="#fff" /><Text style={styles.code}>{bus.routeCode}</Text>
    {bus.heading !== null && <Ionicons name="navigate" size={12} color="#fff" style={{ transform: [{ rotate: `${bus.heading - 45}deg` }] }} />}
  </View>;
  return Platform.OS === 'android'
    ? <Marker ref={marker} identifier={bus.id} coordinate={initial.current} zIndex={selected ? 30 : 20} onPress={onPress} stopPropagation tracksViewChanges={tracking}>{chip}</Marker>
    : <Marker.Animated ref={marker} identifier={bus.id} coordinate={animated as unknown as { latitude: Animated.Value; longitude: Animated.Value }} zIndex={selected ? 30 : 20} onPress={onPress} stopPropagation tracksViewChanges={tracking}>{chip}</Marker.Animated>;
}
export const BusMarker = memo(function BusMarker(props: Props) {
  const fresh = useFreshBus(props.bus);
  return fresh ? <MovingBusMarker {...props} /> : null;
});
export const LiveBusMarker = memo(function LiveBusMarker({ store, id, selected, onSelect }: { store: LiveBusStore; id: string; selected: boolean; onSelect: (bus: LiveBus) => void }) {
  const bus = useBus(store, id);
  return bus ? <BusMarker bus={bus} selected={selected} onSelect={onSelect} /> : null;
});
export const BusMarkers = memo(function BusMarkers({ store, selectedId, onSelect }: { store: LiveBusStore; selectedId?: string; onSelect: (bus: LiveBus) => void }) {
  const ids = useSyncExternalStore(store.subscribeIds, store.getIds, store.getIds);
  return <>{ids.map(id => <LiveBusMarker key={id} store={store} id={id} selected={id === selectedId} onSelect={onSelect} />)}</>;
});
const styles = StyleSheet.create({
  chip: { backgroundColor: '#1f6feb', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 5, borderColor: '#fff', borderWidth: 2 },
  selected: { backgroundColor: '#0f766e', borderColor: '#fbbf24' }, code: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
