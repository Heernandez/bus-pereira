import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { RouteStationArrivals } from '../map/TransitDetail';
import type { useStationArrivals } from '../../hooks/useStationArrivals';
import { busWaitLabel, formatDuration, walkStepLabel, type TimelineItem } from '../../services/journeyPresentation';
import type { BusLeg } from '../../types/journey';
import { tripStyles } from './shared';

// Content of the itinerary sheet. With bus legs, the step list stays collapsed until requested.
export function JourneyDetail({ timeline, busLegs, selectedLeg, showingSingleLeg, onShowFullJourney, onSelectLeg, stepsExpanded, onToggleSteps, arrivals }: {
  timeline: TimelineItem[]; busLegs: BusLeg[]; selectedLeg: BusLeg | undefined;
  showingSingleLeg: boolean; onShowFullJourney: () => void; onSelectLeg: (leg: BusLeg) => void;
  stepsExpanded: boolean; onToggleSteps: () => void; arrivals: ReturnType<typeof useStationArrivals>;
}) {
  return (
    <FlatList data={stepsExpanded || !busLegs.length ? timeline : []} keyExtractor={item => item.id} style={styles.list}
      ListHeaderComponent={<>
        {!!busLegs.length && <>
          <Text style={tripStyles.stopListTitle}>Buses para tu viaje</Text>
          {showingSingleLeg && <Pressable accessibilityRole="button" onPress={onShowFullJourney}>
            <Text style={tripStyles.plannerOptionsText}>Ver viaje completo</Text>
          </Pressable>}
          <View style={tripStyles.optionRow}>{busLegs.map((leg, index) => <Pressable key={leg.id}
            accessibilityRole="button" accessibilityState={{ selected: selectedLeg?.id === leg.id }}
            onPress={() => onSelectLeg(leg)}
            style={[tripStyles.optionChip, { backgroundColor: selectedLeg?.id === leg.id ? '#facc15' : '#fff3ad', borderColor: '#292923' }]}>
            <Text style={tripStyles.plannerOptionsText}>{index + 1}. 🚌 {leg.routeCode} · {leg.headsign}</Text>
          </Pressable>)}</View>
          {selectedLeg && <>
            <Text style={styles.legMeta}>ID de ruta: {selectedLeg.routeId}</Text>
            {selectedLeg.from.stopId
              ? <RouteStationArrivals routeId={selectedLeg.routeId} variantId={selectedLeg.variantId}
                  stationName={selectedLeg.from.name} arrivals={arrivals} />
              : <Text style={styles.legMeta}>No hay información de llegadas para esta parada.</Text>}
          </>}
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: stepsExpanded }}
            onPress={onToggleSteps} style={tripStyles.routesHeader}>
            <Text style={tripStyles.stopListTitle}>Paso a paso</Text>
            <Ionicons name={stepsExpanded ? 'chevron-up' : 'chevron-down'} size={20} color="#475569" />
          </Pressable>
        </>}
        {!busLegs.length && <Text style={tripStyles.stopListTitle}>Paso a paso</Text>}
      </>}
      renderItem={({ item, index }) => {
        const isLast = index === timeline.length - 1;
        if (item.kind === 'node') return (
          <View style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.dot, { backgroundColor: item.color }]} />
              {!isLast && <View style={styles.line} />}
            </View>
            <View style={styles.body}>
              <Text style={styles.stopName}>{item.name}</Text>
            </View>
          </View>
        );
        const leg = item.leg;
        return (
          <View style={styles.row}>
            <View style={styles.rail}>
              <View style={[styles.iconBubble, { backgroundColor: leg.mode === 'bus' ? leg.color : '#94a3b8' }]}>
                <Ionicons name={leg.mode === 'walk' ? 'walk' : 'bus'} size={12} color="#fff" />
              </View>
              {!isLast && <View style={styles.line} />}
            </View>
            <View style={styles.body}>
              {leg.mode === 'walk' ? <Text style={styles.legText}>{walkStepLabel(leg)}</Text> : <>
                <Pressable style={styles.busRow} accessibilityRole="button" accessibilityLabel={`Ver ruta ${leg.routeCode} y buses próximos`} onPress={() => onSelectLeg(leg)}>
                  <View style={[styles.routeBadge, { backgroundColor: leg.color }]}><Text style={styles.routeBadgeText}>{leg.routeCode}</Text></View>
                  <Text style={styles.legText} numberOfLines={2}>hacia {leg.headsign}</Text>
                </Pressable>
                <Text style={styles.legMeta}>{formatDuration(leg.durationSeconds)} en bus{leg.geometry.source === 'approximate' ? ' · trazado aproximado' : ''}</Text>
                <Text style={styles.legMeta}>{busWaitLabel(leg)}</Text>
              </>}
            </View>
          </View>
        );
      }} />
  );
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
  },
  rail: {
    width: 28,
    alignItems: 'center',
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 5,
  },
  iconBubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  line: {
    flex: 1,
    width: 2,
    marginTop: 2,
    backgroundColor: '#cbd5e1',
  },
  body: {
    flex: 1,
    paddingLeft: 10,
    paddingBottom: 16,
  },
  stopName: {
    color: '#111827',
    fontSize: 14,
    fontWeight: '700',
  },
  legText: {
    color: '#334155',
    fontSize: 13,
    fontWeight: '600',
    flexShrink: 1,
  },
  legMeta: {
    color: '#64748b',
    fontSize: 12,
    marginTop: 3,
  },
  busRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  routeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  routeBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '800',
  },
});
