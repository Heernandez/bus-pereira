import { PassCheckout, type CheckoutProduct } from '../components/PassCheckout';
import { DynamicPassQr } from '../components/DynamicPassQr';
import { buyPass, activatePass, type PaymentMethod } from '../services/passWallet';
import type { PurchasedPass } from '../services/startup';
import { useIsFocused } from '@react-navigation/native';
import { useViewTiming } from '../hooks/useViewTiming';
import React, { useEffect, useState, useRef } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '../context/Session';
import { usePurchasedPasses } from '../context/Opening';
import { useRemoteData } from '../hooks/useRemoteData';
import { DataStatus } from '../components/DataStatus';
import { getProducts, USE_DUMMY_DATA } from '../services/transit';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type PassType = string;

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
  status: 'Vigente' | 'Expirado' | 'Por activar' | 'Perdido';
  token: string;
  raw?: PurchasedPass;
};

const singleTripPrice = 3000;

const formatCop = (value: number) => `$${value.toLocaleString('es-CO')}`;

const initialPasses: Pass[] = [
  { id: 'pass-1', type: '7_days', name: 'Pasabordo 7 días', detail: 'Viajes ilimitados durante 7 días', price: formatCop(singleTripPrice * 2 * 7), purchasedAt: 'Hoy, 08:42', validUntil: '25 sep 2026', usageLabel: 'Usos ilimitados', remainingUses: null, status: 'Vigente', token: 'BP-7F4A-91C2' },
  { id: 'pass-2', type: 'round_trip', name: '1 round trip', detail: 'Dos viajes: ida y regreso', price: formatCop(singleTripPrice * 2), purchasedAt: '12 sep 2026, 17:20', validUntil: '12 sep 2026', usageLabel: '0 de 2 usos restantes', remainingUses: 0, status: 'Expirado', token: 'BP-18DD-44A0' },
];

export function PassScreen() {
  const onViewLayout = useViewTiming('Pasabordo', useIsFocused());
  const navigation = useNavigation<NavigationProp<{ Cuenta: undefined }>>();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<'history' | 'buy'>('history');
  const { account, busy, restoreError } = useSession();
  const purchased = usePurchasedPasses();
  const [buying,setBuying]=useState(false);
  const buyingRef=useRef(false);
  const accountRef=useRef(account?.id);accountRef.current=account?.id;
  const [demoPasses, setPasses] = useState(initialPasses);
  const formatDate = (value: string) => new Date(value).toLocaleString('es-CO');
  const displayPass=(pass:PurchasedPass):Pass=>{
    const lost=pass.status==='activation_expired'||(pass.status==='pending_activation'&&Boolean(pass.activateBefore)&&Date.parse(pass.activateBefore!)<=Date.now());
    const status:Pass['status']=lost?'Perdido':pass.status==='pending_activation'?'Por activar':pass.status==='active'&&(!pass.expiresAt||Date.parse(pass.expiresAt)>Date.now())?'Vigente':'Expirado';
    return {id:pass.id,type:pass.productId,name:pass.name,detail:pass.description,price:formatCop(pass.price),purchasedAt:formatDate(pass.purchasedAt),validUntil:status==='Por activar'?`Activa antes de ${formatDate(pass.activateBefore!)}`:status==='Perdido'?'Plazo de activación vencido':pass.expiresAt?`Válido hasta ${formatDate(pass.expiresAt)}`:'Sin fecha límite',usageLabel:pass.remainingUses===null?'Usos ilimitados':`${pass.remainingUses} usos restantes`,remainingUses:pass.remainingUses,status,token:'',raw:pass};
  };
  const passes: Pass[]=USE_DUMMY_DATA?(account?demoPasses.map(p=>p.raw?displayPass(p.raw):p):[]):(purchased.passes??[]).map(displayPass);
  const [selectedTicket,setSelectedPass]=useState<Pass|null>(null);
  const selectedPass=selectedTicket?.raw?displayPass(selectedTicket.raw):selectedTicket;
  const [checkout,setCheckout]=useState<CheckoutProduct|null>(null);
  const [,tick]=useState(0);
  useEffect(()=>{const timer=setInterval(()=>tick(n=>n+1),1000);return()=>clearInterval(timer);},[]);
  useEffect(()=>{setSelectedPass(null);setCheckout(null);setPasses(initialPasses);},[account?.id]);
  const productData = useRemoteData(getProducts);
  const products = (productData.data ?? []).map(product => ({
    validityDays:product.validityDays,uses:product.uses,amount:product.price,
    type: product.id, name: product.name, price: formatCop(product.price),
    detail: product.uses === null ? 'Viajes ilimitados durante la vigencia' : `${product.uses} viajes`,
    validity: product.validityDays === null ? `Válido para ${product.uses} usos` : `Válido por ${product.validityDays} días`,
    usageLabel: product.uses === null ? 'Usos ilimitados' : `${product.uses} usos`,
    icon: (product.id === 'round_trip' ? 'repeat-outline' : product.id === '7_days' ? 'calendar-outline' : 'calendar-number-outline') as keyof typeof Ionicons.glyphMap,
  }));

  const buy = async (product: CheckoutProduct, paymentMethod:PaymentMethod) => {
    if (!account || buyingRef.current) return;
    if (!USE_DUMMY_DATA) {
      const owner=account.id;buyingRef.current=true;setBuying(true);
      try {
        const raw=await buyPass(owner,product.type,paymentMethod);
        if(accountRef.current!==owner)return;
        purchased.reload();setTab('history');setCheckout(null);setSelectedPass(displayPass(raw));
      } catch(error) {if(accountRef.current===owner)Alert.alert('No se pudo completar la compra',error instanceof Error?error.message:'Intenta nuevamente.');}
      finally {buyingRef.current=false;setBuying(false);}
      return;
    }
    const found=products.find(p=>p.type===product.type)!;
    const raw:PurchasedPass={id:`demo-${Date.now()}`,productId:product.type,name:product.name,description:product.detail,price:found.amount,currency:'COP',purchasedAt:new Date().toISOString(),expiresAt:null,remainingUses:found.uses,status:'pending_activation',activateBefore:new Date(Date.now()+86400000).toISOString(),activatedAt:null,validityDays:found.validityDays,paymentMethod};
    const pass=displayPass(raw);setPasses(current=>[pass,...current]);setSelectedPass(pass);setCheckout(null);setTab('history');
  };
  const activateSelected=async()=>{
    if(!account||!selectedPass?.raw||buyingRef.current)return;
    const owner=account.id,pass=selectedPass.raw;buyingRef.current=true;setBuying(true);
    try{
      const raw:PurchasedPass=USE_DUMMY_DATA?{...pass,status:'active',activatedAt:new Date().toISOString(),expiresAt:pass.validityDays?new Date(Date.now()+pass.validityDays*86400000).toISOString():null}:await activatePass(owner,pass.id);
      if(accountRef.current!==owner)return;
      const updated=displayPass(raw);setSelectedPass(updated);setPasses(current=>current.map(p=>p.id===raw.id?updated:p));purchased.reload();
    }catch(error){if(accountRef.current===owner)Alert.alert('No se pudo activar',error instanceof Error?error.message:'Intenta nuevamente.');}
    finally{buyingRef.current=false;setBuying(false);}
  };

  return (
    <View style={styles.container} onLayout={onViewLayout}>
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
            {!account ? busy === 'restore' ? <DataStatus error={null} retry={() => {}} /> : (
              <Pressable style={styles.signInCard} onPress={() => navigation.navigate('Cuenta')}
                accessibilityRole="button" accessibilityLabel="Ir a Cuenta para iniciar sesión">
                <Ionicons name="person-circle-outline" size={48} color="#1f6feb" />
                <Text style={styles.signInTitle}>{restoreError ? 'Recupera tu sesión' : 'Inicia sesión para ver tus pasabordos'}</Text>
                <Text style={styles.signInBody}>{restoreError ? 'Ve a Cuenta para reintentar y consultar tus pasabordos.' : 'Accede con Google para consultar tus pasabordos vigentes y tu historial.'}</Text>
                <Text style={styles.signInAction}>Ir a Cuenta →</Text>
              </Pressable>
            ) : <>
            {account && !USE_DUMMY_DATA && !purchased.passes && <DataStatus error={purchased.error} retry={purchased.reload} />}
            {account && !USE_DUMMY_DATA && purchased.passes && <Pressable accessibilityRole="button" onPress={purchased.reload}><Text style={styles.productValidity}>Actualizar pasabordos</Text></Pressable>}
            {account && (USE_DUMMY_DATA || purchased.passes) && passes.length === 0 && <Text style={styles.infoText}>Todavía no tienes pasabordos comprados.</Text>}
            <Text style={styles.section}>Por activar</Text>
            {passes.filter(pass=>pass.status==='Por activar').map(pass=><PassCard key={pass.id} pass={pass} onPress={()=>setSelectedPass(pass)}/>)}
            <Text style={styles.section}>Vigentes</Text>
            {passes.filter((pass) => pass.status === 'Vigente').map((pass) => <PassCard key={pass.id} pass={pass} onPress={() => setSelectedPass(pass)} />)}
            <Text style={[styles.section, styles.expiredSection]}>Historial expirado</Text>
            {passes.filter((pass) => (pass.status === 'Expirado' || pass.status === 'Perdido')).map((pass) => <PassCard key={pass.id} pass={pass} onPress={() => setSelectedPass(pass)} />)}
            </>}
          </>
        ) : (
          <>
            <View style={styles.info}><Ionicons name="shield-checkmark-outline" size={24} color="#1f6feb" /><Text style={styles.infoText}>Tu pasabordo queda vinculado a este teléfono. La vigencia comienza cuando lo activas.</Text></View>
            {!productData.data && <DataStatus error={productData.error} retry={productData.reload} />}
            {!USE_DUMMY_DATA && <Text style={[styles.productDetail, { marginBottom: 12 }]}>Compras de prueba: se aprueban automáticamente y no se realiza ningún cobro.</Text>}
            {products.map((product) => <Pressable style={styles.product} key={product.type} disabled={buying||!account} onPress={()=>setCheckout(product)} accessibilityRole="button" accessibilityLabel={`Ver detalle de ${product.name}`}><View style={styles.productIcon}><Ionicons name={product.icon} size={23} color="#1f6feb" /></View><View style={styles.productText}><Text style={styles.productName}>{product.name}</Text><Text style={styles.productDetail}>{product.detail}</Text><Text style={styles.productValidity}>{product.validity} · {product.usageLabel}</Text><Text style={styles.price}>{product.price}</Text></View><Pressable style={[styles.buyButton, (buying || !account) && { opacity: 0.4 }]} disabled={buying || !account} onPress={() => setCheckout(product)} accessibilityLabel={`Comprar ${product.name}`}><Ionicons name="arrow-forward" size={19} color="#fff" /></Pressable></Pressable>)}
          </>
        )}
      </ScrollView>
      {account&&checkout&&<PassCheckout product={checkout} busy={buying} onBack={()=>setCheckout(null)} onConfirm={method=>void buy(checkout,method)}/>}
      <Modal transparent animationType="slide" visible={Boolean(account && selectedPass)} onRequestClose={() => setSelectedPass(null)}>
        <View style={styles.backdrop}><View style={[styles.modal, { paddingBottom: 24 + insets.bottom }]}><View style={styles.handle} /><View style={styles.modalHeader}><View><Text style={styles.eyebrow}>PASABORDO DIGITAL</Text><Text style={styles.modalTitle}>{selectedPass?.name}</Text></View><Pressable onPress={() => setSelectedPass(null)}><Ionicons name="close" size={26} color="#111827" /></Pressable></View><Text style={styles.journey}>{selectedPass?.detail}</Text><Text style={styles.modalMeta}>{selectedPass?.price} · {selectedPass?.validUntil}</Text>{selectedPass?.status==='Por activar'?<View><Text style={styles.infoText}>Tu pase está comprado. Actívalo antes del plazo indicado; desde ese momento comienza su vigencia.</Text><Pressable disabled={buying} accessibilityRole="button" onPress={()=>Alert.alert('Activar pasabordo','La vigencia comenzará ahora y no podrá pausarse.',[{text:'Volver',style:'cancel'},{text:'Activar ahora',onPress:()=>void activateSelected()}])}><Text style={styles.signInAction}>{buying?'Activando…':'Activar pasabordo'}</Text></Pressable></View>:selectedPass?.status === 'Vigente' ? USE_DUMMY_DATA ? <TicketCode value={selectedPass.token} /> : selectedPass.raw ? <DynamicPassQr pass={selectedPass.raw}/> : <Text style={styles.expired}>Este pase antiguo no tiene una instalación vinculada.</Text> : <Text style={styles.expired}>{selectedPass?.status==='Perdido'?'Perdiste este pase porque venció el plazo para activarlo.':'Este pasabordo ya expiró.'}</Text>}{USE_DUMMY_DATA && <View style={styles.validation}><View><Ionicons name="qr-code-outline" size={22} color="#1f6feb" /><Text style={styles.validationTitle}>QR dinámico</Text></View><View><Ionicons name="radio-outline" size={22} color="#0f766e" /><Text style={styles.validationTitle}>NFC listo</Text></View></View>}<Text style={styles.footer}>{USE_DUMMY_DATA ? 'Simulación' : 'Pasabordo'} · {selectedPass?.token}</Text></View></View>
      </Modal>
    </View>
  );
}

function PassCard({ pass, onPress }: { pass: Pass; onPress: () => void }) { const active = pass.status === 'Vigente'; return <Pressable style={styles.card} onPress={onPress}><View style={[styles.stripe, { backgroundColor: active ? '#0f766e' : '#94a3b8' }]} /><View style={styles.cardBody}><View style={styles.cardTop}><Text style={styles.route}>{pass.name}</Text><Text style={[styles.status, active ? styles.active : styles.inactive]}>{pass.status}</Text></View><Text style={styles.journey}>{pass.detail}</Text><Text style={styles.cardUsage}>{pass.usageLabel} · {pass.validUntil}</Text><Text style={styles.date}>{pass.purchasedAt} · {pass.price}</Text></View><Ionicons name="chevron-forward" size={18} color="#94a3b8" /></Pressable>; }

function TicketCode({ value }: { value: string }) { return <View style={styles.codeBox}><View style={styles.codeGrid}>{Array.from({ length: 64 }, (_, index) => <View key={index} style={[styles.codeCell, ((value.charCodeAt(index % value.length) + index * 7) % 5) < 2 && styles.codeCellFilled]} />)}</View><Text style={styles.codeLabel}>Código dinámico del dispositivo</Text></View>; }

const styles = StyleSheet.create({
  signInCard: { backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', padding: 28, alignItems: 'center', gap: 12 },
  signInTitle: { color: '#111827', fontSize: 19, fontWeight: '800', textAlign: 'center' },
  signInBody: { color: '#64748b', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  signInAction: { color: '#1f6feb', fontSize: 15, fontWeight: '700', padding: 12 },
  container: { flex: 1, backgroundColor: '#f8fafc' }, content: { padding: 20, paddingTop: 28 }, eyebrow: { color: '#1f6feb', fontSize: 10, fontWeight: '800', letterSpacing: 1 }, title: { color: '#111827', fontSize: 31, fontWeight: '800', marginTop: 5 }, subtitle: { color: '#64748b', fontSize: 14, marginTop: 7, marginBottom: 20 }, tabs: { flexDirection: 'row', backgroundColor: '#e2e8f0', borderRadius: 14, padding: 4, marginBottom: 24 }, tab: { flex: 1, minHeight: 43, alignItems: 'center', justifyContent: 'center', borderRadius: 11 }, tabActive: { backgroundColor: '#1f6feb' }, tabText: { color: '#64748b', fontSize: 13, fontWeight: '700' }, tabTextActive: { color: '#fff' }, section: { color: '#111827', fontSize: 18, fontWeight: '800', marginBottom: 10 }, expiredSection: { marginTop: 24 }, card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 11, paddingRight: 12 }, stripe: { width: 6, alignSelf: 'stretch' }, cardBody: { flex: 1, padding: 14 }, cardTop: { flexDirection: 'row', alignItems: 'center' }, route: { flex: 1, color: '#111827', fontSize: 14, fontWeight: '800' }, status: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 4, fontSize: 10, fontWeight: '800', overflow: 'hidden' }, active: { color: '#0f766e', backgroundColor: '#ccfbf1' }, inactive: { color: '#64748b', backgroundColor: '#f1f5f9' }, journey: { color: '#475569', fontSize: 13, marginTop: 10 }, cardUsage: { color: '#0f766e', fontSize: 11, fontWeight: '700', marginTop: 7 }, date: { color: '#94a3b8', fontSize: 11, marginTop: 8 }, info: { flexDirection: 'row', backgroundColor: '#eff6ff', borderRadius: 15, padding: 14, marginBottom: 15 }, infoText: { flex: 1, color: '#475569', fontSize: 12, lineHeight: 18, marginLeft: 10 }, product: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', padding: 13, marginBottom: 11 }, productIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' }, productText: { flex: 1, marginLeft: 12 }, productName: { color: '#111827', fontSize: 15, fontWeight: '800' }, productDetail: { color: '#64748b', fontSize: 12, marginTop: 3 }, productValidity: { color: '#0f766e', fontSize: 11, fontWeight: '700', marginTop: 5 }, price: { color: '#1f6feb', fontSize: 15, fontWeight: '800', marginTop: 7 }, buyButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#1f6feb', alignItems: 'center', justifyContent: 'center' }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.42)' }, modal: { backgroundColor: '#f8fafc', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 20 }, handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: '#cbd5e1', marginBottom: 22 }, modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }, modalTitle: { color: '#111827', fontSize: 21, fontWeight: '800', marginTop: 5 }, modalMeta: { color: '#0f766e', fontSize: 13, fontWeight: '700', marginTop: 8 }, validation: { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: '#fff', borderRadius: 15, padding: 16, marginTop: 14 }, validationTitle: { color: '#334155', fontSize: 13, fontWeight: '800', marginTop: 7 }, footer: { color: '#94a3b8', fontSize: 10, textAlign: 'center', marginTop: 16 }, codeBox: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, padding: 16, marginTop: 16 }, codeGrid: { width: 176, height: 176, flexDirection: 'row', flexWrap: 'wrap', padding: 4 }, codeCell: { width: '12.5%', height: '12.5%' }, codeCellFilled: { backgroundColor: '#111827' }, codeLabel: { color: '#64748b', fontSize: 11, marginTop: 10 }, expired: { color: '#64748b', textAlign: 'center', backgroundColor: '#f1f5f9', padding: 30, borderRadius: 15, marginTop: 16 },
});
