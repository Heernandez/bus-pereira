import { Fragment, useEffect, useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { LegChip } from '../../services/journeyPresentation';

// How much detail still fits on one line, from full to a plain ellipsized text.
type Density = 'full' | 'noBusIcon' | 'walkIcon' | 'text';
const densities: Density[] = ['full', 'noBusIcon', 'walkIcon', 'text'];

const describe = (chips: LegChip[]) => chips.map(chip => chip.kind === 'walk' ? `caminar ${chip.minutes} minutos` : `bus ${chip.code}`).join(', luego ');

function Chip({ chip, density }: { chip: LegChip; density: Density }) {
  return chip.kind === 'walk'
    ? <View style={styles.walk}>
        <Ionicons name="walk" size={16} color="#111827" />
        {density !== 'walkIcon' && <Text style={styles.walkText}>{chip.minutes}</Text>}
      </View>
    : <View style={styles.bus}>
        {density === 'full' && <View style={styles.busIcon}><Ionicons name="bus" size={11} color="#facc15" /></View>}
        <View style={styles.code}><Text style={styles.codeText}>{chip.code}</Text></View>
      </View>;
}

// "walk 7 › bus C20 › walk 1": the shape of a trip at a glance. With `wrap` it keeps full detail and
// continues on the next line; otherwise it stays on one line and drops detail step by step to fit.
export function LegSummary({ chips, wrap = false }: { chips: LegChip[]; wrap?: boolean }) {
  if (wrap) return (
    <View style={styles.wrapRow} accessibilityLabel={describe(chips)}>
      {chips.map((chip, index) => (
        // The arrow trails the chip before it, so every line starts with a walk or bus icon
        // and a line ending in "›" reads as "continues below".
        <View key={chip.id} style={styles.step}>
          <Chip chip={chip} density="full" />
          {index < chips.length - 1 && <Ionicons name="chevron-forward" size={12} color="#64748b" />}
        </View>
      ))}
    </View>
  );
  return <FittedLegSummary chips={chips} />;
}

function FittedLegSummary({ chips }: { chips: LegChip[] }) {
  const key = chips.map(chip => chip.id).join('|');
  const [width, setWidth] = useState(0);
  // Natural width of the chips at the density they were measured with.
  const [content, setContent] = useState({ key, density: 'full' as Density, width: 0 });
  const [fit, setFit] = useState({ key, width, density: 'full' as Density });
  // New legs or a new width start again from full detail.
  const density = fit.key === key && fit.width === width ? fit.density : 'full';
  useEffect(() => {
    if (!width || density === 'text' || content.key !== key || content.density !== density || content.width <= width + 0.5) return;
    setFit({ key, width, density: densities[densities.indexOf(density) + 1] });
  }, [width, content, density, key]);
  const onContainerLayout = (event: LayoutChangeEvent) => setWidth(Math.round(event.nativeEvent.layout.width));
  const onContentLayout = (event: LayoutChangeEvent) => {
    const measured = Math.round(event.nativeEvent.layout.width);
    setContent(current => current.key === key && current.density === density && current.width === measured ? current : { key, density, width: measured });
  };

  if (density === 'text') {
    const text = chips.map(chip => chip.kind === 'walk' ? `🚶${chip.minutes}` : chip.code).join(' › ');
    return <View style={styles.container} onLayout={onContainerLayout} accessibilityLabel={describe(chips)}>
      <Text style={styles.text} numberOfLines={1}>{text}</Text>
    </View>;
  }
  return (
    <View style={styles.container} onLayout={onContainerLayout} accessibilityLabel={describe(chips)}>
      <View style={styles.row} onLayout={onContentLayout}>
        {chips.map((chip, index) => (
          <Fragment key={chip.id}>
            {index > 0 && <Ionicons name="chevron-forward" size={12} color="#64748b" />}
            <Chip chip={chip} density={density} />
          </Fragment>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, minWidth: 0, overflow: 'hidden' },
  // Laid out at its natural width so it can be compared with the container.
  row: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 4 },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', rowGap: 6, columnGap: 4 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  walk: { flexDirection: 'row', alignItems: 'center' },
  walkText: { color: '#111827', fontSize: 14, fontWeight: '600' },
  bus: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  busIcon: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#292923', alignItems: 'center', justifyContent: 'center' },
  code: { backgroundColor: '#fff3ad', borderColor: '#e7bd32', borderWidth: 1, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 },
  codeText: { color: '#292923', fontSize: 13, fontWeight: '800' },
  text: { color: '#111827', fontSize: 14, fontWeight: '700' },
});
