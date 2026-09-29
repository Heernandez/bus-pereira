import React, { memo, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import type { Coordinate, Location } from '../../data/catalog';
import type { LiveBus } from '../../services/transit';
import type { LiveBusStore } from '../../services/liveBuses';
import { BusMarkers } from './BusMarker';

// Station icons grow with the zoom so the city view stays readable (assets from scripts/generate-station-markers.py).
const stationIcons = {
  far: require('../../../assets/markers/station-far.png'),
  mid: require('../../../assets/markers/station-mid.png'),
  near: require('../../../assets/markers/station-near.png'),
  selected: require('../../../assets/markers/station-selected.png'),
};
export type StationScale = 'far' | 'mid' | 'near';
export function stationScale(region: Region): StationScale {
  const zoom = Math.log2(360 / Math.max(region.longitudeDelta, 1e-6));
  return zoom < 13.5 ? 'far' : zoom < 15.5 ? 'mid' : 'near';
}

// A single marker component covers base, selected and route-stop appearances.
export const StationMarker = memo(function StationMarker({ stop, selected, routeStop, onSelect, scale = 'near' }: {
  stop: Location; selected: boolean; routeStop: boolean; onSelect: (stop: Location) => void; scale?: StationScale;
}) {
  const marker = useRef<React.ElementRef<typeof Marker>>(null);
  const [tracking, setTracking] = useState(true);
  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => { marker.current?.redraw(); setTracking(false); }, 250);
    return () => clearTimeout(timer);
  }, [routeStop, selected, stop.name]);
  if (routeStop) return <Marker ref={marker} coordinate={stop}
    title={stop.name} description={stop.subtitle}
    anchor={{ x: selected ? 22 / 220 : 0.5, y: 0.5 }}
    zIndex={selected ? 15 : 10} tracksViewChanges={tracking}
    accessibilityLabel={`${stop.name}${selected ? ', parada seleccionada' : ''}`}
    onPress={() => onSelect(stop)} stopPropagation>
    <View collapsable={false} style={[styles.stopMarker, selected && styles.selectedMarker]}>
      <View style={styles.stopTarget}><View style={[styles.stopDot, selected && styles.selectedDot]} /></View>
      {selected && <View style={styles.stopLabel}><Text numberOfLines={1} style={styles.stopName}>{stop.name}</Text></View>}
    </View>
  </Marker>;
  return <Marker coordinate={stop} title={stop.name} description={stop.subtitle}
    image={stationIcons[selected ? 'selected' : scale]} anchor={{ x: 0.5, y: 0.5 }} zIndex={selected ? 15 : 10}
    accessibilityLabel={`${stop.name}${selected ? ', estación seleccionada' : ''}`}
    onPress={() => onSelect(stop)} tracksViewChanges={false} />;
});
export const TransitMap = memo(function TransitMap({ mapRef, initialRegion, canInteract, onReady, onLoaded, stations, routeStop, selectedStationId, shape, color, store, selectedBusId, onSelectBus, onSelectStation, userLocation }: {
  mapRef: React.RefObject<MapView | null>; initialRegion: Region; canInteract: boolean; onReady: () => void; onLoaded: () => void;
  stations: Location[]; routeStop: boolean; selectedStationId?: string; shape: Coordinate[]; color: string;
  store: LiveBusStore; selectedBusId?: string; onSelectBus: (bus: LiveBus) => void; onSelectStation: (station: Location) => void;
  userLocation: Coordinate | null;
}) {
  const [scale, setScale] = useState(() => stationScale(initialRegion));
  const onRegionChangeComplete = (region: Region, details?: { isGesture?: boolean }) => {
    // Android can detach/attach the map during startup and restore Google's default world
    // camera before initialRegion is applied; a city app never starts at continent scale.
    if (!details?.isGesture && region.longitudeDelta > 20) {
      mapRef.current?.animateToRegion(initialRegion, 0);
      return;
    }
    setScale(stationScale(region));
  };
  return <MapView ref={mapRef} provider={PROVIDER_GOOGLE} style={StyleSheet.absoluteFill}
    initialRegion={initialRegion} onMapReady={onReady} onMapLoaded={onLoaded}
    onRegionChangeComplete={onRegionChangeComplete} scrollEnabled={canInteract} zoomEnabled={canInteract}
    showsMyLocationButton={false} rotateEnabled={canInteract} pitchEnabled={canInteract} showsTraffic={!routeStop} showsCompass userInterfaceStyle="light" showsUserLocation={canInteract && !!userLocation}>
    {stations.map((stop, index) => <StationMarker key={`${stop.id}:${index}`} stop={stop} selected={selectedStationId === stop.id} routeStop={routeStop} onSelect={onSelectStation} scale={scale} />)}
    {shape.length > 1 && <>
      <Polyline coordinates={shape} strokeColor="#ffffff" strokeWidth={11} zIndex={1} />
      <Polyline coordinates={shape} strokeColor={routeStop ? '#292923' : color} strokeWidth={7} zIndex={2} />
    </>}
    <BusMarkers store={store} selectedId={selectedBusId} onSelect={onSelectBus} />
  </MapView>;
});

const styles = StyleSheet.create({
  stopMarker: { width: 44, height: 44, flexDirection: 'row', alignItems: 'center' },
  selectedMarker: { width: 220 },
  stopTarget: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stopDot: { width: 15, height: 15, borderRadius: 8, backgroundColor: '#fff', borderColor: '#292923', borderWidth: 3 },
  selectedDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#facc15', borderWidth: 4 },
  stopLabel: { flex: 1, backgroundColor: '#292923', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 8 },
  stopName: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
