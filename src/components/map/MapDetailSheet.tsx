import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export const sheetHeight = (height: number, expanded: boolean) => expanded ? Math.min(440, height * 0.55) : 98;

export function MapDetailSheet({ title, subtitle, expanded, onExpand, onBack, onClear, children }: {
  title: string; subtitle: string; expanded: boolean; onExpand: (expanded: boolean) => void;
  onBack: () => void; onClear: () => void; children: React.ReactNode;
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const size = useRef(new Animated.Value(sheetHeight(height, expanded))).current;
  useEffect(() => { const motion = Animated.timing(size, { toValue: sheetHeight(height, expanded), duration: 220, useNativeDriver: false }); motion.start(); return () => motion.stop(); }, [expanded, height, size]);
  const gesture = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, state) => Math.abs(state.dy) > 8 && Math.abs(state.dy) > Math.abs(state.dx),
    onPanResponderMove: (_, state) => size.setValue(Math.max(98, Math.min(sheetHeight(height, true), sheetHeight(height, expanded) - state.dy))),
    onPanResponderRelease: (_, state) => {
      const next = Math.abs(state.dy) > 24 ? state.dy < 0 : expanded;
      onExpand(next);
      Animated.timing(size, { toValue: sheetHeight(height, next), duration: 220, useNativeDriver: false }).start();
    },
    onPanResponderTerminate: () => Animated.timing(size, { toValue: sheetHeight(height, expanded), duration: 220, useNativeDriver: false }).start(),
  }), [expanded, height, onExpand, size]);
  return <Animated.View style={[styles.sheet, { bottom: 86 + insets.bottom, height: size }]}>
    <View {...gesture.panHandlers}><Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Minimizar detalle' : 'Expandir detalle'} onPress={() => onExpand(!expanded)} style={styles.handleArea}><View style={styles.handle} /></Pressable></View>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver a la selección anterior" onPress={onBack} style={styles.control}><Ionicons name="arrow-back" size={22} color="#1f6feb" /></Pressable>
      <Pressable style={styles.heading} onPress={() => onExpand(!expanded)} accessibilityRole="button" accessibilityLabel={`${title}. ${expanded ? 'Minimizar' : 'Expandir'}`}>
        <Text style={styles.title} numberOfLines={1}>{title}</Text><Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Minimizar detalle' : 'Expandir detalle'} onPress={() => onExpand(!expanded)} style={styles.control}><Ionicons name={expanded ? 'chevron-down' : 'chevron-up'} size={22} color="#475569" /></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Quitar selección del mapa" onPress={onClear} style={styles.control}><Ionicons name="close" size={22} color="#475569" /></Pressable>
    </View>
    {expanded && <View style={styles.content}>{children}</View>}
  </Animated.View>;
}
const styles = StyleSheet.create({
  sheet: { position: 'absolute', left: 10, right: 10, backgroundColor: '#f8fafc', borderRadius: 24, elevation: 12, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10 },
  handleArea: { height: 24, alignItems: 'center', justifyContent: 'center' }, handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 12 },
  heading: { flex: 1 }, title: { color: '#111827', fontSize: 18, fontWeight: '800' }, subtitle: { color: '#64748b', fontSize: 12, marginTop: 3 },
  control: { padding: 10 }, content: { flex: 1, paddingHorizontal: 16, paddingBottom: 12 },
});
