import React, { memo } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import type { Coordinate, Location } from '../../data/catalog';
import type { LiveBus } from '../../services/transit';
import type { LiveBusStore } from '../../services/liveBuses';
import { BusMarkers } from './BusMarker';

// A single marker component covers base, selected and route-stop appearances.
const StationMarker = memo(function StationMarker({ stop, index, selected, routeStop, onSelect }: {
  stop: Location; index: number; selected: boolean; routeStop: boolean; onSelect: (stop: Location) => void;
}) {
  return <Marker coordinate={stop} title={routeStop ? `${index + 1}. ${stop.name}` : stop.name}
    description={stop.subtitle} pinColor={selected ? '#1f6feb' : routeStop ? '#0f766e' : '#f59e0b'}
    onPress={() => onSelect(stop)} tracksViewChanges={false} />;
});
export const TransitMap = memo(function TransitMap({ mapRef, initialRegion, canInteract, onReady, onLoaded, stations, routeStop, selectedStationId, shape, color, store, selectedBusId, onSelectBus, onSelectStation, userLocation }: {
  mapRef: React.RefObject<MapView | null>; initialRegion: Region; canInteract: boolean; onReady: () => void; onLoaded: () => void;
  stations: Location[]; routeStop: boolean; selectedStationId?: string; shape: Coordinate[]; color: string;
  store: LiveBusStore; selectedBusId?: string; onSelectBus: (bus: LiveBus) => void; onSelectStation: (station: Location) => void;
  userLocation: Coordinate | null;
}) {
  return <MapView ref={mapRef} provider={PROVIDER_GOOGLE} style={StyleSheet.absoluteFill}
    initialRegion={initialRegion} onMapReady={onReady} onMapLoaded={onLoaded} scrollEnabled={canInteract} zoomEnabled={canInteract}
    showsMyLocationButton={false} rotateEnabled={canInteract} pitchEnabled={canInteract} showsTraffic showsCompass showsUserLocation={canInteract && !!userLocation}>
    {stations.map((stop, index) => <StationMarker key={`${stop.id}:${index}`} stop={stop} index={index} selected={selectedStationId === stop.id} routeStop={routeStop} onSelect={onSelectStation} />)}
    {shape.length > 1 && <Polyline coordinates={shape} strokeColor={color} strokeWidth={5} />}
    <BusMarkers store={store} selectedId={selectedBusId} onSelect={onSelectBus} />
  </MapView>;
});
