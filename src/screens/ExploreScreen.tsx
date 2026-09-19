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
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  defaultRegion,
  getVariantCoordinates,
  mockStops,
  routeOptions,
  type MockLocation,
  type RouteOption,
  type RouteVariant,
} from '../data/mockData';

type UpcomingRoute = {
  route: RouteOption;
  variant: RouteVariant;
  arrivalMinutes: number;
};

export function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const [searchVisible, setSearchVisible] = useState(false);
  const [stationModalVisible, setStationModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [selectedLocation, setSelectedLocation] = useState<MockLocation>(mockStops[0]);
  const [selectedRouteVariantId, setSelectedRouteVariantId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);

  useEffect(() => {
    let isMounted = true;

    const requestLocation = async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();

      if (status !== 'granted') {
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (isMounted) {
        setUserLocation({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        });
      }
    };

    requestLocation();

    return () => {
      isMounted = false;
    };
  }, []);

  const visibleRegion = useMemo(() => {
    if (userLocation) {
      return {
        ...defaultRegion,
        latitude: userLocation.latitude,
        longitude: userLocation.longitude,
      };
    }

    return {
      ...defaultRegion,
      latitude: selectedLocation.latitude,
      longitude: selectedLocation.longitude,
    };
  }, [selectedLocation, userLocation]);

  const filteredStops = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    if (!query) {
      return mockStops;
    }

    return mockStops.filter((item) =>
      item.name.toLowerCase().includes(query) || item.subtitle.toLowerCase().includes(query)
    );
  }, [searchText]);

  const upcomingRoutes = useMemo<UpcomingRoute[]>(
    () =>
      routeOptions.flatMap((route, routeIndex) =>
        route.variants
          .filter((variant) => variant.stopSequence.includes(selectedLocation.id))
          .map((variant, variantIndex) => ({
            route,
            variant,
            arrivalMinutes: 3 + routeIndex * 4 + variantIndex * 2,
          })),
      ),
    [selectedLocation.id],
  );

  const selectedRoute = useMemo(
    () => upcomingRoutes.find((item) => item.variant.id === selectedRouteVariantId),
    [selectedRouteVariantId, upcomingRoutes],
  );

  const selectedRouteCoordinates = useMemo(() => {
    if (!selectedRoute) {
      return [];
    }

    if (selectedRoute.variant.geometry.coordinates.length > 0) {
      return selectedRoute.variant.geometry.coordinates;
    }

    return getVariantCoordinates(selectedRoute.variant);
  }, [selectedRoute]);

  const openStationRoutes = (stop: MockLocation) => {
    setSelectedLocation(stop);
    setSelectedRouteVariantId(null);
    setSearchVisible(false);
    setSearchText('');
    setStationModalVisible(true);
  };

  return (
    <View style={styles.container}>
      <MapView
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={defaultRegion}
        region={visibleRegion}
        showsTraffic
        showsCompass
        showsUserLocation={Boolean(userLocation)}
      >
        {mockStops.map((stop) => (
          <Marker
            key={stop.id}
            coordinate={{ latitude: stop.latitude, longitude: stop.longitude }}
            title={stop.name}
            description={stop.subtitle}
            pinColor={stop.id === selectedLocation.id ? '#1f6feb' : '#f59e0b'}
            onPress={() => openStationRoutes(stop)}
          />
        ))}

        {selectedRoute && selectedRouteCoordinates.length > 1 && (
          <Polyline
            coordinates={selectedRouteCoordinates}
            strokeColor={selectedRoute.route.color}
            strokeWidth={5}
          />
        )}

        {userLocation && (
          <Marker
            coordinate={{
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
            }}
            title="Tu ubicación"
            pinColor="#22c55e"
          />
        )}
      </MapView>

      <Pressable
        style={[styles.searchButton, { top: 52 + insets.top }]}
        onPress={() => setSearchVisible(true)}
        accessibilityLabel="Buscar ubicaciones"
      >
        <Ionicons name="search" size={22} color="#fff" />
      </Pressable>

      <Pressable
        style={[styles.locationButton, { top: 52 + insets.top }]}
        onPress={() => {
          if (userLocation) {
            setSelectedLocation({
              id: 'user-location',
              name: 'Tu ubicación',
              subtitle: 'Ubicación actual',
              latitude: userLocation.latitude,
              longitude: userLocation.longitude,
              type: 'Punto de interés',
            });
          }
        }}
        accessibilityLabel="Centrar en mi ubicación"
      >
        <Ionicons name="locate" size={20} color="#fff" />
      </Pressable>

      <Modal transparent animationType="slide" visible={searchVisible}>
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

      <Modal transparent animationType="slide" visible={stationModalVisible}>
        <View style={styles.stationModalBackdrop}>
          <View style={[styles.stationModalContainer, { paddingBottom: 24 + insets.bottom }]}>
            <View style={styles.stationModalHandle} />
            <View style={styles.stationModalHeader}>
              <View style={styles.stationModalTitleWrap}>
                <Text style={styles.stationModalEyebrow}>PRÓXIMOS BUSES</Text>
                <Text style={styles.stationModalTitle}>{selectedLocation.name}</Text>
                <Text style={styles.stationModalSubtitle}>{selectedLocation.subtitle}</Text>
              </View>
              <Pressable
                onPress={() => setStationModalVisible(false)}
                accessibilityLabel="Cerrar rutas de la estación"
              >
                <Ionicons name="close" size={26} color="#111827" />
              </Pressable>
            </View>

            <Text style={styles.stationModalDescription}>
              Buses estimados según el GPS simulado de la red.
            </Text>

            <FlatList
              data={upcomingRoutes}
              keyExtractor={(item) => item.variant.id}
              contentContainerStyle={styles.upcomingList}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.upcomingRoute}
                  onPress={() => {
                    setSelectedRouteVariantId(item.variant.id);
                    setStationModalVisible(false);
                  }}
                >
                  <View style={[styles.routeColorBar, { backgroundColor: item.route.color }]} />
                  <View style={styles.upcomingRouteMain}>
                    <View style={styles.upcomingRouteTop}>
                      <View style={styles.busNumberBadge}>
                        <Text style={styles.busNumber}>{item.route.code}</Text>
                      </View>
                      <View style={styles.upcomingRouteNameWrap}>
                        <Text style={styles.upcomingRouteName}>{item.route.name}</Text>
                        <Text style={styles.upcomingRouteDirection}>
                          Hacia {item.variant.destinationName}
                        </Text>
                      </View>
                      <View style={styles.arrivalWrap}>
                        <Text style={styles.arrivalTime}>{item.arrivalMinutes} min</Text>
                        <Text style={styles.arrivalLabel}>estimado</Text>
                      </View>
                    </View>
                    <View style={styles.gpsStatus}>
                      <Ionicons name="radio" size={14} color="#0f766e" />
                      <Text style={styles.gpsStatusText}>GPS activo · selecciona para ver la ruta</Text>
                    </View>
                  </View>
                </Pressable>
              )}
              ListEmptyComponent={
                <View style={styles.noRoutesState}>
                  <Ionicons name="bus-outline" size={34} color="#94a3b8" />
                  <Text style={styles.noRoutesTitle}>No hay rutas registradas</Text>
                  <Text style={styles.noRoutesText}>
                    Todavía no tenemos buses asociados a esta estación.
                  </Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </View>
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
    top: 52,
    right: 86,
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
  stationModalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  stationModalContainer: {
    minHeight: '86%',
    backgroundColor: '#f8fafc',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 18,
  },
  stationModalHandle: {
    alignSelf: 'center',
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
    marginBottom: 22,
  },
  stationModalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  stationModalTitleWrap: {
    flex: 1,
    paddingRight: 16,
  },
  stationModalEyebrow: {
    color: '#1f6feb',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  stationModalTitle: {
    color: '#111827',
    fontSize: 25,
    fontWeight: '800',
    marginTop: 4,
  },
  stationModalSubtitle: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 4,
  },
  stationModalDescription: {
    color: '#475569',
    fontSize: 13,
    lineHeight: 19,
    marginTop: 22,
    marginBottom: 14,
  },
  upcomingList: {
    paddingBottom: 16,
  },
  upcomingRoute: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    overflow: 'hidden',
  },
  routeColorBar: {
    width: 6,
  },
  upcomingRouteMain: {
    flex: 1,
    padding: 14,
  },
  upcomingRouteTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  busNumberBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
  },
  busNumber: {
    color: '#1f6feb',
    fontSize: 18,
    fontWeight: '800',
  },
  upcomingRouteNameWrap: {
    flex: 1,
    marginLeft: 12,
  },
  upcomingRouteName: {
    color: '#111827',
    fontSize: 15,
    fontWeight: '800',
  },
  upcomingRouteDirection: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 3,
  },
  arrivalWrap: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  arrivalTime: {
    color: '#0f766e',
    fontSize: 16,
    fontWeight: '800',
  },
  arrivalLabel: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 2,
  },
  gpsStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  gpsStatusText: {
    color: '#0f766e',
    fontSize: 11,
    marginLeft: 6,
  },
  noRoutesState: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
  },
  noRoutesTitle: {
    color: '#334155',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 12,
  },
  noRoutesText: {
    color: '#64748b',
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
});
