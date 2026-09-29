import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DataStatus } from '../DataStatus';
import { formatClock, formatDistance, itineraryDuration, itineraryTitle, journeySchedule, legChips, noJourneyMessage } from '../../services/journeyPresentation';
import { LegSummary } from './LegSummary';
import type { useJourneyPlan } from '../../hooks/useJourneyPlan';
import type { JourneyPreference } from '../../types/journey';
import { preferenceLabels, tripStyles, type PointMode, type TripPoint } from './shared';

const fields = {
  origin: { label: 'Origen', placeholder: 'Selecciona tu punto de partida', icon: 'radio-button-on', iconSize: 14, color: '#1f6feb', locateLabel: 'Usar mi ubicación actual como origen' },
  destination: { label: 'Destino', placeholder: '¿A dónde vas?', icon: 'location', iconSize: 15, color: '#dc2626', locateLabel: 'Usar mi ubicación actual como destino' },
} as const;

function PointField({ mode, point, onOpen, onUseCurrentLocation }: {
  mode: PointMode; point: TripPoint | null; onOpen: () => void; onUseCurrentLocation: () => void;
}) {
  const field = fields[mode];
  return (
    <Pressable style={styles.locationField} onPress={onOpen}>
      <View style={[styles.pointIcon, { backgroundColor: field.color }]}>
        <Ionicons name={field.icon} size={field.iconSize} color="#fff" />
      </View>
      <View style={styles.fieldText}>
        <Text style={styles.fieldLabel}>{field.label}</Text>
        <Text style={styles.fieldValue} numberOfLines={1}>{point?.name ?? field.placeholder}</Text>
      </View>
      <Pressable
        style={styles.currentButton}
        onPress={(event) => {
          event.stopPropagation();
          onUseCurrentLocation();
        }}
        accessibilityLabel={field.locateLabel}
      >
        <Ionicons name="locate-outline" size={20} color={field.color} />
      </Pressable>
    </Pressable>
  );
}

// `plan` is null until the user runs a search.
export function TripPlannerForm({
  origin, destination, canClear, onClear, onOpenPicker, onUseCurrentLocation, onSwap,
  positionError, onRetryPosition, preference, maxWalkingDistanceMeters, onOpenOptions,
  plan, onSearch, onOpenItinerary, bottomInset,
}: {
  origin: TripPoint | null; destination: TripPoint | null;
  canClear: boolean; onClear: () => void;
  onOpenPicker: (mode: PointMode) => void; onUseCurrentLocation: (mode: PointMode) => void; onSwap: () => void;
  positionError: string | null; onRetryPosition: () => void;
  preference: JourneyPreference; maxWalkingDistanceMeters: number; onOpenOptions: () => void;
  plan: ReturnType<typeof useJourneyPlan> | null; onSearch: () => void; onOpenItinerary: (id: string) => void;
  bottomInset: number;
}) {
  const itineraries = plan?.data?.data.itineraries ?? [];
  const searchedAt = new Date(plan?.data?.meta.generatedAt ?? NaN);
  const searching = plan?.loading ?? false;
  const bothPoints = !!origin && !!destination;
  return (
    <ScrollView contentContainerStyle={[styles.formContent, { paddingBottom: 104 + bottomInset }]} keyboardShouldPersistTaps="handled">
      <View style={styles.titleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.eyebrow}>PLANEA TU VIAJE</Text>
          <Text style={styles.title}>¿A dónde quieres ir?</Text>
        </View>
        {canClear && (
          <Pressable style={styles.clearTripButton} onPress={onClear} accessibilityLabel="Limpiar búsqueda">
            <Ionicons name="refresh-outline" size={15} color="#dc2626" />
            <Text style={styles.clearTripText}>Limpiar</Text>
          </Pressable>
        )}
      </View>

      <View style={styles.searchGroup}>
        <View style={styles.connector} />
        <PointField mode="origin" point={origin} onOpen={() => onOpenPicker('origin')} onUseCurrentLocation={() => onUseCurrentLocation('origin')} />
        <Pressable
          style={[styles.swapButton, !bothPoints && styles.swapButtonDisabled]}
          onPress={onSwap}
          disabled={!bothPoints}
          accessibilityLabel="Invertir origen y destino"
        >
          <Ionicons name="swap-vertical" size={18} color={bothPoints ? '#1f6feb' : '#94a3b8'} />
        </Pressable>
        <PointField mode="destination" point={destination} onOpen={() => onOpenPicker('destination')} onUseCurrentLocation={() => onUseCurrentLocation('destination')} />
      </View>

      {positionError && <Pressable onPress={onRetryPosition}><Text style={styles.mapHint}>{positionError} Toca para reintentar.</Text></Pressable>}
      <Pressable onPress={onOpenOptions} accessibilityRole="button" style={styles.plannerOptions}>
        <Ionicons name="options-outline" size={16} color="#1f6feb" />
        <Text style={tripStyles.plannerOptionsText}>Opciones · {preferenceLabels[preference]} · hasta {formatDistance(maxWalkingDistanceMeters)} a pie</Text>
      </Pressable>

      <Pressable
        style={[styles.searchButton, (!bothPoints || searching) && styles.searchButtonDisabled]}
        disabled={!bothPoints || searching}
        onPress={onSearch}
        accessibilityRole="button"
        accessibilityLabel="Buscar viajes"
      >
        {searching ? <ActivityIndicator color="#fff" /> : <>
          <Ionicons name="search" size={18} color="#fff" />
          <Text style={styles.searchButtonText}>Buscar viajes</Text>
        </>}
      </Pressable>

      {plan && (plan.loading || plan.error || !itineraries.length) && (
        <View style={styles.resultsStatus}>
          {plan.loading ? <View style={styles.noRouteRow}><ActivityIndicator color="#1f6feb" /><Text style={styles.noRouteText}>Buscando caminatas, buses y conexiones…</Text></View>
            : plan.error ? <DataStatus error={plan.error} retry={plan.reload} />
            : <View style={styles.noRouteRow}><Ionicons name="information-circle-outline" size={22} color="#475569" /><Text style={styles.noRouteText}>{noJourneyMessage(plan.data?.meta.noRouteReason)}</Text></View>}
        </View>
      )}

      {plan && itineraries.length > 0 && (
        <View style={styles.resultsSection}>
          <View style={tripStyles.routesHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.routesTitle}>Opciones de viaje</Text>
              <Text style={styles.routesSubtitle}>Viaje completo de origen a destino</Text>
            </View>
            <Pressable style={styles.collapseButton} onPress={plan.reload} accessibilityLabel="Actualizar viajes"><Ionicons name="refresh" size={18} color="#475569" /></Pressable>
          </View>
          {itineraries.map(item => {
            const schedule = journeySchedule(item, searchedAt);
            const duration = itineraryDuration(item);
            return (
              <Pressable key={item.id} style={styles.routeCard}
                onPress={() => onOpenItinerary(item.id)} accessibilityRole="button"
                accessibilityLabel={`Ver viaje ${itineraryTitle(item)}${duration ? `, ${duration}` : ''}`}>
                <View style={styles.cardTop}>
                  <View style={styles.cardLegs}><LegSummary chips={legChips(item)} wrap /></View>
                  {duration && <Text style={styles.routeDuration}>{duration}</Text>}
                </View>
                {schedule && <Text style={styles.routeDescription}>Sal a las {formatClock(schedule.leaveAt)} · Llegas {formatClock(schedule.arriveAt)}</Text>}
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  plannerOptions: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  formContent: {
    padding: 20,
    paddingTop: 24,
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
    backgroundColor: '#fff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  cardLegs: {
    flex: 1,
    minWidth: 0,
  },
  routeDescription: {
    color: '#64748b',
    fontSize: 12,
    lineHeight: 17,
    marginTop: 8,
  },
  routeDuration: {
    color: '#111827',
    fontSize: 20,
    fontWeight: '800',
  },
});
