import { useViewTiming } from '../hooks/useViewTiming';
import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
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

import {
  getVariantCoordinates,
  type MockLocation,
} from '../data/mockData';

type Point = MockLocation & { isCurrent?: boolean };

const isTransitPoint = (point: Point) => point.type === 'stop' || point.type === 'station';

const getNearestStop = (point: Point, stops: MockLocation[]) =>
  stops.filter(stop => stop.type !== 'poi').reduce<MockLocation | undefined>((nearest, stop) => {
    if (!nearest) return stop;
    const nearestDistance =
      Math.abs(nearest.latitude - point.latitude) + Math.abs(nearest.longitude - point.longitude);
    const stopDistance =
      Math.abs(stop.latitude - point.latitude) + Math.abs(stop.longitude - point.longitude);

    return stopDistance < nearestDistance ? stop : nearest;
  }, undefined);

export function TripScreen() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const onViewLayout = useViewTiming('Viaje', focused);
  const location = useLocationAccess();
  const catalog = useRemoteData(getCatalog);
  const mockStops = catalog.data?.stops ?? [];
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

  useEffect(() => { if (!canInteract) setPickerVisible(false); }, [canInteract]);

  const filteredLocations = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) {
      return mockStops;
    }

    return mockStops.filter(
      (item) =>
        item.name.toLowerCase().includes(query) || item.subtitle.toLowerCase().includes(query),
    );
  }, [searchText, catalog.data]);

  const routeLines = useMemo(() => {
    if (!origin || !destination) {
      return [];
    }

    const originStation = isTransitPoint(origin) ? origin : getNearestStop(origin, mockStops);
    const destinationStation = isTransitPoint(destination) ? destination : getNearestStop(destination, mockStops);

    if (!originStation || !destinationStation) return [];
    return routeOptions.flatMap((route) => {
      const variant = USE_DUMMY_DATA ? route.variants[0] : route.variants.find(item => {
        const from = item.stopSequence.indexOf(originStation.id);
        return from >= 0 && item.stopSequence.indexOf(destinationStation.id, from + 1) > from;
      });
      if (!variant) return [];
      const sequenceCoordinates = getVariantCoordinates(variant, mockStops);

      return {
        ...route,
        originStation,
        destinationStation,
        transitCoordinates: !USE_DUMMY_DATA ? sequenceCoordinates : variant.geometry.coordinates.length
          ? [originStation, ...variant.geometry.coordinates, destinationStation]
          : [originStation, ...sequenceCoordinates, destinationStation],
        walkingSegments: [
          ...(isTransitPoint(origin) ? [] : [[origin, originStation]]),
          ...(isTransitPoint(destination) ? [] : [[destinationStation, destination]]),
        ],
      };
    });
  }, [destination, origin, catalog.data]);

  const visibleRoutes = selectedRouteId
    ? routeLines.filter((route) => route.id === selectedRouteId)
    : routeLines;

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
    selectPoint({
      id: `${selectionMode}-map-point`,
      name: selectionMode === 'origin' ? 'Origen seleccionado' : 'Destino seleccionado',
      subtitle: 'Punto elegido en el mapa',
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      type: 'poi',
    });
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
        {routeLines[0]?.originStation && !isTransitPoint(origin as Point) && (
          <Marker
            coordinate={routeLines[0].originStation}
            title="Estación de conexión de origen"
            description={routeLines[0].originStation.name}
            pinColor="#1f6feb"
          />
        )}
        {routeLines[0]?.destinationStation && !isTransitPoint(destination as Point) && (
          <Marker
            coordinate={routeLines[0].destinationStation}
            title="Estación de conexión de destino"
            description={routeLines[0].destinationStation.name}
            pinColor="#dc2626"
          />
        )}
        {visibleRoutes.map((route) => (
          <React.Fragment key={route.id}>
            <Polyline
              coordinates={route.transitCoordinates}
              strokeColor={route.color}
              strokeWidth={route.id === 'fastest' ? 5 : 3}
              lineDashPattern={route.id === 'fastest' ? undefined : [8, 6]}
            />
            {route.walkingSegments.map((segment, segmentIndex) => (
              <Polyline
                key={`${route.id}-walk-${segmentIndex}`}
                coordinates={segment}
                strokeColor="#475569"
                strokeWidth={3}
                lineDashPattern={[4, 6]}
              />
            ))}
          </React.Fragment>
        ))}
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
        {!USE_DUMMY_DATA && origin && destination && routeLines.length === 0 && <Text style={styles.mapHint}>No encontramos una ruta directa entre estas paradas. La búsqueda con transbordos aún no está disponible.</Text>}
        <Text style={styles.mapHint}>
          <Ionicons name="hand-left-outline" size={13} color="#64748b" />{' '}
          También puedes tocar el mapa para marcar el {selectionMode === 'origin' ? 'origen' : 'destino'}.
        </Text>
      </View>

      {routeLines.length > 0 && !routesCollapsed && (
        <View style={[styles.routesPanel, { bottom: 92 + insets.bottom }]}>
          <View style={styles.routesHeader}>
            <View>
              <Text style={styles.routesTitle}>Rutas disponibles</Text>
              <Text style={styles.routesSubtitle}>
                {routeLines.some((route) => route.walkingSegments.length > 0)
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
                style={[styles.routeCard, selectedRouteId === item.id && styles.routeCardSelected]}
                onPress={() => setSelectedRouteId(item.id)}
                accessibilityLabel={`Mostrar ${item.name} en el mapa`}
                accessibilityRole="button"
              >
                <View style={[styles.routeStripe, { backgroundColor: item.color }]} />
                <View style={styles.routeCardContent}>
                  <View style={styles.routeCardTop}>
                    <Text style={styles.routeName}>{item.name}</Text>
                    <Ionicons
                      name={selectedRouteId === item.id ? 'checkmark-circle' : 'arrow-forward-circle'}
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
        <View style={[styles.modalContainer, { paddingBottom: 24 + insets.bottom }]}>
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
