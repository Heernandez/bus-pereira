import React,{useEffect,useState} from 'react';
import {Modal,Platform,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {Ionicons} from '@expo/vector-icons';
import {useSafeAreaInsets} from 'react-native-safe-area-context';
import {getPurchaseOptions,type PaymentMethod,type PurchaseOptions} from '../services/passWallet';
import {USE_DUMMY_DATA} from '../services/transit';
import {GooglePayMark} from './GooglePayMark';
import {StatusBarSpacer} from './StatusBarSpacer';
export type CheckoutProduct={type:string;name:string;price:string;detail:string;validity:string;usageLabel:string};
export function PassCheckout({product,busy,onBack,onConfirm}:{product:CheckoutProduct;busy:boolean;onBack:()=>void;onConfirm:(method:PaymentMethod)=>void}){
 const insets=useSafeAreaInsets();
 const [options,setOptions]=useState<PurchaseOptions|null>(null),[error,setError]=useState<string|null>(null);
 const [other,setOther]=useState(false),[method,setMethod]=useState<PaymentMethod|null>(null),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let active=true;setError(null);setOptions(null);
  const request=USE_DUMMY_DATA?Promise.resolve({activationWindowSeconds:86400,paymentMode:'auto_approve',paymentMethods:['google_pay','apple_pay','card','pse'] as PaymentMethod[]}):getPurchaseOptions();
  request.then(data=>{if(active)setOptions(data);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'No se pudieron cargar las condiciones.');});
  return()=>{active=false;};
 },[attempt]);
 const wallet:PaymentMethod|null=Platform.OS==='ios'?'apple_pay':Platform.OS==='android'?'google_pay':null;
 const labels:Record<PaymentMethod,string>={google_pay:'Google Pay',apple_pay:'Apple Pay',card:'Tarjeta',pse:'PSE'};
 const seconds=options?.activationWindowSeconds??0;
 const window=seconds%3600===0?`${seconds/3600} horas`:seconds%60===0?`${seconds/60} minutos`:`${seconds} segundos`;
 const option=(value:PaymentMethod)=><Pressable key={value} disabled={busy} accessibilityRole="radio" accessibilityLabel={labels[value]} accessibilityState={{checked:method===value}} onPress={()=>setMethod(value)} style={[styles.payment,method===value&&styles.chosen]}>{value==='google_pay'?<GooglePayMark/>:<Text style={styles.name}>{labels[value]}</Text>}<Ionicons name={method===value?'radio-button-on':'radio-button-off'} size={22} color="#1f6feb"/></Pressable>;
 return <Modal visible animationType="slide" onRequestClose={()=>{if(!busy)onBack();}}><View style={styles.page}><StatusBarSpacer/><ScrollView contentContainerStyle={{padding:24,paddingTop:16,paddingBottom:insets.bottom+24}}>
  <Pressable disabled={busy} accessibilityRole="button" onPress={onBack} style={styles.back}><Ionicons name="arrow-back" size={24}/><Text>Volver a los planes</Text></Pressable>
  <Text style={styles.title}>Confirma tu pasabordo</Text>
  <View style={styles.ticket}><Ionicons name="ticket-outline" size={32} color="#1f6feb"/><Text style={styles.name}>{product.name}</Text><Text style={styles.body}>{product.detail}</Text><Text style={styles.body}>{product.validity} desde la activación</Text><Text style={styles.body}>{product.usageLabel}</Text><View style={styles.total}><Text>Total</Text><Text style={styles.price}>{product.price} COP</Text></View></View>
  <Text style={styles.name}>Actívalo cuando vayas a viajar</Text>
  <Text style={styles.body}>{options?`Tendrás ${window} desde la compra para activarlo. Si no lo activas dentro de ese plazo, perderás el pase. La vigencia comienza al activarlo.`:'Cargando plazo de activación…'}</Text>
  {error&&<Pressable accessibilityRole="button" onPress={()=>setAttempt(n=>n+1)}><Text style={styles.error}>{error} Toca para reintentar.</Text></Pressable>}
  <Text style={[styles.name,{marginTop:24}]}>Medio de pago</Text>
  {wallet&&options?.paymentMethods.includes(wallet)&&option(wallet)}
  <Pressable disabled={busy} accessibilityRole="button" onPress={()=>setOther(!other)} style={styles.payment}><Text style={styles.name}>Otros pagos</Text><Ionicons name={other?'chevron-up':'chevron-down'} size={22}/></Pressable>
  {other&&(['card','pse'] as PaymentMethod[]).filter(m=>options?.paymentMethods.includes(m)).map(option)}
  {options?.paymentMode==='auto_approve'&&<Text style={styles.notice}>Modo de prueba: simula el pago elegido. No se abrirá la wallet ni se realizará ningún cobro.</Text>}
  {options?.paymentMode==='disabled'&&<Text style={styles.error}>Las compras no están disponibles en este momento.</Text>}
  <Pressable accessibilityRole="button" disabled={busy||!method||options?.paymentMode!=='auto_approve'} onPress={()=>method&&onConfirm(method)} style={[styles.confirm,(busy||!method||options?.paymentMode!=='auto_approve')&&{opacity:0.4}]}><Text style={styles.confirmText}>{busy?'Procesando…':`Confirmar compra de prueba${method?` · ${labels[method]}`:''}`}</Text></Pressable>
 </ScrollView></View></Modal>;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#f8fafc'},back:{flexDirection:'row',alignItems:'center',gap:10,paddingVertical:12},title:{fontSize:27,fontWeight:'800',marginVertical:20,color:'#111827'},ticket:{padding:22,backgroundColor:'white',borderRadius:20,gap:12,marginBottom:24},name:{fontSize:17,fontWeight:'700',color:'#111827'},body:{fontSize:14,lineHeight:22,color:'#475569',marginTop:8},total:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderTopWidth:1,borderTopColor:'#e2e8f0',paddingTop:16},price:{fontSize:21,fontWeight:'800',color:'#1f6feb'},payment:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',padding:18,borderRadius:12,borderWidth:1,borderColor:'#cbd5e1',marginTop:12,backgroundColor:'white'},chosen:{borderColor:'#1f6feb',backgroundColor:'#eff6ff'},notice:{fontSize:13,lineHeight:20,color:'#475569',marginTop:20},error:{color:'#b91c1c',marginTop:12},confirm:{padding:18,borderRadius:14,backgroundColor:'#1f6feb',marginTop:22,alignItems:'center'},confirmText:{color:'white',fontWeight:'800',fontSize:16}});
