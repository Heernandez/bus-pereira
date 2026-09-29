import type { RefObject } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { tripStyles, type PointMode, type TripPoint } from './shared';

// Full-screen map where the user taps to set the origin or destination.
export function MapPointPicker({ mapRef, target, origin, destination, initialRegion, showsUserLocation, topInset, onReady, onPick, onCancel }: {
  mapRef: RefObject<MapView | null>; target: PointMode; origin: TripPoint | null; destination: TripPoint | null;
  initialRegion: Region; showsUserLocation: boolean; topInset: number;
  onReady: () => void; onPick: (coordinate: { latitude: number; longitude: number }) => void; onCancel: () => void;
}) {
  return (
    <>
      <MapView
        ref={mapRef}
        onMapReady={onReady}
        provider={PROVIDER_GOOGLE}
        style={StyleSheet.absoluteFill}
        initialRegion={initialRegion}
        showsUserLocation={showsUserLocation}
        showsCompass
        userInterfaceStyle="light"
        onPress={(event) => onPick(event.nativeEvent.coordinate)}
      >
        {target === 'destination' && origin && <Marker coordinate={origin} title="Origen" pinColor="#1f6feb" />}
        {target === 'origin' && destination && <Marker coordinate={destination} title="Destino" pinColor="#dc2626" />}
      </MapView>
      <Pressable style={[tripStyles.mapBackButton, { top: 16 + topInset }]} onPress={onCancel}
        accessibilityRole="button" accessibilityLabel="Cancelar selección en el mapa">
        <Ionicons name="close" size={22} color="#111827" />
      </Pressable>
      <View style={[styles.banner, { top: 16 + topInset }]}>
        <Ionicons name="hand-left-outline" size={16} color="#1f6feb" />
        <Text style={styles.bannerText}>Toca el mapa para marcar tu {target === 'origin' ? 'origen' : 'destino'}.</Text>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
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
  bannerText: {
    flex: 1,
    color: '#1f6feb',
    fontSize: 12,
    fontWeight: '700',
  },
});
