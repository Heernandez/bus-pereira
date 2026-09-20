type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<unknown> };
const KEY = 'bus-pereira:installation-id:v1';
const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createInstallationIdentity(storage: Storage, randomUUID: () => string) {
  let pending: Promise<string> | undefined;
  return () => {
    if (!pending) pending = (async () => {
      const stored = await storage.getItem(KEY);
      if (stored && uuidV4.test(stored)) return stored;
      const id = randomUUID();
      if (!uuidV4.test(id)) throw new Error('UUID de instalación no válido');
      // Never send an identity that has not been persisted successfully.
      await storage.setItem(KEY, id);
      return id;
    })().catch(error => { pending = undefined; throw error; });
    return pending;
  };
}
