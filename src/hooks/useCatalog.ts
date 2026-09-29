import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { getRandomBytes } from 'expo-crypto';
import { createCatalogCache } from '../services/catalogCache';
import { createCatalogStore } from '../services/catalogStore';
import { getCatalog, getCatalogRelease } from '../services/transit';

const store = createCatalogStore({
  cache: createCatalogCache({
    storage: AsyncStorage,
    secrets: {
      getItemAsync: key => SecureStore.getItemAsync(key),
      setItemAsync: (key, value) => SecureStore.setItemAsync(key, value, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }),
    },
    randomBytes: getRandomBytes,
  }),
  fetchCatalog: () => getCatalog(),
  fetchRelease: () => getCatalogRelease(),
});

// Stations, stops and routes shared by every screen, served from the encrypted local copy.
export function useCatalog() {
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  useEffect(() => { store.start(); }, []);
  return { data: state.data, error: state.error, reload: store.reload };
}
