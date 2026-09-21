import { useViewTiming } from '../hooks/useViewTiming';
import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
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
import { useIsFocused } from '@react-navigation/native';
import { useLocationAccess } from '../context/LocationAccess';
import { LocationGate } from '../components/LocationGate';
import { DataStatus } from '../components/DataStatus';
import { useRemoteData } from '../hooks/useRemoteData';
import { getCatalog, USE_DUMMY_DATA } from '../services/transit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWalkingRoute } from '../hooks/useWalkingRoute';
import type { WalkingRoute } from '../services/walkingDirections';

import {
  findDirectVariant,
  getNearestStops,
  getVariantCoordinates,
  hasDirectRoute,
  sliceRouteSegment,
  type Location,
} from '../data/catalog';

type Point = Location & { isCurrent?: boolean };

const isTransitPoint = (point: Point) => point.type === 'stop' || point.type === 'station';

const formatWalkingSummary = (route: WalkingRoute) => {
  const meters = Math.round(route.distanceMeters);
  const distance = meters < 1000 ? `${meters} m` : `${(meters / 1000).toFixed(1)} km`;
  const minutes = Math.max(1, Math.ceil(route.durationSeconds / 60));
  return `${distance} · ${minutes} min`;
};

const hexToRgba = (hex: string, alpha: number) => {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export function TripScreen() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const onViewLayout = useViewTiming('Viaje', focused);
  const location = useLocationAccess();
  const catalog = useRemoteData(getCatalog);
  const stopsCatalog = catalog.data?.stops ?? [];
  const routeOptions = catalog.data?.routes ?? [];
  const canInteract = location.state === 'ready' && focused;
  useEffect(() => { if (focused) void location.refresh(); }, [focused, location.refresh]);
  const [origin, setOrigin] = useState<Point | null>(null);
  const [destination, setDestination] = useState<Point | null>(null);
  const [selectionMode, setSelectionMode] = useState<'origin' | 'destination'>('origin');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [routesCollapsed, setRoutesCollapsed] = useState(false);
  const [mapPickerTarget, setMapPickerTarget] = useState<'origin' | 'destination' | null>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => { if (!canInteract) { setPickerVisible(false); setMapPickerTarget(null); } }, [canInteract]);

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

  const connectionStations = useMemo(() => {
    if (!origin || !destination) return null;
    const originCandidates = isTransitPoint(origin) ? [origin] : getNearestStops(origin, stopsCatalog);
    const destinationCandidates = isTransitPoint(destination) ? [destination] : getNearestStops(destination, stopsCatalog);
    if (!originCandidates.length || !destinationCandidates.length) return null;
    if (!USE_DUMMY_DATA) {
      for (const originStation of originCandidates) {
        for (const destinationStation of destinationCandidates) {
          if (hasDirectRoute(routeOptions, originStation.id, destinationStation.id)) {
            return { originStation, destinationStation };
          }
        }
      }
    }
    // No candidate pair connects directly (or dummy mode, which doesn't check reachability):
    // fall back to the closest pair so markers/labels still show something sensible.
    return { originStation: originCandidates[0], destinationStation: destinationCandidates[0] };
  }, [origin, destination, catalog.data]);

  const routeLines = useMemo(() => {
    if (!origin || !destination || !connectionStations) {
      return [];
    }

    const { originStation, destinationStation } = connectionStations;
    return routeOptions.flatMap((route) => {
      const variant = USE_DUMMY_DATA ? route.variants[0] : findDirectVariant(route, originStation.id, destinationStation.id);
      if (!variant) return [];
      const sequenceCoordinates = getVariantCoordinates(variant, stopsCatalog);
      const from = variant.stopSequence.indexOf(originStation.id);
      const to = variant.stopSequence.indexOf(destinationStation.id, from + 1);
      const stopSegment = from >= 0 && to > from ? variant.stopSequence.slice(from, to + 1) : variant.stopSequence;
      const stopNames = stopSegment.map(id => stopsCatalog.find(stop => stop.id === id)?.name ?? 'Estación sin información');
      const stopCoordinates = variant.stopSequence.map(id => stopsCatalog.find(stop => stop.id === id));

      return {
        ...route,
        stopNames,
        // Only the boarding→alighting stretch the passenger actually rides, never the full terminal-to-terminal shape.
        transitCoordinates: from >= 0 && to > from
          ? sliceRouteSegment(sequenceCoordinates, stopCoordinates, from, to)
          : [originStation, destinationStation],
      };
    });
  }, [destination, origin, catalog.data, connectionStations]);

  const visibleRoutes = selectedRouteId
    ? routeLines.filter((route) => route.id === selectedRouteId)
    : routeLines;

  const primaryRouteId = selectedRouteId ?? routeLines[0]?.id ?? null;
  const primaryRoute = routeLines.find((route) => route.id === primaryRouteId) ?? null;

  const originWalk = useWalkingRoute(
    origin && connectionStations && !isTransitPoint(origin) ? origin : null,
    connectionStations?.originStation ?? null,
  );
  const destinationWalk = useWalkingRoute(
    connectionStations?.destinationStation ?? null,
    destination && connectionStations && !isTransitPoint(destination) ? destination : null,
  );

  const selectPoint = (point: Point, mode = selectionMode) => {
    if (!canInteract) return;
    setSelectedRouteId(null);
    setRoutesCollapsed(false);

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
    setRoutesCollapsed(false);
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
    setRoutesCollapsed(false);
    setSearchText('');
    setPickerVisible(false);
    setMapPickerTarget(null);
  };

  if (!catalog.data) return <LocationGate><View onLayout={onViewLayout} style={[styles.container, { justifyContent: 'center' }]}><DataStatus error={catalog.error} retry={catalog.reload} /></View></LocationGate>;
  const defaultRegion = catalog.data.city.defaultRegion;
  return (
    <LocationGate><View onLayout={onViewLayout} style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={defaultRegion}
        scrollEnabled={canInteract}
        zoomEnabled={canInteract}
        rotateEnabled={canInteract}
        pitchEnabled={canInteract}
        showsUserLocation={canInteract}
        showsCompass
        onPress={(event) => selectMapPoint(event.nativeEvent.coordinate)}
      >
        {origin && (
          <Marker
            coordinate={origin}
            title="Origen"
            description={origin.name}
            pinColor="#1f6feb"
          />
        )}
        {destination && (
          <Marker
            coordinate={destination}
            title="Destino"
            description={destination.name}
            pinColor="#dc2626"
          />
        )}
        {connectionStations?.originStation && origin && !isTransitPoint(origin) && (
          <Marker
            coordinate={connectionStations.originStation}
            title="Estación de conexión de origen"
            description={connectionStations.originStation.name}
            pinColor="#475569"
          />
        )}
        {connectionStations?.destinationStation && destination && !isTransitPoint(destination) && (
          <Marker
            coordinate={connectionStations.destinationStation}
            title="Estación de conexión de destino"
            description={connectionStations.destinationStation.name}
            pinColor="#475569"
          />
        )}
        {visibleRoutes.map((route) => {
          const isPrimary = route.id === primaryRouteId;
          return (
            <Polyline
              key={route.id}
              coordinates={route.transitCoordinates}
              strokeColor={isPrimary ? route.color : hexToRgba(route.color, 0.45)}
              strokeWidth={isPrimary ? 6 : 3}
              zIndex={isPrimary ? 2 : 1}
            />
          );
        })}
        {originWalk.route && (
          <Polyline
            key="walk-origin"
            coordinates={originWalk.route.coordinates}
            strokeColor="#475569"
            strokeWidth={3}
            lineDashPattern={[4, 6]}
          />
        )}
        {destinationWalk.route && (
          <Polyline
            key="walk-destination"
            coordinates={destinationWalk.route.coordinates}
            strokeColor="#475569"
            strokeWidth={3}
            lineDashPattern={[4, 6]}
          />
        )}
      </MapView>

      <View style={[styles.topPanel, { top: 16 + insets.top }]}>
        <Text style={styles.eyebrow}>PLANEA TU VIAJE</Text>
        <View style={styles.titleRow}>
          <Text style={styles.title}>¿A dónde quieres ir?</Text>
          {(origin || destination || selectedRouteId || searchText) && (
            <Pressable
              style={styles.clearTripButton}
              onPress={clearTrip}
              accessibilityLabel="Limpiar búsqueda"
            >
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
        {(originWalk.route || destinationWalk.route) && (
          <Text style={styles.mapHint}>
            {originWalk.route ? `Caminata al origen: ${formatWalkingSummary(originWalk.route)}` : ''}
            {originWalk.route && destinationWalk.route ? ' · ' : ''}
            {destinationWalk.route ? `Caminata al destino: ${formatWalkingSummary(destinationWalk.route)}` : ''}
          </Text>
        )}
        {!USE_DUMMY_DATA && (originWalk.error || destinationWalk.error) && (
          <Text style={styles.mapHint}>No pudimos calcular la ruta a pie exacta; se muestra una línea aproximada.</Text>
        )}
        {mapPickerTarget && (
          <Pressable style={styles.mapPickerHint} onPress={() => setMapPickerTarget(null)}>
            <Ionicons name="hand-left-outline" size={14} color="#1f6feb" />
            <Text style={styles.mapPickerHintText}>
              Toca el mapa para marcar tu {mapPickerTarget === 'origin' ? 'origen' : 'destino'}.
            </Text>
            <Ionicons name="close-circle" size={16} color="#94a3b8" />
          </Pressable>
        )}
      </View>

      {!USE_DUMMY_DATA && origin && destination && routeLines.length === 0 && (
        <View style={[styles.routesPanel, { bottom: 92 + insets.bottom }]}>
          <View style={styles.noRouteRow}>
            <Ionicons name="alert-circle-outline" size={22} color="#dc2626" />
            <Text style={styles.noRouteText}>No encontramos una ruta directa entre estas paradas. La búsqueda con transbordos aún no está disponible.</Text>
          </View>
        </View>
      )}

      {routeLines.length > 0 && !routesCollapsed && (
        <View style={[styles.routesPanel, { bottom: 92 + insets.bottom }]}>
          <View style={styles.routesHeader}>
            <View>
              <Text style={styles.routesTitle}>Rutas disponibles</Text>
              <Text style={styles.routesSubtitle}>
                {originWalk.route || destinationWalk.route
                  ? 'Línea continua: bus · punteada: caminata'
                  : USE_DUMMY_DATA ? 'Opciones simuladas para tu recorrido' : 'Rutas directas que conectan tus paradas'}
              </Text>
            </View>
            <View style={styles.routeCount}>
              <Text style={styles.routeCountText}>{routeLines.length}</Text>
            </View>
            <Pressable
              style={styles.collapseButton}
              onPress={() => setRoutesCollapsed(true)}
              accessibilityLabel="Ocultar rutas posibles"
            >
              <Ionicons name="chevron-down" size={19} color="#475569" />
            </Pressable>
          </View>

          <FlatList
            data={routeLines}
            keyExtractor={(item) => item.id}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.routeList}
            renderItem={({ item }) => (
              <Pressable
                style={[styles.routeCard, primaryRouteId === item.id && styles.routeCardSelected]}
                onPress={() => setSelectedRouteId(item.id)}
                accessibilityLabel={`Mostrar ${item.name} en el mapa`}
                accessibilityRole="button"
              >
                <View style={[styles.routeStripe, { backgroundColor: item.color }]} />
                <View style={styles.routeCardContent}>
                  <View style={styles.routeCardTop}>
                    <Text style={styles.routeName}>{item.name}</Text>
                    <Ionicons
                      name={primaryRouteId === item.id ? 'checkmark-circle' : 'arrow-forward-circle'}
                      size={22}
                      color={item.color}
                    />
                  </View>
                  <Text style={styles.routeDescription}>{item.description}</Text>
                  <View style={styles.routeMetaRow}>
                    <Text style={styles.routeDuration}>{item.duration}</Text>
                    <Text style={styles.routeMeta}>{item.transfers}</Text>
                    <Text style={styles.routeMeta}>{item.stops}</Text>
                  </View>
                </View>
              </Pressable>
            )}
          />

          {primaryRoute && (
            <View style={styles.stopListContainer}>
              <Text style={styles.stopListTitle}>Estaciones del recorrido</Text>
              <FlatList
                data={primaryRoute.stopNames}
                keyExtractor={(name, index) => `${name}-${index}`}
                style={styles.stopListScroll}
                renderItem={({ item: name, index }) => (
                  <View style={styles.stopRow}>
                    <Text style={[styles.stopDot, { color: primaryRoute.color }]}>●</Text>
                    <Text style={styles.stopName} numberOfLines={1}>{index + 1}. {name}</Text>
                  </View>
                )}
              />
            </View>
          )}
        </View>
      )}

      {routeLines.length > 0 && routesCollapsed && (
        <Pressable
          style={[styles.collapsedRoutesTab, { bottom: 98 + insets.bottom }]}
          onPress={() => setRoutesCollapsed(false)}
          accessibilityLabel="Mostrar rutas posibles"
        >
          <Ionicons name="map-outline" size={18} color="#1f6feb" />
          <Text style={styles.collapsedRoutesText}>Mostrar rutas posibles</Text>
          <View style={styles.collapsedRouteCount}>
            <Text style={styles.collapsedRouteCountText}>{routeLines.length}</Text>
          </View>
          <Ionicons name="chevron-up" size={18} color="#64748b" />
        </Pressable>
      )}

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
  container: {
    flex: 1,
    backgroundColor: '#dbeafe',
  },
  topPanel: {
    position: 'absolute',
    left: 16,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
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
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
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
  },
  connector: {
    position: 'absolute',
    left: 16,
    top: 28,
    bottom: 28,
    width: 1,
    backgroundColor: '#cbd5e1',
  },
  swapButton: {
    position: 'absolute',
    right: 12,
    top: 48,
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
  mapPickerHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#eff6ff',
  },
  mapPickerHintText: {
    flex: 1,
    color: '#1f6feb',
    fontSize: 12,
    fontWeight: '700',
  },
  routesPanel: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(248,250,252,0.97)',
    paddingTop: 14,
    paddingBottom: 12,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 8,
  },
  noRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 18,
  },
  noRouteText: {
    flex: 1,
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
  },
  routesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    marginBottom: 10,
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
  routeCount: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeCountText: {
    color: '#1f6feb',
    fontSize: 14,
    fontWeight: '800',
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
  routeList: {
    paddingHorizontal: 18,
    gap: 12,
  },
  routeCard: {
    width: 264,
    minHeight: 126,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  routeCardSelected: {
    borderColor: '#1f6feb',
    borderWidth: 2,
  },
  collapsedRoutesTab: {
    position: 'absolute',
    left: 16,
    right: 16,
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.98)',
    borderRadius: 16,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  collapsedRoutesText: {
    flex: 1,
    color: '#334155',
    fontSize: 13,
    fontWeight: '800',
    marginLeft: 9,
  },
  collapsedRouteCount: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  collapsedRouteCountText: {
    color: '#1f6feb',
    fontSize: 12,
    fontWeight: '800',
  },
  routeStripe: {
    width: 5,
  },
  routeCardContent: {
    flex: 1,
    padding: 12,
  },
  routeCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  routeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 11,
  },
  routeDuration: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  routeMeta: {
    color: '#64748b',
    fontSize: 10,
  },
  stopListContainer: {
    marginTop: 14,
    paddingHorizontal: 18,
  },
  stopListTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  stopListScroll: {
    maxHeight: 150,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
  },
  stopDot: {
    fontSize: 14,
  },
  stopName: {
    flex: 1,
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
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
