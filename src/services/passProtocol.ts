import { p256 } from '@noble/curves/nist.js';
export const base64url = (bytes: Uint8Array) => btoa(Array.from(bytes, b => String.fromCharCode(b)).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const decode64 = (value: string) => Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
export function devicePublicKey(secret: Uint8Array) {
  const prefix = Uint8Array.from('3059301306072a8648ce3d020106082a8648ce3d030107034200'.match(/../g)!, h => parseInt(h, 16));
  const raw = p256.getPublicKey(secret, false);
  const spki = new Uint8Array(prefix.length + raw.length); spki.set(prefix); spki.set(raw, prefix.length);
  return base64url(spki);
}
export const signDevice = (message: string, secret: Uint8Array) => base64url(p256.sign(new TextEncoder().encode(message), secret));
export const registrationMessage = (id: string, publicKey: string) => `bus-pereira:installation:v1\n${id}\n${publicKey}`;
export const purchaseMessage = (id: string, product: string, request: string, method?: string) => method ? `bus-pereira:purchase:v2\n${id}\n${product}\n${request}\n${method}` : `bus-pereira:purchase:v1\n${id}\n${product}\n${request}`;
export const activationMessage = (passId: string, id: string) => `bus-pereira:activate:v1\n${passId}\n${id}`;
export function createPassQr(passId: string, installationId: string, issuedAt: number, nonce: string, secret: Uint8Array) {
  const payload = JSON.stringify({ v: 1, passId, installationId, issuedAt, nonce });
  const message = `BP1.${base64url(new TextEncoder().encode(payload))}`;
  return `${message}.${signDevice(message, secret)}`;
}
