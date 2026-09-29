import { StyleSheet } from 'react-native';
import type { Location } from '../../data/catalog';
import type { JourneyPreference } from '../../types/journey';

export type TripPoint = Location & { isCurrent?: boolean };
export type PointMode = 'origin' | 'destination';
export type TripOptions = { preference: JourneyPreference; maxWalkingDistanceMeters: number; maxTransfers: number };

export const preferenceLabels: Record<JourneyPreference, string> = {
  fastest: 'Más rápido', least_walking: 'Menos caminata', fewest_transfers: 'Menos transbordos',
};

export const transfersLabel = (transfers: number) =>
  transfers === 0 ? 'Sin transbordos' : `${transfers} transbordo${transfers > 1 ? 's' : ''}`;

// Styles used by more than one piece of the Viaje screen.
export const tripStyles = StyleSheet.create({
  plannerOptionsText: { color: '#1f6feb', fontSize: 12, fontWeight: '600', flexShrink: 1 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  optionChip: { padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#dbe2ea' },
  stopListTitle: {
    color: '#111827',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  routesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  mapBackButton: {
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
  modalTitle: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
    marginTop: 3,
  },
});
