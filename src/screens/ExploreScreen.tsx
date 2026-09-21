import { useViewTiming } from '../hooks/useViewTiming';
import { startupLog, startupOnce } from '../services/startupTiming';
import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import MapView from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useIsFocused } from '@react-navigation/native';
import { useExploreReady } from '../context/ExploreReady';
import { useLocationAccess } from '../context/LocationAccess';
import { LocationGate } from '../components/LocationGate';
import { DataStatus } from '../components/DataStatus';
import { useRemoteData } from '../hooks/useRemoteData';
import { useLiveTransit, useStationArrivals } from '../hooks/useStationArrivals';
import { getCatalog, getRouteLive, type LiveBus } from '../services/transit';
import { StationDetail, RouteDetail, connectionLabel } from '../components/map/TransitDetail';
import { TransitMap } from '../components/map/TransitMap';
import { MapDetailSheet, sheetHeight } from '../components/map/MapDetailSheet';
import { initialMapState, mapSelectionReducer } from '../services/mapSelection';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type Location, type RouteOption, type RouteVariant } from '../data/catalog';

export function ExploreScreen() {
  useEffect(() => { startupOnce('Explorar: montado'); }, []);
  const { markNativeReady, markExploreReady } = useExploreReady();
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapTimedOut, setMapTimedOut] = useState(false);
  const [layoutReady, setLayoutReady] = useState(false);
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const [locating, setLocating] = useState(false);
  const locatingRef = useRef(false);
  const userCamera = useRef(false);
  const screenActive = useRef(false);
  const { height } = useWindowDimensions();
  const centered = useRef(false);
  const focused = useIsFocused();
  const onViewLayout = useViewTiming('Explorar', focused);
  const location = useLocationAccess();
  const catalog = useRemoteData(getCatalog);
  const [searchVisible, setSearchVisible] = useState(false);
  const [mapState, dispatch] = useReducer(mapSelectionReducer, initialMapState);
  const { selection } = mapState;
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);
  const [searchText, setSearchText] = useState('');
  const selectedLocation = selection.type === 'station' ? catalog.data?.stations.find(stop => stop.id === selection.stationId) : undefined;
  const canInteract = location.state === 'ready' && focused;
  screenActive.current = canInteract;
  useEffect(() => () => { screenActive.current = false; }, []);
  const routeId = selection.type === 'route' || selection.type === 'bus' ? selection.routeId : undefined;
  const routeLive = useLiveTransit(routeId, !!routeId && canInteract, 'route', getRouteLive);
  const route = routeLive.data?.data.route;
  const variant = route?.variants.find(variant => (selection.type === 'route' || selection.type === 'bus') && variant.id === selection.variantId) ?? route?.variants[0];

  const arrivals = useStationArrivals(selectedLocation?.id, selection.type === 'station' && canInteract);
  const userLocation = location.coordinate;

  useEffect(() => {
    if (focused) void location.refresh();
  }, [focused, location.refresh]);
  useEffect(() => {
    if (canInteract) void location.locate();
  }, [canInteract, location.locate]);
  useEffect(() => {
    if (!canInteract) { setSearchVisible(false); setLocating(false); }
  }, [canInteract]);

  useEffect(() => {
    if (!focused || selection.type === 'none') return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (mapState.sheet === 'expanded') dispatch({ type: 'sheet', value: 'collapsed' });
      else dispatch({ type: 'back' });
      return true;
    });
    return () => subscription.remove();
  }, [focused, selection.type, mapState.sheet]);

  const filteredStops = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return (catalog.data?.stations ?? []).filter(item =>
      item.name.toLowerCase().includes(query) || item.subtitle.toLowerCase().includes(query));
  }, [searchText, catalog.data]);
  const selectedRouteCoordinates = useMemo(() => routeLive.data?.data.shapes.find(shape => shape.variantId === variant?.id)?.coordinates ?? [], [routeLive.data, variant?.id]);
  const routeStops = useMemo(() => (variant?.stopSequence ?? []).flatMap(id => {
    const stop = routeLive.data?.data.stops.find(stop => stop.id === id);
    return stop ? [stop] : [];
  }), [variant, routeLive.data]);
  useEffect(() => { userCamera.current = false; }, [selection]);
  const shapeKey = useMemo(() => JSON.stringify(selectedRouteCoordinates), [selectedRouteCoordinates]);
  useEffect(() => {
    if (!userCamera.current && mapReady && canInteract && selectedLocation) mapRef.current?.animateCamera({ center: selectedLocation }, { duration: 450 });
  }, [mapReady, canInteract, selectedLocation]);
  useEffect(() => {
    if (!userCamera.current && mapReady && canInteract && selectedRouteCoordinates.length > 1) {
      mapRef.current?.fitToCoordinates(selectedRouteCoordinates, { edgePadding: { top: insets.top + 90, left: 48, right: 48, bottom: insets.bottom + 100 + sheetHeight(height, mapState.sheet === 'expanded') }, animated: true });
    }
  }, [mapReady, canInteract, shapeKey, height, insets.top, insets.bottom, mapState.sheet]);
  useEffect(() => {
    if (mapReady && canInteract && userLocation && selection.type === 'none' && !centered.current) {
      centered.current = true; mapRef.current?.animateCamera({ center: userLocation }, { duration: 450 });
    }
  }, [mapReady, canInteract, userLocation, selection.type]);
  const selectRoute = useCallback((route: RouteOption, variant: RouteVariant, tripId?: string) => dispatch({ type: 'select', selection: { type: 'route', routeId: route.id, variantId: variant.id, tripId } }), []);
  const selectBus = useCallback((bus: LiveBus) => dispatch({ type: 'select', selection: { type: 'bus', busId: bus.id, routeId: bus.routeId, variantId: bus.variantId, tripId: bus.tripId } }), []);

  const centerOnMe = useCallback(async () => {
    if (!mapReady || !canInteract || locatingRef.current) return;
    locatingRef.current = true;
    userCamera.current = true;
    setLocating(true);
    // Apply a complete camera, avoiding the inherited route zoom/tilt.
    const focus = (point: { latitude: number; longitude: number }) => {
      if (!screenActive.current) return;
      centered.current = true;
      mapRef.current?.setCamera({ center: point, zoom: 16, pitch: 0, heading: 0 });
    };
    if (userLocation) focus(userLocation);
    try {
      const point = await location.locate();
      if (point) focus(point);
    } finally {
      locatingRef.current = false;
      if (screenActive.current) setLocating(false);
    }
  }, [mapReady, canInteract, userLocation, location.locate]);
  useEffect(() => {
    const fallback = mapTimedOut || !!catalog.error || (location.state !== 'checking' && location.state !== 'ready');
    if (layoutReady && (mapReady || fallback)) {
      startupOnce('Explorar: listo para liberar splash nativo', { mapReady, fallback });
      markNativeReady();
    }
  }, [layoutReady, mapReady, mapTimedOut, catalog.error, location.state, markNativeReady]);
  useEffect(() => {
    if (layoutReady && (mapLoaded || mapTimedOut || catalog.error || (location.state !== 'checking' && location.state !== 'ready'))) { startupOnce('Explorar: listo para retirar cubierta React', { mapLoaded, mapTimedOut, catalogError: !!catalog.error, location: location.state }); markExploreReady(); }
  }, [layoutReady, mapLoaded, mapTimedOut, catalog.error, location.state, markExploreReady]);
  useEffect(() => {
    if (!catalog.data || mapLoaded) return;
    startupOnce('Mapa: catálogo disponible, esperando carga');
    const timeout = setTimeout(() => { startupLog('Mapa: timeout de carga', { limitMs: 12000 }); setMapTimedOut(true); }, 12000);
    return () => clearTimeout(timeout);
  }, [catalog.data, mapLoaded]);
  const onMapLoaded = useCallback(() => { startupOnce('Mapa: onMapLoaded'); setMapLoaded(true); setMapTimedOut(false); }, []);
  const onExploreLayout = useCallback(() => { onViewLayout(); startupOnce('Explorar: primer layout'); setLayoutReady(true); }, [onViewLayout]);
  const onMapReady = useCallback(() => { startupOnce('Mapa: onMapReady'); setMapReady(true); }, []);
  const openStationRoutes = useCallback((stop: Location) => {
    if (!canInteract) return;
    dispatch({ type: 'select', selection: { type: 'station', stationId: stop.id } });
    setSearchVisible(false);
    setSearchText('');
  }, [canInteract]);
  if (!catalog.data) return <LocationGate><View onLayout={onExploreLayout} style={[styles.container, { justifyContent: 'center' }]}><DataStatus error={catalog.error} retry={catalog.reload} /></View></LocationGate>;
  const defaultRegion = catalog.data.city.defaultRegion;


  return (
    <LocationGate><View style={styles.container} onLayout={onExploreLayout}>
      <TransitMap mapRef={mapRef} initialRegion={defaultRegion} canInteract={canInteract} onReady={onMapReady} onLoaded={onMapLoaded}
        stations={routeId ? routeStops : catalog.data.stations} routeStop={!!routeId} selectedStationId={selectedLocation?.id}
        shape={selectedRouteCoordinates} color={route?.color ?? '#1f6feb'} store={routeId ? routeLive.store : arrivals.store}
        selectedBusId={selection.type === 'bus' ? selection.busId : undefined} onSelectBus={selectBus}
        onSelectStation={openStationRoutes} userLocation={userLocation} />

      {mapTimedOut && !mapLoaded && <View style={[StyleSheet.absoluteFill, { backgroundColor: '#f8fafc', justifyContent: 'center', padding: 24 }]}>
        <Text style={{ textAlign: 'center', color: '#475569' }}>No pudimos cargar el mapa. Comprueba tu conexión a internet.</Text>
      </View>}
      <Pressable
        style={[styles.searchButton, { top: 52 + insets.top }]}
        onPress={() => setSearchVisible(true)}
        accessibilityLabel="Buscar ubicaciones"
      >
        <Ionicons name="search" size={22} color="#fff" />
      </Pressable>

      <Pressable
        style={[styles.locationButton, { bottom: tabBarHeight + 12 + (selection.type === 'none' ? 0 : sheetHeight(height, mapState.sheet === 'expanded')) }]}
        onPress={centerOnMe}
        disabled={!mapReady || !canInteract || locating}
        accessibilityRole="button"
        accessibilityState={{ disabled: !mapReady || !canInteract || locating, busy: locating }}
        accessibilityLabel="Centrar en mi ubicación"
      >
        {locating ? <ActivityIndicator color="#fff" /> : <Ionicons name="locate" size={24} color="#fff" />}
      </Pressable>

      {location.positionError && <Pressable style={{ position: 'absolute', top: 116 + insets.top, left: 16, right: 16, backgroundColor: '#fff', padding: 16, borderRadius: 12 }} onPress={centerOnMe}><Text>{location.positionError}</Text><Text style={{ color: '#1f6feb', marginTop: 8 }}>Reintentar ubicación</Text></Pressable>}

      <Modal transparent animationType="slide" visible={searchVisible && canInteract} onRequestClose={() => setSearchVisible(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setSearchVisible(false)} />

        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Buscar ubicación</Text>
            <Pressable onPress={() => setSearchVisible(false)}>
              <Ionicons name="close" size={26} color="#111827" />
            </Pressable>
          </View>

          <TextInput
            value={searchText}
            onChangeText={setSearchText}
            placeholder="Busca una parada o zona"
            style={styles.input}
            placeholderTextColor="#9ca3af"
            autoFocus
          />

          <FlatList
            data={filteredStops}
            keyExtractor={(item) => item.id}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <Pressable
                style={styles.resultItem}
                onPress={() => openStationRoutes(item)}
              >
                <View style={styles.badge}>
                  <Ionicons name="location" size={14} color="#fff" />
                </View>
                <View style={styles.resultTextWrap}>
                  <Text style={styles.resultName}>{item.name}</Text>
                  <Text style={styles.resultSubtitle}>{item.subtitle}</Text>
                </View>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={styles.emptyState}>No encontramos resultados para tu búsqueda.</Text>
            }
          />
        </View>
      </Modal>

      {selection.type === 'station' && canInteract && <MapDetailSheet
        title={selectedLocation?.name ?? 'Estación'} subtitle={`${selectedLocation?.subtitle ?? ''} · ${connectionLabel(arrivals.connection)}`}
        expanded={mapState.sheet === 'expanded'} onExpand={expanded => dispatch({ type: 'sheet', value: expanded ? 'expanded' : 'collapsed' })}
        onBack={() => dispatch({ type: 'back' })} onClear={() => dispatch({ type: 'clear' })}>
        <StationDetail response={arrivals.data} store={arrivals.store} connection={arrivals.connection} error={arrivals.error} retry={arrivals.retry} onSelect={selectRoute} />
      </MapDetailSheet>}
      {routeId && canInteract && <MapDetailSheet title={route ? `${route.code} · ${route.name}` : 'Ruta'}
        subtitle={variant ? `Hacia ${variant.destinationName}` : 'Cargando recorrido'} expanded={mapState.sheet === 'expanded'}
        onExpand={expanded => dispatch({ type: 'sheet', value: expanded ? 'expanded' : 'collapsed' })}
        onBack={() => dispatch({ type: 'back' })} onClear={() => dispatch({ type: 'clear' })}>
        <RouteDetail response={routeLive.data} variantId={variant?.id} selectedBusId={selection.type === 'bus' ? selection.busId : undefined}
          store={routeLive.store} connection={routeLive.connection} error={routeLive.error} retry={routeLive.retry} onSelect={selectRoute} />
      </MapDetailSheet>}
    </View></LocationGate>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#e5eefc',
  },
  searchButton: {
    position: 'absolute',
    top: 52,
    right: 18,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#1f6feb',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  locationButton: {
    position: 'absolute',
    right: 18,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#0f766e',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.26)',
  },
  modalContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 24,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe2ea',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: '#111827',
    marginBottom: 12,
  },
  listContent: {
    paddingBottom: 10,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#edf2f7',
  },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#1f6feb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTextWrap: {
    marginLeft: 12,
    flex: 1,
  },
  resultName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '700',
  },
  resultSubtitle: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 2,
  },
  emptyState: {
    textAlign: 'center',
    color: '#64748b',
    paddingVertical: 20,
  },
});
