import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatDistance } from '../../services/journeyPresentation';
import type { JourneyPreference } from '../../types/journey';
import { preferenceLabels, tripStyles, type TripOptions } from './shared';

function ChoiceRow<T extends string | number>({ values, selected, label, onSelect }: {
  values: readonly T[]; selected: T; label: (value: T) => string; onSelect: (value: T) => void;
}) {
  return (
    <View style={tripStyles.optionRow}>{values.map(value => (
      <Pressable key={value} onPress={() => onSelect(value)} style={[tripStyles.optionChip, selected === value && styles.chipSelected]} accessibilityRole="radio" accessibilityState={{ checked: selected === value }}>
        <Text style={tripStyles.plannerOptionsText}>{label(value)}</Text>
      </Pressable>
    ))}</View>
  );
}

export function JourneyOptionsModal({ visible, onClose, options, onChange, bottomInset }: {
  visible: boolean; onClose: () => void; options: TripOptions; onChange: (change: Partial<TripOptions>) => void; bottomInset: number;
}) {
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable style={tripStyles.modalOverlay} onPress={onClose} />
      <View style={[tripStyles.modalContainer, { paddingBottom: 24 + bottomInset }]}>
        <View style={tripStyles.modalHeader}>
          <Text style={tripStyles.modalTitle}>Opciones de viaje</Text>
          <Pressable onPress={onClose} accessibilityLabel="Cerrar opciones"><Ionicons name="close" size={26} color="#111827" /></Pressable>
        </View>
        <Text style={tripStyles.stopListTitle}>Prefiero</Text>
        <ChoiceRow values={Object.keys(preferenceLabels) as JourneyPreference[]} selected={options.preference}
          label={value => preferenceLabels[value]} onSelect={preference => onChange({ preference })} />
        <Text style={tripStyles.stopListTitle}>Caminata máxima total (incluye transbordos)</Text>
        <ChoiceRow values={[500, 1000, 1500, 2500]} selected={options.maxWalkingDistanceMeters}
          label={formatDistance} onSelect={maxWalkingDistanceMeters => onChange({ maxWalkingDistanceMeters })} />
        <Text style={tripStyles.stopListTitle}>Máximo de transbordos</Text>
        <ChoiceRow values={[0, 1, 2]} selected={options.maxTransfers}
          label={value => value === 0 ? 'Sin transbordos' : String(value)} onSelect={maxTransfers => onChange({ maxTransfers })} />
        <Pressable style={tripStyles.mapPickerItem} onPress={onClose} accessibilityRole="button"><Text style={tripStyles.plannerOptionsText}>Listo</Text></Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chipSelected: { backgroundColor: '#dbeafe', borderColor: '#1f6feb' },
});
