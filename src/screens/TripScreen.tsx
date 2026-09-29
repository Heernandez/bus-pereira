import { useViewTiming } from '../hooks/useViewTiming';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import type MapView from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocationAccess } from '../context/LocationAccess';
import { LocationGate } from '../components/LocationGate';
import { DataStatus } from '../components/DataStatus';
import { StatusBarSpacer } from '../components/StatusBarSpacer';
import { MapDetailSheet, sheetHeight } from '../components/map/MapDetailSheet';
import { StationDetail, connectionLabel } from '../components/map/TransitDetail';
import { centerShowingPointAbove, visibleCenterOffset } from '../services/mapCamera';
import { TripPlannerForm } from '../components/trip/TripPlannerForm';
import { MapPointPicker } from '../components/trip/MapPointPicker';
import { JourneyMap } from '../components/trip/JourneyMap';
import { JourneyDetail } from '../components/trip/JourneyDetail';
import { JourneyOptionsModal } from '../components/trip/JourneyOptionsModal';
import { LocationPickerModal } from '../components/trip/LocationPickerModal';
import { tripStyles, type PointMode, type TripOptions, type TripPoint } from '../components/trip/shared';
import { useStationArrivals } from '../hooks/useStationArrivals';
import { departuresForRoute } from '../services/stationArrivals';
import { useCatalog } from '../hooks/useCatalog';
import { useJourneyPlan, type JourneyQuery } from '../hooks/useJourneyPlan';
import { formatClock, itineraryTitle, itineraryDuration, journeySchedule, journeySteps, legChips, rideStopCount } from '../services/journeyPresentation';
import { LegSummary } from '../components/trip/LegSummary';
import { useSession } from '../context/Session';
import { usePurchasedPasses } from '../context/Opening';
import { hasUsablePass } from '../services/startup';
import { getTabBarStyle } from '../navigation/tabBar';
import type { BusLeg } from '../types/journey';

const journeyPoint = (point: TripPoint) => ({ latitude: point.latitude, longitude: point.longitude,
  ...(point.type === 'stop' || point.type === 'station' ? { stopId: point.id } : {}) });

export function TripScreen() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const onViewLayout = useViewTiming('Viaje', focused);
  const navigation = useNavigation<BottomTabNavigationProp<{ Viaje: undefined; Pasabordo: { tab?: 'buy' | 'history' } | undefined }>>();
  const location = useLocationAccess();
  const catalog = useCatalog();

  const canInteract = location.state === 'ready' && focused;
  useEffect(() => { if (focused) void location.refresh(); }, [focused, location.refresh]);
  const [origin, setOrigin] = useState<TripPoint | null>(null);
  const [destination, setDestination] = useState<TripPoint | null>(null);
  const [selectionMode, setSelectionMode] = useState<PointMode>('origin');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [viewingDetail, setViewingDetail] = useState(false);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const closeDetail = () => { setViewingDetail(false); setDetailExpanded(false); setPreviewStationId(null); };
  const [mapPickerTarget, setMapPickerTarget] = useState<PointMode | null>(null);
  const [options, setOptions] = useState<TripOptions>({ preference: 'fastest', maxWalkingDistanceMeters: 1500, maxTransfers: 2 });
  const [optionsVisible, setOptionsVisible] = useState(false);
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);
  const [locating, setLocating] = useState(false);
  const locatingRef = useRef(false);
  const screenActive = useRef(false);
  screenActive.current = canInteract;
  useEffect(() => () => { screenActive.current = false; }, []);
  const { height } = useWindowDimensions();
  const showingMap = viewingDetail || !!mapPickerTarget;

  // The search only runs when the user taps "Buscar viajes"; editing anything
  // afterwards clears this so stale results are never shown for a different
  // origin/destination/preference than what's on screen.
  const [activeQuery, setActiveQuery] = useState<JourneyQuery | null>(null);
  const plan = useJourneyPlan(activeQuery);
  const itineraries = plan.data?.data.itineraries ?? [];
  const primaryItinerary = itineraries.find(item => item.id === selectedRouteId) ?? itineraries[0] ?? null;
  const [selectedLegId, setSelectedLegId] = useState<string | null>(null);
  // Station opened with "Ver más" from a boarding stop; back returns to the trip.
  const [previewStationId, setPreviewStationId] = useState<string | null>(null);
  const busLegs = primaryItinerary?.legs.filter((leg): leg is BusLeg => leg.mode === 'bus') ?? [];
  const selectedLeg = busLegs.find(leg => leg.id === selectedLegId) ?? busLegs[0];
  const selectJourneyLeg = (leg: BusLeg) => {
    setSelectedLegId(leg.id);
    setDetailExpanded(true);
  };
  const stationArrivals = useStationArrivals(selectedLeg?.from.stopId, canInteract && viewingDetail && !!selectedLeg?.from.stopId);
  const previewArrivals = useStationArrivals(previewStationId ?? undefined, canInteract && viewingDetail && !!previewStationId);
  const previewStation = catalog.data?.stations.find(station => station.id === previewStationId)
    ?? catalog.data?.stops.find(stop => stop.id === previewStationId);
  const arrivingBusIds = [...new Set((selectedLeg?.from.stopId
    ? departuresForRoute(stationArrivals.data?.data.arrivals ?? [], selectedLeg.from.stopId, selectedLeg.routeId, selectedLeg.variantId)
    : []).flatMap(item => item.arrival.vehicle ? [item.arrival.vehicle.id] : []))];
  const schedule = useMemo(() => primaryItinerary ? journeySchedule(primaryItinerary, new Date(plan.data?.meta.generatedAt ?? NaN)) : null, [primaryItinerary, plan.data]);
  const steps = useMemo(() => primaryItinerary ? journeySteps(primaryItinerary, schedule) : [], [primaryItinerary, schedule]);
  const stopCount = (leg: BusLeg) => rideStopCount(catalog.data?.routes ?? [], leg);
  // Suggest buying only when we know there is no usable pass (or no account to hold one).
  const { account } = useSession();
  const purchased = usePurchasedPasses();
  const showPassOffer = !account || (purchased.passes !== null && !hasUsablePass(purchased.passes));

  useEffect(() => {
    if (!viewingDetail || !mapReady || !primaryItinerary) return;
    if (previewStation) {
      // Center the station in the map band still visible above the sheet, not behind it.
      const up = visibleCenterOffset(height, insets.top, height - insets.bottom - sheetHeight(height, detailExpanded));
      mapRef.current?.animateCamera({ center: centerShowingPointAbove(previewStation, 16, up), zoom: 16 }, { duration: 450 });
      return;
    }
    const top = 24 + insets.top;
    const bottom = 24 + insets.bottom + sheetHeight(height, detailExpanded);
    mapRef.current?.fitToCoordinates(selectedLegId && selectedLeg ? selectedLeg.geometry.coordinates : primaryItinerary.legs.flatMap(leg => leg.geometry.coordinates), {
      edgePadding: { top, bottom, left: 45, right: 45 }, animated: true,
    });
  }, [viewingDetail, primaryItinerary, selectedLegId, selectedLeg, previewStation, mapReady, height, detailExpanded, insets.top, insets.bottom]);

  // Give the full screen to the map (route detail or picking a point) while its
  // own back button is visible; the parent Tab.Navigator reads this option back.
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: showingMap ? { display: 'none' } : getTabBarStyle(insets.bottom) });
  }, [navigation, showingMap, insets.bottom]);

  useEffect(() => {
    if (!showingMap) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (viewingDetail) { if (previewStationId) setPreviewStationId(null); else if (detailExpanded) setDetailExpanded(false); else closeDetail(); }
      else setMapPickerTarget(null);
      return true;
    });
    return () => subscription.remove();
  }, [showingMap, viewingDetail, detailExpanded, previewStationId]);

  useEffect(() => { if (!canInteract) { setPickerVisible(false); setMapPickerTarget(null); setOptionsVisible(false); } }, [canInteract]);

  // Any change to the trip invalidates the current results.
  const resetResults = () => {
    setSelectedRouteId(null);
    setActiveQuery(null);
  };

  const selectPoint = (point: TripPoint, mode = selectionMode) => {
    if (!canInteract) return;
    resetResults();
    closeDetail();

    if (mode === 'origin') {
      setOrigin(point);
      setSelectionMode('destination');
    } else {
      setDestination(point);
    }

    setPickerVisible(false);
    setSearchText('');
  };

  const selectCurrentLocation = async (mode: PointMode) => {
    const coordinate = await location.locate();
    if (!coordinate) return;
    selectPoint({
      id: `current-${mode}`, name: 'Mi ubicación actual', subtitle: 'Ubicación del teléfono',
      ...coordinate, type: 'poi', isCurrent: true,
    }, mode);
  };

  const selectMapPoint = (coordinate: { latitude: number; longitude: number }) => {
    if (!mapPickerTarget) return;
    selectPoint({
      id: `${mapPickerTarget}-map-point`,
      name: mapPickerTarget === 'origin' ? 'Origen seleccionado' : 'Destino seleccionado',
      subtitle: 'Punto elegido en el mapa',
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      type: 'poi',
    }, mapPickerTarget);
    setMapPickerTarget(null);
  };

  const beginMapSelection = () => {
    setMapReady(false);
    setMapPickerTarget(selectionMode);
    setPickerVisible(false);
  };

  const openPicker = (mode: PointMode) => {
    setSelectionMode(mode);
    setPickerVisible(true);
  };

  const clearTrip = () => {
    setOrigin(null);
    setDestination(null);
    resetResults();
    closeDetail();
    setSearchText('');
    setPickerVisible(false);
    setSelectionMode('origin');
    setMapPickerTarget(null);
  };

  const swapTripPoints = () => {
    if (!origin || !destination) {
      return;
    }

    setOrigin(destination);
    setDestination(origin);
    resetResults();
    closeDetail();
    setSearchText('');
    setPickerVisible(false);
    setMapPickerTarget(null);
  };

  const changeOptions = (change: Partial<TripOptions>) => {
    setOptions(current => ({ ...current, ...change }));
    resetResults();
  };

  const runSearch = () => {
    if (!origin || !destination) return;
    setSelectedRouteId(null);
    setActiveQuery({
      origin: journeyPoint(origin), destination: journeyPoint(destination),
      preferences: { optimize: options.preference, maxWalkingDistanceMeters: options.maxWalkingDistanceMeters, maxTransfers: options.maxTransfers },
    });
  };

  const openRoute = (itineraryId: string) => {
    setSelectedLegId(null);
    setPreviewStationId(null);
    setSelectedRouteId(itineraryId);
    setDetailExpanded(true);
    setMapReady(false);
    setViewingDetail(true);
  };

  const centerOnMe = async () => {
    if (!mapReady || !canInteract || locatingRef.current) return;
    locatingRef.current = true;
    setLocating(true);
    const focus = (point: { latitude: number; longitude: number }) => {
      if (!screenActive.current) return;
      mapRef.current?.setCamera({ center: point, zoom: 16, pitch: 0, heading: 0 });
    };
    if (location.coordinate) focus(location.coordinate);
    try {
      const point = await location.locate();
      if (point) focus(point);
    } finally {
      locatingRef.current = false;
      if (screenActive.current) setLocating(false);
    }
  };

  if (!catalog.data) return <LocationGate><View onLayout={onViewLayout} style={[styles.container, { justifyContent: 'center' }]}><DataStatus error={catalog.error} retry={catalog.reload} /></View></LocationGate>;
  const defaultRegion = catalog.data.city.defaultRegion;
  return (
    <LocationGate><View onLayout={onViewLayout} style={styles.container}>

      {!showingMap && (
        <>
          <StatusBarSpacer />
          <TripPlannerForm
            origin={origin}
            destination={destination}
            canClear={!!(origin || destination || activeQuery || searchText)}
            onClear={clearTrip}
            onOpenPicker={openPicker}
            onUseCurrentLocation={mode => void selectCurrentLocation(mode)}
            onSwap={swapTripPoints}
            positionError={location.positionError}
            onRetryPosition={() => void location.locate()}
            preference={options.preference}
            maxWalkingDistanceMeters={options.maxWalkingDistanceMeters}
            onOpenOptions={() => setOptionsVisible(true)}
            plan={activeQuery ? plan : null}
            onSearch={runSearch}
            onOpenItinerary={openRoute}
            bottomInset={insets.bottom}
          />
        </>
      )}

      {mapPickerTarget && (
        <MapPointPicker
          mapRef={mapRef}
          target={mapPickerTarget}
          origin={origin}
          destination={destination}
          initialRegion={defaultRegion}
          showsUserLocation={canInteract}
          topInset={insets.top}
          onReady={() => setMapReady(true)}
          onPick={selectMapPoint}
          onCancel={() => setMapPickerTarget(null)}
        />
      )}

      {viewingDetail && primaryItinerary && (
        <>
          <JourneyMap
            mapRef={mapRef}
            itinerary={primaryItinerary}
            initialRegion={defaultRegion}
            showsUserLocation={canInteract}
            onReady={() => setMapReady(true)}
            busLegs={busLegs}
            selectedLeg={selectedLeg}
            highlightSelected={!!selectedLegId}
            onSelectLeg={selectJourneyLeg}
            arrivingBusIds={arrivingBusIds}
            busStore={stationArrivals.store}
            onSelectBus={() => setDetailExpanded(true)}
          />
          <Pressable style={[tripStyles.mapBackButton, { top: 16 + insets.top }]} onPress={closeDetail}
            accessibilityRole="button" accessibilityLabel="Volver a las opciones de viaje">
            <Ionicons name="arrow-back" size={22} color="#111827" />
          </Pressable>
        </>
      )}

      {showingMap && (
        <Pressable
          style={[styles.locateButton, {
            bottom: viewingDetail ? 16 + insets.bottom + sheetHeight(height, detailExpanded) : insets.bottom + 16,
          }]}
          onPress={centerOnMe}
          disabled={!mapReady || !canInteract || locating}
          accessibilityRole="button"
          accessibilityState={{ disabled: !mapReady || !canInteract || locating, busy: locating }}
          accessibilityLabel="Centrar en mi ubicación"
        >
          {locating ? <ActivityIndicator color="#fff" /> : <Ionicons name="locate" size={24} color="#fff" />}
        </Pressable>
      )}

      {viewingDetail && primaryItinerary && previewStationId && (
        <MapDetailSheet
          title={previewStation?.name ?? 'Estación'}
          subtitle={`${previewStation?.subtitle ? `${previewStation.subtitle} · ` : ''}${connectionLabel(previewArrivals.connection)}`}
          expanded={detailExpanded}
          onExpand={setDetailExpanded}
          onBack={() => setPreviewStationId(null)}
          bottomOffset={0}
          onClear={clearTrip}
        >
          <StationDetail response={previewArrivals.data} store={previewArrivals.store} connection={previewArrivals.connection}
            error={previewArrivals.error} retry={previewArrivals.retry} />
        </MapDetailSheet>
      )}

      {viewingDetail && primaryItinerary && !previewStationId && (
        <MapDetailSheet
          title={[itineraryTitle(primaryItinerary), itineraryDuration(primaryItinerary)].filter(Boolean).join(', ')}
          titleContent={<View style={styles.sheetTitle}>
            <View style={{ flex: 1, minWidth: 0 }}><LegSummary chips={legChips(primaryItinerary)} /></View>
            {itineraryDuration(primaryItinerary) && <Text style={styles.sheetDuration}>{itineraryDuration(primaryItinerary)}</Text>}
          </View>}
          subtitle={schedule ? `Sal a las ${formatClock(schedule.leaveAt)} · Llegas ${formatClock(schedule.arriveAt)}` : ''}
          expanded={detailExpanded}
          onExpand={setDetailExpanded}
          onBack={closeDetail}
          showBackButton={false}
          bottomOffset={0}
          onClear={clearTrip}
        >
          <JourneyDetail
            steps={steps}
            stopCount={stopCount}
            selectedLeg={selectedLeg}
            selectedArrivals={stationArrivals}
            active={canInteract}
            showingSingleLeg={!!selectedLegId}
            onShowFullJourney={() => setSelectedLegId(null)}
            onSelectLeg={selectJourneyLeg}
            onPreviewStation={stopId => { setPreviewStationId(stopId); setDetailExpanded(true); }}
            showPassOffer={showPassOffer}
            onBuyPass={() => navigation.navigate('Pasabordo', { tab: 'buy' })}
          />
        </MapDetailSheet>
      )}

      <JourneyOptionsModal
        visible={optionsVisible && canInteract}
        onClose={() => setOptionsVisible(false)}
        options={options}
        onChange={changeOptions}
        bottomInset={insets.bottom}
      />

      <LocationPickerModal
        visible={pickerVisible && canInteract}
        mode={selectionMode}
        locations={catalog.data.stops}
        searchText={searchText}
        onChangeSearch={setSearchText}
        onSelect={item => selectPoint(item)}
        onPickOnMap={beginMapSelection}
        onClose={() => setPickerVisible(false)}
        bottomInset={insets.bottom}
      />
    </View></LocationGate>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  sheetTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sheetDuration: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
  },
  locateButton: {
    position: 'absolute',
    right: 18,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#0f766e',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
});
