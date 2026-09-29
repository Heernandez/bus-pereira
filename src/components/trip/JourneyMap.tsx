import { Fragment, type RefObject } from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { StationMarker } from '../map/TransitMap';
import { LiveBusMarker } from '../map/BusMarker';
import type { LiveBusStore } from '../../services/liveBuses';
import type { BusLeg, Itinerary } from '../../types/journey';

const WALK_COLOR = '#374151';
const ROUTE_COLOR = '#292923';
const DIMMED_COLOR = '#a8adb5';

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
      userInterfaceStyle="light"
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
      {itinerary.legs.map(leg => {
        const key = `${itinerary.id}:${leg.id}`;
        // Walking: thick round dots (Android draws any dash pattern as dots with round caps); the gap is in pixels.
        if (leg.mode === 'walk') return <Polyline key={key} coordinates={leg.geometry.coordinates}
          strokeColor={WALK_COLOR} strokeWidth={6} lineDashPattern={[1, 22]} zIndex={4} />;
        // Bus: solid black over a white casing, same as a selected route in Explorar.
        // Approximate geometry is flagged in the step list, not with a dashed line.
        const dimmed = highlightSelected && leg.id !== selectedLeg?.id;
        return <Fragment key={key}>
          <Polyline coordinates={leg.geometry.coordinates} strokeColor="#ffffff" strokeWidth={11} zIndex={dimmed ? 1 : 5} />
          <Polyline coordinates={leg.geometry.coordinates} tappable onPress={() => onSelectLeg(leg)}
            strokeColor={dimmed ? DIMMED_COLOR : ROUTE_COLOR} strokeWidth={7} zIndex={dimmed ? 2 : 6} />
        </Fragment>;
      })}
      {arrivingBusIds.map(id => <LiveBusMarker key={id} id={id} store={busStore} selected={false} onSelect={onSelectBus} />)}
    </MapView>
  );
}
