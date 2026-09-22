import { API_URL, request, USE_DUMMY_DATA } from './transit';

export type Campaign = { id: string; imageUrl: string; durationSeconds: number; accessibilityLabel: string; maxViewsPerDevice: number };
export type PurchasedPass = {
  id: string; productId: string; name: string; description: string;
  price: number; currency: 'COP'; purchasedAt: string; expiresAt: string | null;
  remainingUses: number | null; status: 'pending_activation' | 'activation_expired' | 'active' | 'expired';
  activatedAt?: string | null; activateBefore?: string | null; validityDays?: number | null; activationWindowSeconds?: number | null; paymentMethod?: string;
  installationId?: string; paymentMode?: string; paymentStatus?: string;
};
export function parseCampaign(value: unknown): Campaign | null {
  if (value === null) return null;
  const item = value as { id: string; name: string; imageUrl: string; displaySeconds: number; maxViewsPerDevice: number };
  if (!item || typeof item.id !== 'string' || !item.id || typeof item.imageUrl !== 'string' ||
      !item.imageUrl || !Number.isFinite(item.displaySeconds) || item.displaySeconds <= 0 || typeof item.name !== 'string' ||
      !Number.isSafeInteger(item.maxViewsPerDevice) || item.maxViewsPerDevice < 0) {
    throw new Error('Campaña no válida');
  }
  const imageUrl = new URL(item.imageUrl, API_URL);
  if (!['http:', 'https:'].includes(imageUrl.protocol)) throw new Error('Imagen de campaña no válida');
  return { id: item.id, imageUrl: imageUrl.toString(), durationSeconds: item.displaySeconds, accessibilityLabel: item.name, maxViewsPerDevice: item.maxViewsPerDevice };
}
export function parseCampaigns(value: unknown): Campaign[] {
  if (value === null) return [];
  if (!Array.isArray(value)) throw new Error('Se esperaba la lista completa de campañas');
  const campaigns = value.map(item => {
    const campaign = parseCampaign(item);
    if (!campaign) throw new Error('Campaña no válida');
    return campaign;
  });
  if (new Set(campaigns.map(item => item.id)).size !== campaigns.length) throw new Error('UUID de campaña duplicado');
  return campaigns;
}
export async function getOpeningCampaign(installationId: string, platform: 'ANDROID' | 'IOS') {
  if (USE_DUMMY_DATA) return [];
  const response = await request<{ data: unknown }>('/campaigns/active', undefined, { 'X-Installation-ID': installationId, 'X-Platform': platform });
  return parseCampaigns(response.data);
}
// Retain even a failed result: retrying this GET would count another view.
export function createOpeningCampaignLoader(getInstallationId: () => Promise<string>, platform: string) {
  let pending: Promise<Campaign[]> | undefined;
  return () => pending ??= USE_DUMMY_DATA || (platform !== 'android' && platform !== 'ios') ? Promise.resolve([]) : getInstallationId().then(id => getOpeningCampaign(id, platform === 'android' ? 'ANDROID' : 'IOS'));
}
export async function getMyPasses(token: string, signal: AbortSignal): Promise<PurchasedPass[]> {
  if (USE_DUMMY_DATA) return [];
  const response = await request<{ data: { passes: PurchasedPass[] } }>('/me/passes', signal, { Authorization: `Bearer ${token}` });
  if (!Array.isArray(response.data.passes) || response.data.passes.some(pass =>
    !pass || typeof pass.id !== 'string' || typeof pass.name !== 'string' || typeof pass.description !== 'string' ||
    typeof pass.productId !== 'string' || !['pending_activation', 'activation_expired', 'active', 'expired'].includes(pass.status) ||
    pass.currency !== 'COP' || !Number.isFinite(pass.price) || !Number.isFinite(Date.parse(pass.purchasedAt)) ||
    (pass.expiresAt !== null && !Number.isFinite(Date.parse(pass.expiresAt))) ||
    (pass.remainingUses !== null && (!Number.isInteger(pass.remainingUses) || pass.remainingUses < 0)))) {
    throw new Error('La respuesta de pasabordos no es válida.');
  }
  return response.data.passes;
}
