export type AccessState = 'checking' | 'permission-required' | 'permission-denied' | 'permission-blocked' | 'services-disabled' | 'ready' | 'error';
export type Permission = { granted: boolean; canAskAgain: boolean; status: string };
export type LocationAdapter = {
  permission: () => Promise<Permission>;
  requestPermission: () => Promise<Permission>;
  servicesEnabled: () => Promise<boolean>;
  enableServices: () => Promise<void>;
};

// Native operations are injected so denial/cancellation paths can be verified.
export async function resolveLocationAccess(adapter: LocationAdapter, request = false): Promise<AccessState> {
  let permission = await adapter.permission();
  if (!permission.granted && request && permission.canAskAgain) {
    permission = await adapter.requestPermission();
  }
  if (!permission.granted) {
    if (!permission.canAskAgain) return 'permission-blocked';
    return permission.status === 'undetermined' ? 'permission-required' : 'permission-denied';
  }
  if (!(await adapter.servicesEnabled())) {
    if (request) {
      try { await adapter.enableServices(); } catch { /* User may cancel the native dialog. */ }
    }
    if (!(await adapter.servicesEnabled())) return 'services-disabled';
  }
  return 'ready';
}
