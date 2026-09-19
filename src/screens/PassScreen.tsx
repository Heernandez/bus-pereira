import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type PassType = 'round_trip' | '7_days' | '28_days';

type Pass = {
  id: string;
  type: PassType;
  name: string;
  detail: string;
  price: string;
  purchasedAt: string;
  validUntil: string;
  usageLabel: string;
  remainingUses: number | null;
  status: 'Vigente' | 'Expirado';
  token: string;
};

const singleTripPrice = 3000;

const formatCop = (value: number) => `$${value.toLocaleString('es-CO')}`;

const initialPasses: Pass[] = [
  { id: 'pass-1', type: '7_days', name: 'Pasabordo 7 días', detail: 'Viajes ilimitados durante 7 días', price: formatCop(singleTripPrice * 2 * 7), purchasedAt: 'Hoy, 08:42', validUntil: '25 sep 2026', usageLabel: 'Usos ilimitados', remainingUses: null, status: 'Vigente', token: 'BP-7F4A-91C2' },
  { id: 'pass-2', type: 'round_trip', name: '1 round trip', detail: 'Dos viajes: ida y regreso', price: formatCop(singleTripPrice * 2), purchasedAt: '12 sep 2026, 17:20', validUntil: '12 sep 2026', usageLabel: '0 de 2 usos restantes', remainingUses: 0, status: 'Expirado', token: 'BP-18DD-44A0' },
];

const products = [
  { type: 'round_trip' as const, name: '1 round trip', detail: 'Dos viajes: ida y regreso', validity: 'Válido para 2 usos', price: formatCop(singleTripPrice * 2), usageLabel: '2 usos', icon: 'repeat-outline' as const },
  { type: '7_days' as const, name: 'Pasabordo 7 días', detail: 'Viajes ilimitados durante la vigencia', validity: 'Válido por 7 días', price: formatCop(singleTripPrice * 2 * 7), usageLabel: 'Usos ilimitados', icon: 'calendar-outline' as const },
  { type: '28_days' as const, name: 'Pasabordo 28 días', detail: 'Viajes ilimitados durante la vigencia', validity: 'Válido por 28 días', price: formatCop(singleTripPrice * 2 * 28), usageLabel: 'Usos ilimitados', icon: 'calendar-number-outline' as const },
];

export function PassScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'history' | 'buy'>('history');
  const [passes, setPasses] = useState(initialPasses);
  const [selectedPass, setSelectedPass] = useState<Pass | null>(null);

  const buy = (product: (typeof products)[number]) => {
    const pass: Pass = { id: `pass-${Date.now()}`, type: product.type, name: product.name, detail: product.detail, price: product.price, purchasedAt: 'Ahora', validUntil: product.type === 'round_trip' ? 'Hoy' : product.type === '7_days' ? 'En 7 días' : 'En 28 días', usageLabel: product.usageLabel, remainingUses: product.type === 'round_trip' ? 2 : null, status: 'Vigente', token: `BP-${Math.random().toString(16).slice(2, 10).toUpperCase()}` };
    setPasses((current) => [pass, ...current]);
    setSelectedPass(pass);
    setTab('history');
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: 28 + insets.top, paddingBottom: 104 + insets.bottom },
        ]}
      >
        <Text style={styles.eyebrow}>MOVILIDAD DIGITAL</Text>
        <Text style={styles.title}>Pasabordo</Text>
        <Text style={styles.subtitle}>Compra y consulta tus viajes desde el teléfono.</Text>
        <View style={styles.tabs}>
          <Pressable style={[styles.tab, tab === 'history' && styles.tabActive]} onPress={() => setTab('history')}><Text style={[styles.tabText, tab === 'history' && styles.tabTextActive]}>Mis pasabordos</Text></Pressable>
          <Pressable style={[styles.tab, tab === 'buy' && styles.tabActive]} onPress={() => setTab('buy')}><Text style={[styles.tabText, tab === 'buy' && styles.tabTextActive]}>Comprar</Text></Pressable>
        </View>
        {tab === 'history' ? (
          <>
            <Text style={styles.section}>Vigentes</Text>
            {passes.filter((pass) => pass.status === 'Vigente').map((pass) => <PassCard key={pass.id} pass={pass} onPress={() => setSelectedPass(pass)} />)}
            <Text style={[styles.section, styles.expiredSection]}>Historial expirado</Text>
            {passes.filter((pass) => pass.status === 'Expirado').map((pass) => <PassCard key={pass.id} pass={pass} onPress={() => setSelectedPass(pass)} />)}
          </>
        ) : (
          <>
            <View style={styles.info}><Ionicons name="shield-checkmark-outline" size={24} color="#1f6feb" /><Text style={styles.infoText}>El backend asociará el pasabordo a un único dispositivo y firmará el ticket.</Text></View>
            {products.map((product) => <View style={styles.product} key={product.name}><View style={styles.productIcon}><Ionicons name={product.icon} size={23} color="#1f6feb" /></View><View style={styles.productText}><Text style={styles.productName}>{product.name}</Text><Text style={styles.productDetail}>{product.detail}</Text><Text style={styles.productValidity}>{product.validity} · {product.usageLabel}</Text><Text style={styles.price}>{product.price}</Text></View><Pressable style={styles.buyButton} onPress={() => buy(product)} accessibilityLabel={`Comprar ${product.name}`}><Ionicons name="arrow-forward" size={19} color="#fff" /></Pressable></View>)}
          </>
        )}
      </ScrollView>
      <Modal transparent animationType="slide" visible={Boolean(selectedPass)} onRequestClose={() => setSelectedPass(null)}>
        <View style={styles.backdrop}><View style={[styles.modal, { paddingBottom: 24 + insets.bottom }]}><View style={styles.handle} /><View style={styles.modalHeader}><View><Text style={styles.eyebrow}>PASABORDO DIGITAL</Text><Text style={styles.modalTitle}>{selectedPass?.name}</Text></View><Pressable onPress={() => setSelectedPass(null)}><Ionicons name="close" size={26} color="#111827" /></Pressable></View><Text style={styles.journey}>{selectedPass?.detail}</Text><Text style={styles.modalMeta}>{selectedPass?.price} · Válido hasta {selectedPass?.validUntil}</Text>{selectedPass?.status === 'Vigente' ? <TicketCode value={selectedPass.token} /> : <Text style={styles.expired}>Este pasabordo ya expiró.</Text>}<View style={styles.validation}><View><Ionicons name="qr-code-outline" size={22} color="#1f6feb" /><Text style={styles.validationTitle}>QR dinámico</Text></View><View><Ionicons name="radio-outline" size={22} color="#0f766e" /><Text style={styles.validationTitle}>NFC listo</Text></View></View><Text style={styles.footer}>Firmado para este dispositivo · {selectedPass?.token}</Text></View></View>
      </Modal>
    </View>
  );
}

function PassCard({ pass, onPress }: { pass: Pass; onPress: () => void }) { const active = pass.status === 'Vigente'; return <Pressable style={styles.card} onPress={onPress}><View style={[styles.stripe, { backgroundColor: active ? '#0f766e' : '#94a3b8' }]} /><View style={styles.cardBody}><View style={styles.cardTop}><Text style={styles.route}>{pass.name}</Text><Text style={[styles.status, active ? styles.active : styles.inactive]}>{pass.status}</Text></View><Text style={styles.journey}>{pass.detail}</Text><Text style={styles.cardUsage}>{pass.usageLabel} · hasta {pass.validUntil}</Text><Text style={styles.date}>{pass.purchasedAt} · {pass.price}</Text></View><Ionicons name="chevron-forward" size={18} color="#94a3b8" /></Pressable>; }

function TicketCode({ value }: { value: string }) { return <View style={styles.codeBox}><View style={styles.codeGrid}>{Array.from({ length: 64 }, (_, index) => <View key={index} style={[styles.codeCell, ((value.charCodeAt(index % value.length) + index * 7) % 5) < 2 && styles.codeCellFilled]} />)}</View><Text style={styles.codeLabel}>Código dinámico del dispositivo</Text></View>; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' }, content: { padding: 20, paddingTop: 28 }, eyebrow: { color: '#1f6feb', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, title: { color: '#111827', fontSize: 31, fontWeight: '800', marginTop: 5 }, subtitle: { color: '#64748b', fontSize: 14, marginTop: 7, marginBottom: 20 }, tabs: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 14, padding: 4, marginBottom: 24 }, tab: { flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 11 }, tabActive: { backgroundColor: '#1f6feb' }, tabText: { color: '#64748b', fontSize: 13, fontWeight: '700' }, tabTextActive: { color: '#fff' }, section: { color: '#111827', fontSize: 18, fontWeight: '800', marginBottom: 10 }, expiredSection: { marginTop: 24 }, card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 11, paddingRight: 12 }, stripe: { width: 6, alignSelf: 'stretch' }, cardBody: { flex: 1, padding: 14 }, cardTop: { flexDirection: 'row', alignItems: 'center' }, route: { flex: 1, color: '#111827', fontSize: 14, fontWeight: '800' }, status: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: '800', overflow: 'hidden' }, active: { color: '#0f766e', backgroundColor: '#ccfbf1' }, inactive: { color: '#64748b', backgroundColor: '#f1f5f9' }, journey: { color: '#475569', fontSize: 13, marginTop: 10 }, cardUsage: { color: '#0f766e', fontSize: 11, fontWeight: '700', marginTop: 7 }, date: { color: '#94a3b8', fontSize: 11, marginTop: 8 }, info: { flexDirection: 'row', backgroundColor: '#eff6ff', borderRadius: 15, padding: 14, marginBottom: 15 }, infoText: { flex: 1, color: '#475569', fontSize: 12, lineHeight: 18, marginLeft: 10 }, product: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', padding: 13, marginBottom: 11 }, productIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' }, productText: { flex: 1, marginLeft: 12 }, productName: { color: '#111827', fontSize: 15, fontWeight: '800' }, productDetail: { color: '#64748b', fontSize: 12, marginTop: 3 }, productValidity: { color: '#0f766e', fontSize: 11, fontWeight: '700', marginTop: 5 }, price: { color: '#1f6feb', fontSize: 15, fontWeight: '800', marginTop: 7 }, buyButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#1f6feb', alignItems: 'center', justifyContent: 'center' }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.42)' }, modal: { backgroundColor: '#f8fafc', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20 }, handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', marginBottom: 22 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, modalTitle: { color: '#111827', fontSize: 21, fontWeight: '800', marginTop: 5 }, modalMeta: { color: '#0f766e', fontSize: 13, fontWeight: '700', marginTop: 8 }, validation: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#fff', borderRadius: 15, padding: 16, marginTop: 14 }, validationTitle: { color: '#334155', fontSize: 13, fontWeight: '800', marginTop: 7 }, footer: { color: '#94a3b8', fontSize: 10, textAlign: 'center', marginTop: 16 }, codeBox: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, padding: 16, marginTop: 16 }, codeGrid: { width: 176, height: 176, flexDirection: 'row', flexWrap: 'wrap', padding: 4 }, codeCell: { width: '12.5%', height: '12.5%' }, codeCellFilled: { backgroundColor: '#111827' }, codeLabel: { color: '#64748b', fontSize: 11, marginTop: 10 }, expired: { color: '#64748b', textAlign: 'center', backgroundColor: '#f1f5f9', padding: 30, borderRadius: 15, marginTop: 16 },
});
