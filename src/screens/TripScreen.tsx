import { useViewTiming } from '../hooks/useViewTiming';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  BackHandler,
  FlatList,
  ActivityIndicator,
  ScrollView,
  useWindowDimensions,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useLocationAccess } from '../context/LocationAccess';
import { LocationGate } from '../components/LocationGate';
import { DataStatus } from '../components/DataStatus';
import { StatusBarSpacer } from '../components/StatusBarSpacer';
import { MapDetailSheet, sheetHeight } from '../components/map/MapDetailSheet';
import { useRemoteData } from '../hooks/useRemoteData';
import { getCatalog, USE_DUMMY_DATA } from '../services/transit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useJourneyPlan, type JourneyQuery } from '../hooks/useJourneyPlan';
import { formatDistance, formatDuration, itineraryTitle, itineraryColor, itineraryDuration, journeyTimeline, walkStepLabel, busWaitLabel, noJourneyMessage } from '../services/journeyPresentation';
import { getTabBarStyle } from '../navigation/tabBar';
import type { JourneyPreference } from '../types/journey';
import type { Location } from '../data/catalog';

type Point = Location & { isCurrent?: boolean };
const journeyPoint = (point: Point) => ({ latitude: point.latitude, longitude: point.longitude,
  ...(point.type === 'stop' || point.type === 'station' ? { stopId: point.id } : {}) });
const preferenceLabels: Record<JourneyPreference, string> = {
  fastest: 'Más rápido', least_walking: 'Menos caminata', fewest_transfers: 'Menos transbordos',
};

export function TripScreen() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const onViewLayout = useViewTiming('Viaje', focused);
  const navigation = useNavigation<BottomTabNavigationProp<{ Viaje: undefined }>>();
  const location = useLocationAccess();
  const catalog = useRemoteData(getCatalog);
  const stopsCatalog = catalog.data?.stops ?? [];

  const canInteract = location.state === 'ready' && focused;
  useEffect(() => { if (focused) void location.refresh(); }, [focused, location.refresh]);
  const [origin, setOrigin] = useState<Point | null>(null);
  const [destination, setDestination] = useState<Point | null>(null);
  const [selectionMode, setSelectionMode] = useState<'origin' | 'destination'>('origin');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [viewingDetail, setViewingDetail] = useState(false);
  const [detailExpanded, setDetailExpanded] = useState(false);
  const closeDetail = () => { setViewingDetail(false); setDetailExpanded(false); };
  const [mapPickerTarget, setMapPickerTarget] = useState<'origin' | 'destination' | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [preference, setPreference] = useState<JourneyPreference>('fastest');
  const [maxWalkingDistanceMeters, setMaxWalkingDistanceMeters] = useState(1500);
  const [maxTransfers, setMaxTransfers] = useState(2);
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
  const busWaypoints = useMemo(() => {
    if (!primaryItinerary) return [];
    const busLegs = primaryItinerary.legs.filter(leg => leg.mode === 'bus');
    if (!busLegs.length) return [];
    const originPlace = primaryItinerary.legs[0].from;
    const destinationPlace = primaryItinerary.legs[primaryItinerary.legs.length - 1].to;
    // Bus legs always carry stopId; comparing by it avoids re-deriving a distance check
    // for the common case, and still catches origin/destination as free coordinates.
    const sameSpot = (a: { latitude: number; longitude: number; stopId?: string }, b: { latitude: number; longitude: number; stopId?: string }) =>
      a.stopId && b.stopId ? a.stopId === b.stopId
        : Math.abs(a.latitude - b.latitude) < 0.0001 && Math.abs(a.longitude - b.longitude) < 0.0001;
    const waypoints: { place: typeof originPlace; entries: { label: string; color: string }[] }[] = [];
    for (const leg of busLegs) {
      for (const [verb, place] of [['Sube al', leg.from], ['Baja del', leg.to]] as const) {
        if (sameSpot(place, originPlace) || sameSpot(place, destinationPlace)) continue;
        const entry = { label: `${verb} ${leg.routeCode}`, color: leg.color };
        const existing = waypoints.find(w => sameSpot(w.place, place));
        if (existing) existing.entries.push(entry); else waypoints.push({ place, entries: [entry] });
      }
    }
    return waypoints;
  }, [primaryItinerary]);
  const timeline = useMemo(() => primaryItinerary ? journeyTimeline(primaryItinerary) : [], [primaryItinerary]);

  useEffect(() => {
    if (!viewingDetail || !mapReady || !primaryItinerary) return;
    const top = 24 + insets.top;
    const bottom = 24 + insets.bottom + sheetHeight(height, detailExpanded);
    mapRef.current?.fitToCoordinates(primaryItinerary.legs.flatMap(leg => leg.geometry.coordinates), {
      edgePadding: { top, bottom, left: 45, right: 45 }, animated: true,
    });
  }, [viewingDetail, primaryItinerary, mapReady, height, detailExpanded, insets.top, insets.bottom]);

  // Give the full screen to the map (route detail or picking a point) while its
  // own back button is visible; the parent Tab.Navigator reads this option back.
  useEffect(() => {
    navigation.setOptions({ tabBarStyle: showingMap ? { display: 'none' } : getTabBarStyle(insets.bottom) });
  }, [navigation, showingMap, insets.bottom]);

  useEffect(() => {
    if (!showingMap) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (viewingDetail) { if (detailExpanded) setDetailExpanded(false); else closeDetail(); }
      else setMapPickerTarget(null);
      return true;
    });
    return () => subscription.remove();
  }, [showingMap, viewingDetail, detailExpanded]);

  useEffect(() => { if (!canInteract) { setPickerVisible(false); setMapPickerTarget(null); setOptionsVisible(false); } }, [canInteract]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, event => setKeyboardHeight(event.endCoordinates.height));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setKeyboardHeight(0));
    return () => { showSubscription.remove(); hideSubscription.remove(); };
  }, []);

  const filteredLocations = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) {
      return stopsCatalog;
    }

    return stopsCatalog.filter(
      (item) =>
        item.name.toLowerCase().includes(query) || item.subtitle.toLowerCase().includes(query),
    );
  }, [searchText, catalog.data]);

  const selectPoint = (point: Point, mode = selectionMode) => {
    if (!canInteract) return;
    setSelectedRouteId(null);
    setActiveQuery(null);
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

  const selectCurrentLocation = async (mode: 'origin' | 'destination') => {
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

  const openPicker = (mode: 'origin' | 'destination') => {
    setSelectionMode(mode);
    setPickerVisible(true);
  };

  const clearTrip = () => {
    setOrigin(null);
    setDestination(null);
    setSelectedRouteId(null);
    setActiveQuery(null);
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
    setSelectedRouteId(null);
    setActiveQuery(null);
    closeDetail();
    setSearchText('');
    setPickerVisible(false);
    setMapPickerTarget(null);
  };

  const runSearch = () => {
    if (!origin || !destination) return;
    setSelectedRouteId(null);
    setActiveQuery({
      origin: journeyPoint(origin), destination: journeyPoint(destination),
      preferences: { optimize: preference, maxWalkingDistanceMeters, maxTransfers },
    });
  };

  const openRoute = (itineraryId: string) => {
    setSelectedRouteId(itineraryId);
    setDetailExpanded(false);
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
          <ScrollView contentContainerStyle={[styles.formContent, { paddingBottom: 104 + insets.bottom }]} keyboardShouldPersistTaps="handled">
            <View style={styles.titleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.eyebrow}>PLANEA TU VIAJE</Text>
                <Text style={styles.title}>¿A dónde quieres ir?</Text>
              </View>
              {(origin || destination || activeQuery || searchText) && (
                <Pressable style={styles.clearTripButton} onPress={clearTrip} accessibilityLabel="Limpiar búsqueda">
                  <Ionicons name="refresh-outline" size={15} color="#dc2626" />
                  <Text style={styles.clearTripText}>Limpiar</Text>
                </Pressable>
              )}
            </View>

            <View style={styles.searchGroup}>
              <View style={styles.connector} />
              <Pressable style={styles.locationField} onPress={() => openPicker('origin')}>
                <View style={[styles.pointIcon, styles.originIcon]}>
                  <Ionicons name="radio-button-on" size={14} color="#fff" />
                </View>
                <View style={styles.fieldText}>
                  <Text style={styles.fieldLabel}>Origen</Text>
                  <Text style={styles.fieldValue} numberOfLines={1}>
                    {origin?.name ?? 'Selecciona tu punto de partida'}
                  </Text>
                </View>
                <Pressable
                  style={styles.currentButton}
                  onPress={(event) => {
                    event.stopPropagation();
                    selectCurrentLocation('origin');
                  }}
                  accessibilityLabel="Usar mi ubicación actual como origen"
                >
                  <Ionicons name="locate-outline" size={20} color="#1f6feb" />
                </Pressable>
              </Pressable>

              <Pressable
                style={[styles.swapButton, (!origin || !destination) && styles.swapButtonDisabled]}
                onPress={swapTripPoints}
                disabled={!origin || !destination}
                accessibilityLabel="Invertir origen y destino"
              >
                <Ionicons name="swap-vertical" size={18} color={origin && destination ? '#1f6feb' : '#94a3b8'} />
              </Pressable>

              <Pressable style={styles.locationField} onPress={() => openPicker('destination')}>
                <View style={[styles.pointIcon, styles.destinationIcon]}>
                  <Ionicons name="location" size={15} color="#fff" />
                </View>
                <View style={styles.fieldText}>
                  <Text style={styles.fieldLabel}>Destino</Text>
                  <Text style={styles.fieldValue} numberOfLines={1}>
                    {destination?.name ?? '¿A dónde vas?'}
                  </Text>
                </View>
                <Pressable
                  style={styles.currentButton}
                  onPress={(event) => {
                    event.stopPropagation();
                    selectCurrentLocation('destination');
                  }}
                  accessibilityLabel="Usar mi ubicación actual como destino"
                >
                  <Ionicons name="locate-outline" size={20} color="#dc2626" />
                </Pressable>
              </Pressable>
            </View>

            {location.positionError && <Pressable onPress={() => void location.locate()}><Text style={styles.mapHint}>{location.positionError} Toca para reintentar.</Text></Pressable>}
            <Pressable onPress={() => setOptionsVisible(true)} accessibilityRole="button" style={styles.plannerOptions}>
              <Ionicons name="options-outline" size={16} color="#1f6feb" />
              <Text style={styles.plannerOptionsText}>Opciones · {preferenceLabels[preference]} · hasta {formatDistance(maxWalkingDistanceMeters)} a pie</Text>
            </Pressable>

            <Pressable
              style={[styles.searchButton, (!origin || !destination || plan.loading) && styles.searchButtonDisabled]}
              disabled={!origin || !destination || plan.loading}
              onPress={runSearch}
              accessibilityRole="button"
              accessibilityLabel="Buscar viajes"
            >
              {plan.loading ? <ActivityIndicator color="#fff" /> : <>
                <Ionicons name="search" size={18} color="#fff" />
                <Text style={styles.searchButtonText}>Buscar viajes</Text>
              </>}
            </Pressable>

            {activeQuery && (plan.loading || plan.error || !itineraries.length) && (
              <View style={styles.resultsStatus}>
                {plan.loading ? <View style={styles.noRouteRow}><ActivityIndicator color="#1f6feb" /><Text style={styles.noRouteText}>Buscando caminatas, buses y conexiones…</Text></View>
                  : plan.error ? <DataStatus error={plan.error} retry={plan.reload} />
                  : <View style={styles.noRouteRow}><Ionicons name="information-circle-outline" size={22} color="#475569" /><Text style={styles.noRouteText}>{noJourneyMessage(plan.data?.meta.noRouteReason)}</Text></View>}
              </View>
            )}

            {activeQuery && itineraries.length > 0 && (
              <View style={styles.resultsSection}>
                <View style={styles.routesHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.routesTitle}>Opciones de viaje</Text>
                    <Text style={styles.routesSubtitle}>{USE_DUMMY_DATA ? 'Simulación · no usar para viajar' : 'Viaje completo de origen a destino'}</Text>
                  </View>
                  <Pressable style={styles.collapseButton} onPress={plan.reload} accessibilityLabel="Actualizar viajes"><Ionicons name="refresh" size={18} color="#475569" /></Pressable>
                </View>
                {itineraries.map(item => (
                  <Pressable key={item.id} style={styles.routeCard}
                    onPress={() => openRoute(item.id)} accessibilityRole="button"
                    accessibilityLabel={`Ver viaje ${itineraryTitle(item)} en el mapa`}>
                    <View style={[styles.routeStripe, { backgroundColor: itineraryColor(item) }]} />
                    <View style={styles.routeCardContent}>
                      <Text style={styles.routeName}>{itineraryTitle(item)}</Text>
                      <Text style={styles.routeDescription}>{item.transfers === 0 ? 'Sin transbordos' : `${item.transfers} transbordo${item.transfers > 1 ? 's' : ''}`} · {formatDistance(item.walkingDistanceMeters)} a pie</Text>
                      <Text style={[styles.routeDuration, { marginTop: 8 }]}>{itineraryDuration(item)}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
        </>
      )}

      {mapPickerTarget && (
        <MapView
          ref={mapRef}
          onMapReady={() => setMapReady(true)}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={defaultRegion}
          showsUserLocation={canInteract}
          showsCompass
          onPress={(event) => selectMapPoint(event.nativeEvent.coordinate)}
        >
          {mapPickerTarget === 'destination' && origin && <Marker coordinate={origin} title="Origen" pinColor="#1f6feb" />}
          {mapPickerTarget === 'origin' && destination && <Marker coordinate={destination} title="Destino" pinColor="#dc2626" />}
        </MapView>
      )}

      {mapPickerTarget && (
        <>
          <Pressable style={[styles.detailBackButton, { top: 16 + insets.top }]} onPress={() => setMapPickerTarget(null)}
            accessibilityRole="button" accessibilityLabel="Cancelar selección en el mapa">
            <Ionicons name="close" size={22} color="#111827" />
          </Pressable>
          <View style={[styles.mapPickerBanner, { top: 16 + insets.top }]}>
            <Ionicons name="hand-left-outline" size={16} color="#1f6feb" />
            <Text style={styles.mapPickerBannerText}>Toca el mapa para marcar tu {mapPickerTarget === 'origin' ? 'origen' : 'destino'}.</Text>
          </View>
        </>
      )}

      {viewingDetail && primaryItinerary && (
        <MapView
          ref={mapRef}
          onMapReady={() => setMapReady(true)}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={defaultRegion}
          showsUserLocation={canInteract}
          showsCompass
        >
          <Marker coordinate={primaryItinerary.legs[0].from} title="Origen" description={primaryItinerary.legs[0].from.name} pinColor="#1f6feb" />
          <Marker coordinate={primaryItinerary.legs[primaryItinerary.legs.length - 1].to} title="Destino" description={primaryItinerary.legs[primaryItinerary.legs.length - 1].to.name} pinColor="#dc2626" />
          {busWaypoints.map((waypoint, index) => (
            <Marker key={`waypoint-${index}-${waypoint.place.stopId ?? `${waypoint.place.latitude},${waypoint.place.longitude}`}`}
              coordinate={waypoint.place} title={waypoint.entries.map(entry => entry.label).join(' · ')}
              description={waypoint.place.name} pinColor={waypoint.entries.length > 1 ? '#0f766e' : waypoint.entries[0].color} />
          ))}
          {primaryItinerary.legs.map(leg => (
            <Polyline key={`${primaryItinerary.id}:${leg.id}`} coordinates={leg.geometry.coordinates}
              strokeColor={leg.mode === 'bus' ? leg.color : '#475569'}
              strokeWidth={leg.mode === 'bus' ? 6 : 3}
              lineDashPattern={leg.mode === 'walk' || leg.geometry.source === 'approximate' ? [4, 6] : undefined} />
          ))}
        </MapView>
      )}

      {viewingDetail && primaryItinerary && (
        <Pressable style={[styles.detailBackButton, { top: 16 + insets.top }]} onPress={closeDetail}
          accessibilityRole="button" accessibilityLabel="Volver a las opciones de viaje">
          <Ionicons name="arrow-back" size={22} color="#111827" />
        </Pressable>
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

      {viewingDetail && primaryItinerary && (
        <MapDetailSheet
          title={itineraryTitle(primaryItinerary)}
          subtitle={`${primaryItinerary.transfers === 0 ? 'Sin transbordos' : `${primaryItinerary.transfers} transbordo${primaryItinerary.transfers > 1 ? 's' : ''}`} · ${formatDistance(primaryItinerary.walkingDistanceMeters)} a pie · ${itineraryDuration(primaryItinerary)}`}
          expanded={detailExpanded}
          onExpand={setDetailExpanded}
          onBack={closeDetail}
          showBackButton={false}
          bottomOffset={0}
          onClear={clearTrip}
        >
          <Text style={styles.stopListTitle}>Paso a paso</Text>
          <FlatList data={timeline} keyExtractor={item => item.id} style={styles.detailStepsList}
            renderItem={({ item, index }) => {
              const isLast = index === timeline.length - 1;
              if (item.kind === 'node') return (
                <View style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View style={[styles.timelineDot, { backgroundColor: item.color }]} />
                    {!isLast && <View style={styles.timelineLine} />}
                  </View>
                  <View style={styles.timelineBody}>
                    <Text style={styles.timelineStopName}>{item.name}</Text>
                  </View>
                </View>
              );
              const leg = item.leg;
              return (
                <View style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View style={[styles.timelineIconBubble, { backgroundColor: leg.mode === 'bus' ? leg.color : '#94a3b8' }]}>
                      <Ionicons name={leg.mode === 'walk' ? 'walk' : 'bus'} size={12} color="#fff" />
                    </View>
                    {!isLast && <View style={styles.timelineLine} />}
                  </View>
                  <View style={styles.timelineBody}>
                    {leg.mode === 'walk' ? <Text style={styles.timelineLegText}>{walkStepLabel(leg)}</Text> : <>
                      <View style={styles.timelineBusRow}>
                        <View style={[styles.timelineRouteBadge, { backgroundColor: leg.color }]}><Text style={styles.timelineRouteBadgeText}>{leg.routeCode}</Text></View>
                        <Text style={styles.timelineLegText} numberOfLines={2}>hacia {leg.headsign}</Text>
                      </View>
                      <Text style={styles.timelineLegMeta}>{formatDuration(leg.durationSeconds)} en bus{leg.geometry.source === 'approximate' ? ' · trazado aproximado' : ''}</Text>
                      <Text style={styles.timelineLegMeta}>{busWaitLabel(leg)}</Text>
                    </>}
                  </View>
                </View>
              );
            }} />
        </MapDetailSheet>
      )}

      <Modal transparent animationType="slide" visible={optionsVisible && canInteract} onRequestClose={() => setOptionsVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setOptionsVisible(false)} />
        <View style={[styles.modalContainer, { paddingBottom: 24 + insets.bottom }]}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Opciones de viaje</Text>
            <Pressable onPress={() => setOptionsVisible(false)} accessibilityLabel="Cerrar opciones"><Ionicons name="close" size={26} color="#111827" /></Pressable>
          </View>
          <Text style={styles.stopListTitle}>Prefiero</Text>
          <View style={styles.optionRow}>{(Object.keys(preferenceLabels) as JourneyPreference[]).map(value => (
            <Pressable key={value} onPress={() => { setPreference(value); setSelectedRouteId(null); setActiveQuery(null); }} style={[styles.optionChip, preference === value && styles.optionChipSelected]} accessibilityRole="radio" accessibilityState={{ checked: preference === value }}>
              <Text style={styles.plannerOptionsText}>{preferenceLabels[value]}</Text>
            </Pressable>
          ))}</View>
          <Text style={styles.stopListTitle}>Caminata máxima total (incluye transbordos)</Text>
          <View style={styles.optionRow}>{[500, 1000, 1500, 2500].map(value => (
            <Pressable key={value} onPress={() => { setMaxWalkingDistanceMeters(value); setSelectedRouteId(null); setActiveQuery(null); }} style={[styles.optionChip, maxWalkingDistanceMeters === value && styles.optionChipSelected]} accessibilityRole="radio" accessibilityState={{ checked: maxWalkingDistanceMeters === value }}>
              <Text style={styles.plannerOptionsText}>{formatDistance(value)}</Text>
            </Pressable>
          ))}</View>
          <Text style={styles.stopListTitle}>Máximo de transbordos</Text>
          <View style={styles.optionRow}>{[0, 1, 2].map(value => (
            <Pressable key={value} onPress={() => { setMaxTransfers(value); setSelectedRouteId(null); setActiveQuery(null); }} style={[styles.optionChip, maxTransfers === value && styles.optionChipSelected]} accessibilityRole="radio" accessibilityState={{ checked: maxTransfers === value }}>
              <Text style={styles.plannerOptionsText}>{value === 0 ? 'Sin transbordos' : value}</Text>
            </Pressable>
          ))}</View>
          <Pressable style={styles.mapPickerItem} onPress={() => setOptionsVisible(false)} accessibilityRole="button"><Text style={styles.plannerOptionsText}>Listo</Text></Pressable>
        </View>
      </Modal>

      <Modal transparent animationType="slide" visible={pickerVisible && canInteract} onRequestClose={() => setPickerVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setPickerVisible(false)} />
        <View style={[styles.modalContainer, { bottom: keyboardHeight, paddingBottom: keyboardHeight > 0 ? 12 : 24 + insets.bottom }]}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.modalEyebrow}>
                {selectionMode === 'origin' ? 'PUNTO DE PARTIDA' : 'PUNTO DE LLEGADA'}
              </Text>
              <Text style={styles.modalTitle}>Busca una ubicación</Text>
            </View>
            <Pressable onPress={() => setPickerVisible(false)} accessibilityLabel="Cerrar búsqueda">
              <Ionicons name="close" size={26} color="#111827" />
            </Pressable>
          </View>

          <View style={styles.inputWrapper}>
            <Ionicons name="search" size={19} color="#64748b" />
            <TextInput
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Escribe una dirección o lugar"
              style={styles.input}
              placeholderTextColor="#9ca3af"
              autoFocus
            />
            {searchText.length > 0 && (
              <Pressable
                onPress={() => setSearchText('')}
                accessibilityLabel="Limpiar búsqueda"
              >
                <Ionicons name="close-circle" size={20} color="#94a3b8" />
              </Pressable>
            )}
          </View>

          <Text style={styles.suggestionLabel}>SUGERENCIAS CERCA DE PEREIRA</Text>
          <FlatList
            data={filteredLocations}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.suggestionList}
            ListHeaderComponent={
              <Pressable style={styles.mapPickerItem} onPress={beginMapSelection}>
                <View style={styles.mapPickerIcon}>
                  <Ionicons name="locate-outline" size={18} color="#1f6feb" />
                </View>
                <View style={styles.suggestionText}>
                  <Text style={styles.suggestionName}>Selecciona en el mapa</Text>
                  <Text style={styles.suggestionSubtitle}>Toca cualquier punto del mapa para marcarlo</Text>
                </View>
                <Ionicons name="map-outline" size={20} color="#1f6feb" />
              </Pressable>
            }
            renderItem={({ item }) => (
              <Pressable style={styles.suggestionItem} onPress={() => selectPoint(item)}>
                <View style={styles.suggestionIcon}>
                  <Ionicons name="location-outline" size={18} color="#1f6feb" />
                </View>
                <View style={styles.suggestionText}>
                  <Text style={styles.suggestionName}>{item.name}</Text>
                  <Text style={styles.suggestionSubtitle}>{item.subtitle}</Text>
                </View>
                <Ionicons name="add-circle-outline" size={21} color="#94a3b8" />
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyState}>No encontramos esa ubicación.</Text>
            }
          />
        </View>
      </Modal>
    </View></LocationGate>
  );
}

const styles = StyleSheet.create({
  plannerOptions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  plannerOptionsText: { color: '#1f6feb', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  optionChip: { padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#dbe2ea' },
  optionChipSelected: { backgroundColor: '#dbeafe', borderColor: '#1f6feb' },
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  formContent: {
    padding: 20,
    paddingTop: 24,
  },
  detailBackButton: {
    position: 'absolute',
    left: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  mapPickerBanner: {
    position: 'absolute',
    left: 68,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  mapPickerBannerText: {
    flex: 1,
    color: '#1f6feb',
    fontSize: 12,
    fontWeight: '700',
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
  eyebrow: {
    color: '#1f6feb',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    color: '#111827',
    fontSize: 22,
    fontWeight: '800',
    marginTop: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  clearTripButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
    paddingVertical: 5,
    paddingLeft: 8,
  },
  clearTripText: {
    color: '#dc2626',
    fontSize: 12,
    fontWeight: '700',
  },
  searchGroup: {
    position: 'relative',
    gap: 8,
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  connector: {
    position: 'absolute',
    left: 32,
    top: 44,
    bottom: 44,
    width: 1,
    backgroundColor: '#cbd5e1',
  },
  swapButton: {
    position: 'absolute',
    right: 28,
    top: 64,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  swapButtonDisabled: {
    borderColor: '#e2e8f0',
  },
  locationField: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  pointIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  originIcon: {
    backgroundColor: '#1f6feb',
  },
  destinationIcon: {
    backgroundColor: '#dc2626',
  },
  fieldText: {
    flex: 1,
    marginLeft: 10,
  },
  fieldLabel: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  fieldValue: {
    color: '#1e293b',
    fontSize: 14,
    fontWeight: '600',
  },
  currentButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#eff6ff',
  },
  mapHint: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 12,
  },
  searchButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: '#1f6feb',
    marginTop: 18,
  },
  searchButtonDisabled: {
    opacity: 0.45,
  },
  searchButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  resultsStatus: {
    marginTop: 20,
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 16,
  },
  noRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noRouteText: {
    flex: 1,
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
  },
  resultsSection: {
    marginTop: 24,
  },
  routesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  routesTitle: {
    color: '#111827',
    fontSize: 18,
    fontWeight: '800',
  },
  routesSubtitle: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  collapseButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
    paddingRight: 12,
  },
  routeStripe: {
    width: 5,
    alignSelf: 'stretch',
  },
  routeCardContent: {
    flex: 1,
    padding: 14,
  },
  routeName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  routeDescription: {
    color: '#64748b',
    fontSize: 11,
    lineHeight: 16,
    marginTop: 5,
  },
  routeDuration: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  stopListTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  detailStepsList: {
    flex: 1,
  },
  timelineRow: {
    flexDirection: 'row',
  },
  timelineRail: {
    width: 28,
    alignItems: 'center',
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  timelineIconBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineLine: {
    flex: 1,
    width: 2,
    marginTop: 2,
    backgroundColor: '#cbd5e1',
  },
  timelineBody: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 16,
  },
  timelineStopName: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  timelineLegText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  timelineLegMeta: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 3,
  },
  timelineBusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  timelineRouteBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  timelineRouteBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
  },
  modalContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '76%',
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 18,
    paddingHorizontal: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalEyebrow: {
    color: '#1f6feb',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  modalTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 3,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe2ea',
    paddingHorizontal: 13,
    marginBottom: 18,
  },
  input: {
    flex: 1,
    color: '#111827',
    fontSize: 15,
    paddingVertical: 13,
    paddingHorizontal: 10,
  },
  suggestionLabel: {
    color: '#64748b',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  suggestionList: {
    paddingBottom: 8,
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 11,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#edf2f7',
  },
  suggestionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mapPickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eff6ff',
    borderRadius: 14,
    padding: 11,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  mapPickerIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionText: {
    flex: 1,
    marginLeft: 11,
  },
  suggestionName: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  suggestionSubtitle: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  emptyState: {
    color: '#64748b',
    textAlign: 'center',
    paddingVertical: 22,
  },
});
