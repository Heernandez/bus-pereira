import type { ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { departureAt, departureMinutes, departuresForRoute } from '../../services/stationArrivals';
import { useStationArrivals } from '../../hooks/useStationArrivals';
import { formatClock, formatDistance, formatDuration, timingLabel, type JourneyStep } from '../../services/journeyPresentation';
import type { Arrival } from '../../services/transit';
import type { BusLeg } from '../../types/journey';
import { tripStyles } from './shared';

const RIDE_COLOR = '#292923';
type Arrivals = ReturnType<typeof useStationArrivals>;

const predictionLabel = (source: Arrival['predictionSource']) =>
  source === 'gps' ? 'En vivo' : source === 'schedule' ? 'Según horario' : source === 'demo' ? 'Simulación' : 'Estimado';

function PassOffer({ onBuy }: { onBuy: () => void }) {
  return (
    <View style={styles.passOffer}>
      <Ionicons name="card-outline" size={22} color="#292923" />
      <Text style={styles.passOfferText}>¿No tienes pasabordo?</Text>
      <Pressable accessibilityRole="button" onPress={onBuy} style={styles.passOfferButton}>
        <Text style={styles.passOfferButtonText}>Compra aquí</Text>
      </Pressable>
    </View>
  );
}

// Left column of a timeline row: an icon or dot, then the rail down to the next row.
function Rail({ marker, rail }: { marker: ReactNode; rail: 'dots' | 'solid' | 'none' }) {
  return (
    <View style={styles.rail}>
      {marker}
      {rail === 'solid' && <View style={styles.solidRail} />}
      {rail === 'dots' && <View style={styles.dotsRail}>{[0, 1, 2].map(index => <View key={index} style={styles.railDot} />)}</View>}
    </View>
  );
}

// Boarding stop: when the next bus of this route comes by, falling back to the planned time.
// The selected leg reuses the screen's subscription (it also feeds the bus markers); others open their own.
function Boarding({ leg, planned, provided, active, onSelectLeg, onPreviewStation }: {
  leg: BusLeg; planned: Date | null; provided: Arrivals | undefined; active: boolean;
  onSelectLeg: (leg: BusLeg) => void; onPreviewStation: (stopId: string) => void;
}) {
  const stopId = leg.from.stopId;
  const own = useStationArrivals(stopId, active && !provided && !!stopId);
  const arrivals = provided ?? own;
  const next = stopId && arrivals.data ? departuresForRoute(arrivals.data.data.arrivals, stopId, leg.routeId, leg.variantId)[0] : undefined;
  const minutes = next ? departureMinutes(next) : null;
  const at = next ? departureAt(next) ?? (minutes !== null ? new Date(Date.now() + minutes * 60000) : null) : planned;
  const status = !stopId ? timingLabel(leg.timingSource)
    : next ? `${minutes === null ? 'Sin estimación' : minutes <= 0 ? 'Saliendo' : `En ${minutes} min`} · ${predictionLabel(next.arrival.predictionSource)}`
    : arrivals.data ? 'Sin salidas próximas' : arrivals.error ? 'Salidas no disponibles' : 'Consultando salidas…';
  return (
    <View style={styles.body}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Ver en el mapa la ruta ${leg.routeCode} desde ${leg.from.name}`} onPress={() => onSelectLeg(leg)}>
        <Text style={styles.place}>{leg.from.name}</Text>
        <View style={styles.boardLine}>
          {at && <Text style={styles.clock}>{formatClock(at)}</Text>}
          <View style={styles.code}><Text style={styles.codeText}>{leg.routeCode}</Text></View>
          <Text style={styles.towards} numberOfLines={1}>hacia {leg.headsign}</Text>
        </View>
      </Pressable>
      <View style={styles.statusLine}>
        <Ionicons name="time-outline" size={14} color="#64748b" />
        <Text style={styles.status} numberOfLines={1}>{status}</Text>
        {stopId && <Pressable accessibilityRole="button" accessibilityLabel={`Ver más salidas en ${leg.from.name}`} onPress={() => onPreviewStation(stopId)} style={styles.more} hitSlop={8}>
          <Text style={styles.moreText}>Ver más</Text>
          <Ionicons name="chevron-forward" size={14} color="#1f6feb" />
        </Pressable>}
      </View>
    </View>
  );
}

function Step({ step, next, stopCount, renderBoarding }: {
  step: JourneyStep; next: JourneyStep | undefined; stopCount: (leg: BusLeg) => number | null;
  renderBoarding: (leg: BusLeg, planned: Date | null) => ReactNode;
}) {
  // The rail below a row describes how you move to the next one: dots walking, a solid bar riding.
  const railBelow = !next ? 'none' : step.kind === 'board' || step.kind === 'ride' ? 'solid' : 'dots';
  switch (step.kind) {
    case 'start':
    case 'end':
      return (
        <View style={styles.row}>
          <Rail rail={railBelow} marker={<Ionicons name={step.kind === 'start' ? 'location' : 'flag'} size={22} color="#1f6feb" />} />
          <View style={[styles.body, styles.rowBetween]}>
            <Text style={styles.place} numberOfLines={2}>{step.kind === 'start' ? 'Inicio del viaje' : `Llegada a ${step.name}`}</Text>
            {step.at && <Text style={styles.clock}>{formatClock(step.at)}</Text>}
          </View>
        </View>
      );
    case 'walk':
      return (
        <View style={styles.row}>
          <Rail rail={railBelow} marker={<Ionicons name="walk" size={20} color="#111827" />} />
          <View style={styles.body}>
            <Text style={styles.walk}>Camina <Text style={styles.meta}>{formatDuration(step.leg.durationSeconds)} ({formatDistance(step.leg.distanceMeters)})</Text></Text>
          </View>
        </View>
      );
    case 'board':
      return (
        <View style={styles.row}>
          <Rail rail="solid" marker={<View style={styles.busMarker}><Ionicons name="bus" size={14} color="#facc15" /></View>} />
          {renderBoarding(step.leg, step.at)}
        </View>
      );
    case 'ride': {
      const stops = stopCount(step.leg);
      return (
        <View style={styles.row}>
          <Rail rail="solid" marker={null} />
          <View style={styles.body}>
            <Text style={styles.meta}>{stops ? `${stops} ${stops === 1 ? 'parada' : 'paradas'}, ` : ''}{formatDuration(step.leg.durationSeconds)}{step.leg.geometry.source === 'approximate' ? ' · trazado aproximado' : ''}</Text>
          </View>
        </View>
      );
    }
    case 'alight':
      return (
        <View style={styles.row}>
          <Rail rail={railBelow} marker={<View style={styles.alightMarker} />} />
          <View style={styles.body}>
            <Text style={styles.place}>{step.leg.to.name}</Text>
            {step.at && <Text style={styles.clock}>{formatClock(step.at)}</Text>}
          </View>
        </View>
      );
  }
}

// Content of the itinerary sheet: the step-by-step timeline, with live departures at each boarding stop.
export function JourneyDetail({ steps, stopCount, selectedLeg, selectedArrivals, active, showingSingleLeg, onShowFullJourney, onSelectLeg, onPreviewStation, showPassOffer, onBuyPass }: {
  steps: JourneyStep[]; stopCount: (leg: BusLeg) => number | null;
  selectedLeg: BusLeg | undefined; selectedArrivals: Arrivals; active: boolean;
  showingSingleLeg: boolean; onShowFullJourney: () => void; onSelectLeg: (leg: BusLeg) => void;
  onPreviewStation: (stopId: string) => void; showPassOffer: boolean; onBuyPass: () => void;
}) {
  const hasBus = steps.some(step => step.kind === 'board');
  const renderBoarding = (leg: BusLeg, planned: Date | null) => (
    <Boarding leg={leg} planned={planned} active={active} onSelectLeg={onSelectLeg} onPreviewStation={onPreviewStation}
      provided={leg.id === selectedLeg?.id && leg.from.stopId === selectedLeg.from.stopId ? selectedArrivals : undefined} />
  );
  return (
    <FlatList data={steps} keyExtractor={item => item.id} style={styles.list}
      ListHeaderComponent={<>
        {showPassOffer && hasBus && <PassOffer onBuy={onBuyPass} />}
        {showingSingleLeg && <Pressable accessibilityRole="button" onPress={onShowFullJourney} style={styles.fullJourney}>
          <Text style={tripStyles.plannerOptionsText}>Ver viaje completo en el mapa</Text>
        </Pressable>}
      </>}
      renderItem={({ item, index }) => <Step step={item} next={steps[index + 1]} stopCount={stopCount} renderBoarding={renderBoarding} />} />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  passOffer: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff3ad', borderRadius: 14, padding: 12, marginBottom: 14 },
  passOfferText: { flex: 1, color: '#292923', fontSize: 14, fontWeight: '700' },
  passOfferButton: { backgroundColor: '#292923', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  passOfferButtonText: { color: '#facc15', fontSize: 13, fontWeight: '800' },
  fullJourney: { marginBottom: 12 },
  row: { flexDirection: 'row' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  rail: { width: 32, alignItems: 'center' },
  solidRail: { flex: 1, width: 6, minHeight: 18, backgroundColor: RIDE_COLOR },
  dotsRail: { flex: 1, minHeight: 30, justifyContent: 'space-evenly', paddingVertical: 4 },
  railDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: '#94a3b8' },
  busMarker: { width: 26, height: 26, borderRadius: 13, backgroundColor: RIDE_COLOR, alignItems: 'center', justifyContent: 'center' },
  alightMarker: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: RIDE_COLOR, backgroundColor: '#fff' },
  body: { flex: 1, paddingLeft: 10, paddingBottom: 16 },
  place: { color: '#111827', fontSize: 15, fontWeight: '700', flexShrink: 1 },
  clock: { color: '#111827', fontSize: 15, fontWeight: '800', marginTop: 2 },
  walk: { color: '#111827', fontSize: 14, fontWeight: '600', paddingTop: 2 },
  meta: { color: '#64748b', fontSize: 12, fontWeight: '400', marginTop: 3 },
  towards: { flex: 1, color: '#334155', fontSize: 13, fontWeight: '600' },
  statusLine: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  status: { flexShrink: 1, color: '#64748b', fontSize: 12 },
  boardLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  code: { backgroundColor: '#fff3ad', borderColor: '#e7bd32', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 1 },
  codeText: { color: '#292923', fontSize: 13, fontWeight: '800' },
  more: { flexDirection: 'row', alignItems: 'center', gap: 2, marginLeft: 6 },
  moreText: { color: '#1f6feb', fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
});
