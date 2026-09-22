import React, { useEffect, useState } from 'react';
import { AppState, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import type { PurchasedPass } from '../services/startup';
import { prepareQr } from '../services/passWallet';
export function DynamicPassQr({ pass }: { pass: PurchasedPass }) {
 const [qr,setQr]=useState(''),[error,setError]=useState<string|null>(null);
 useEffect(()=>{
  let active=true, generation=0;let timer:ReturnType<typeof setInterval>|undefined;
  const clear=()=>{if(timer)clearInterval(timer);timer=undefined;setQr('');};
  const start=async()=>{const current=++generation;clear();setError(null);try{
   const make=await prepareQr(pass);if(!active||current!==generation||AppState.currentState!=='active')return;
   const refresh=()=>{try{setQr(make());}catch(e){clear();setError(e instanceof Error?e.message:'No se pudo generar el QR.');}};
   refresh();timer=setInterval(refresh,15000);
  }catch(e){if(active&&current===generation)setError(e instanceof Error?e.message:'No se pudo generar el QR.');}};
  void start();const subscription=AppState.addEventListener('change',state=>{generation++;clear();if(state==='active')void start();});
  return()=>{active=false;generation++;if(timer)clearInterval(timer);subscription.remove();};
 },[pass.id]);
 return <View style={{alignItems:'center',backgroundColor:'white',padding:20,marginTop:16,borderRadius:16}}>{qr?<QRCode value={qr} size={240}/>:<Text>{error??'Preparando QR…'}</Text>}<Text style={{marginTop:12,color:'#475569'}}>Se renueva cada 15 segundos. Presenta el QR desde este teléfono.</Text></View>;
}
