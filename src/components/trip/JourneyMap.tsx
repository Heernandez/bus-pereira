import { Fragment, type RefObject } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { StationMarker } from '../map/TransitMap';
import { LiveBusMarker } from '../map/BusMarker';
import type { LiveBusStore } from '../../services/liveBuses';
import type { BusLeg, Itinerary } from '../../types/journey';

// Draws an itinerary: walking and bus legs, boarding/alighting stops and the buses approaching the selected boarding stop.
export function JourneyMap({ mapRef, itinerary, initialRegion, showsUserLocation, onReady, busLegs, selectedLeg, highlightSelected, onSelectLeg, arrivingBusIds, busStore, onSelectBus }: {
  mapRef: RefObject<MapView | null>; itinerary: Itinerary; initialRegion: Region; showsUserLocation: boolean; onReady: () => void;
  busLegs: BusLeg[]; selectedLeg: BusLeg | undefined; highlightSelected: boolean; onSelectLeg: (leg: BusLeg) => void;
  arrivingBusIds: string[]; busStore: LiveBusStore; onSelectBus: () => void;
}) {
  const first = itinerary.legs[0];
  const last = itinerary.legs[itinerary.legs.length - 1];
  const busWaypoints = busLegs.flatMap(leg => [leg.from, leg.to])
    .filter((place, index, places) => places.findIndex(item => item.stopId === place.stopId) === index);
  return (
    <MapView
      ref={mapRef}
      onMapReady={onReady}
      provider={PROVIDER_GOOGLE}
      style={StyleSheet.absoluteFill}
      initialRegion={initialRegion}
      showsUserLocation={showsUserLocation}
      showsCompass
    >
      <Marker coordinate={first.from} title="Origen" description={first.from.name} pinColor="#1f6feb" />
      <Marker coordinate={last.to} title="Destino" description={last.to.name} pinColor="#dc2626" />
      {busWaypoints.map((place, index) => (
        <StationMarker key={place.stopId ?? index} routeStop
          stop={{ ...place, id: place.stopId ?? `waypoint-${index}`, type: 'stop', subtitle: '' }}
          selected={place.stopId === selectedLeg?.from.stopId}
          onSelect={() => {
            const leg = busLegs.find(item => item.from.stopId === place.stopId);
            if (leg) onSelectLeg(leg);
          }} />
      ))}
      {itinerary.legs.map(leg => (
        <Fragment key={`${itinerary.id}:${leg.id}`}>
          {leg.mode === 'bus' && <Polyline coordinates={leg.geometry.coordinates} strokeColor="#ffffff" strokeWidth={11} zIndex={1}
            lineDashPattern={leg.geometry.source === 'approximate' ? [4, 6] : undefined} />}
          <Polyline coordinates={leg.geometry.coordinates}
            tappable={leg.mode === 'bus'}
            onPress={() => { if (leg.mode === 'bus') onSelectLeg(leg); }}
            strokeColor={leg.mode === 'bus' ? highlightSelected && leg.id !== selectedLeg?.id ? '#a8adb5' : '#292923' : '#475569'}
            strokeWidth={leg.mode === 'bus' ? 7 : 3} zIndex={2}
            lineDashPattern={leg.mode === 'walk' || leg.geometry.source === 'approximate' ? [4, 6] : undefined} />
        </Fragment>
      ))}
      {arrivingBusIds.map(id => <LiveBusMarker key={id} id={id} store={busStore} selected={false} onSelect={onSelectBus} />)}
    </MapView>
  );
}
