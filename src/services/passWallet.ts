import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getRandomBytes, randomUUID } from 'expo-crypto';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { getInstallationId } from './installation';
import { API_URL } from './transit';
import type { PurchasedPass } from './startup';
import { base64url, decode64, devicePublicKey, signDevice, registrationMessage, purchaseMessage, activationMessage, createPassQr } from './passProtocol';
const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const storageKey = (owner: string, suffix: string) => `bp.passes.${base64url(new TextEncoder().encode(owner))}.${suffix}`;
let identityPromise: Promise<{ id: string; secret: Uint8Array; publicKey: string }> | undefined;
async function identity() {
  if (!identityPromise) identityPromise = (async () => {
    const id = await getInstallationId();
    const key = `bp.installation.${id}.secret`;
    let stored = await SecureStore.getItemAsync(key);
    if (!stored) { stored = base64url(getRandomBytes(32)); await SecureStore.setItemAsync(key, stored, options); }
    const secret = decode64(stored);
    return { id, secret, publicKey: devicePublicKey(secret) };
  })().catch(error => { identityPromise = undefined; throw error; });
  return identityPromise;
}
async function api<T>(path: string, body?: unknown): Promise<T> {
  if (!API_URL) throw new Error('Falta configurar el servicio de pasabordos.');
  const { idToken } = await GoogleSignin.getTokens();
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${API_URL}${path}`, { method: body ? 'POST' : 'GET', signal: controller.signal, headers: { Authorization: `Bearer ${idToken}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error?.message ?? 'No se pudo completar la compra.');
    return result;
  } finally { clearTimeout(timer); }
}
export async function savePasses(owner: string, passes: PurchasedPass[]) {
  for (const pass of passes) await SecureStore.setItemAsync(storageKey(owner, pass.id), JSON.stringify(pass), options);
  // The manifest contains only IDs. Pass details and signing key are encrypted.
  await AsyncStorage.setItem(storageKey(owner, 'index'), JSON.stringify(passes.map(p => p.id)));
}
export async function loadPasses(owner: string): Promise<PurchasedPass[]> {
  const ids: string[] = JSON.parse(await AsyncStorage.getItem(storageKey(owner, 'index')) ?? '[]');
  const passes = await Promise.all(ids.map(async id => { const value = await SecureStore.getItemAsync(storageKey(owner, id)); return value ? JSON.parse(value) as PurchasedPass : null; }));
  return passes.filter((p): p is PurchasedPass => p !== null).map(p => ({ ...p, status: p.status==='pending_activation' && p.activateBefore && Date.parse(p.activateBefore)<=Date.now() ? 'activation_expired' : p.remainingUses === 0 || (p.expiresAt !== null && Date.parse(p.expiresAt) <= Date.now()) ? 'expired' : p.status }));
}
export type PaymentMethod = 'google_pay' | 'apple_pay' | 'card' | 'pse';
export type PurchaseOptions = {activationWindowSeconds:number;paymentMode:string;paymentMethods:PaymentMethod[]};
export async function getPurchaseOptions() {return (await api<{data:PurchaseOptions}>('/me/passes/purchase-options')).data;}
export async function buyPass(owner: string, productId: string, paymentMethod: PaymentMethod = 'card'): Promise<PurchasedPass> {
  const d = await identity();
  await api('/me/installations', { installationId: d.id, publicKey: d.publicKey, signature: signDevice(registrationMessage(d.id, d.publicKey), d.secret) });
  const pendingKey = storageKey(owner, `pending.${productId}`);
  const saved=await SecureStore.getItemAsync(pendingKey);
  const pending: {requestId:string;paymentMethod?:PaymentMethod} = saved ? (saved.startsWith('{')?JSON.parse(saved):{requestId:saved}) : {requestId:randomUUID(),paymentMethod};
  if(pending.paymentMethod && pending.paymentMethod!==paymentMethod)throw new Error('Hay una compra pendiente con otro medio de pago. Reintenta con el medio elegido inicialmente.');
  const requestId=pending.requestId;
  if(!saved)await SecureStore.setItemAsync(pendingKey,JSON.stringify(pending),options);
  const result = await api<{ data: { pass: PurchasedPass } }>('/me/passes/purchases', { installationId: d.id, productId, requestId, ...(pending.paymentMethod?{paymentMethod:pending.paymentMethod}:{}), signature: signDevice(purchaseMessage(d.id, productId, requestId,pending.paymentMethod), d.secret) });
  const old = await loadPasses(owner);
  await savePasses(owner, [result.data.pass, ...old.filter(p => p.id !== result.data.pass.id)]);
  await SecureStore.deleteItemAsync(pendingKey);
  return result.data.pass;
}
export async function activatePass(owner:string,passId:string):Promise<PurchasedPass>{
  const d=await identity();
  const result=await api<{data:{pass:PurchasedPass}}>(`/me/passes/${encodeURIComponent(passId)}/activate`,{installationId:d.id,signature:signDevice(activationMessage(passId,d.id),d.secret)});
  const old=await loadPasses(owner);await savePasses(owner,[result.data.pass,...old.filter(p=>p.id!==passId)]);
  return result.data.pass;
}
export async function prepareQr(pass: PurchasedPass) {
  if(pass.status!=='active')throw new Error('Activa el pasabordo antes de mostrar el QR.');
  const d = await identity();
  if (!pass.installationId || d.id !== pass.installationId) throw new Error('Este pasabordo solo puede mostrarse en la instalación donde se compró.');
  const result = await api<{ data: { serverTime: string } }>('/me/passes/clock');
  const serverTime = Date.parse(result.data.serverTime), monotonicStart = performance.now();
  if (!Number.isFinite(serverTime)) throw new Error('No se pudo sincronizar la hora.');
  return () => {
    const now = Math.floor(serverTime + performance.now() - monotonicStart);
    if (pass.remainingUses === 0 || (pass.expiresAt && now >= Date.parse(pass.expiresAt))) throw new Error('Este pasabordo ya expiró.');
    return createPassQr(pass.id, d.id, now, randomUUID(), d.secret);
  };
}
