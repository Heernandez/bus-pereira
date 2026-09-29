import { useEffect, useMemo, useState } from 'react';
import { FlatList, Keyboard, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Location } from '../../data/catalog';
import { tripStyles, type PointMode } from './shared';

function useKeyboardHeight() {
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSubscription = Keyboard.addListener(showEvent, event => setHeight(event.endCoordinates.height));
    const hideSubscription = Keyboard.addListener(hideEvent, () => setHeight(0));
    return () => { showSubscription.remove(); hideSubscription.remove(); };
  }, []);
  return height;
}

// Search sheet for picking a catalog stop, with a shortcut to pick a point on the map.
export function LocationPickerModal({ visible, mode, locations, searchText, onChangeSearch, onSelect, onPickOnMap, onClose, bottomInset }: {
  visible: boolean; mode: PointMode; locations: Location[];
  searchText: string; onChangeSearch: (text: string) => void;
  onSelect: (location: Location) => void; onPickOnMap: () => void; onClose: () => void; bottomInset: number;
}) {
  const keyboardHeight = useKeyboardHeight();
  const filteredLocations = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return locations;
    return locations.filter(item => item.name.toLowerCase().includes(query) || item.subtitle.toLowerCase().includes(query));
  }, [searchText, locations]);

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable style={tripStyles.modalOverlay} onPress={onClose} />
      <View style={[tripStyles.modalContainer, { bottom: keyboardHeight, paddingBottom: keyboardHeight > 0 ? 12 : 24 + bottomInset }]}>
        <View style={tripStyles.modalHeader}>
          <View>
            <Text style={styles.modalEyebrow}>
              {mode === 'origin' ? 'PUNTO DE PARTIDA' : 'PUNTO DE LLEGADA'}
            </Text>
            <Text style={tripStyles.modalTitle}>Busca una ubicación</Text>
          </View>
          <Pressable onPress={onClose} accessibilityLabel="Cerrar búsqueda">
            <Ionicons name="close" size={26} color="#111827" />
          </Pressable>
        </View>

        <View style={styles.inputWrapper}>
          <Ionicons name="search" size={19} color="#64748b" />
          <TextInput
            value={searchText}
            onChangeText={onChangeSearch}
            placeholder="Escribe una dirección o lugar"
            style={styles.input}
            placeholderTextColor="#9ca3af"
            autoFocus
          />
          {searchText.length > 0 && (
            <Pressable
              onPress={() => onChangeSearch('')}
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
            <Pressable style={tripStyles.mapPickerItem} onPress={onPickOnMap}>
              <View style={styles.suggestionIcon}>
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
            <Pressable style={styles.suggestionItem} onPress={() => onSelect(item)}>
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
  );
}

const styles = StyleSheet.create({
  modalEyebrow: {
    color: '#1f6feb',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
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
