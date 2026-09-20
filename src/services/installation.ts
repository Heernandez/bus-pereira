import { startupSpan } from './startupTiming';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { randomUUID } from 'expo-crypto';
import { createInstallationIdentity } from './installationIdentity';

const loadIdentity = createInstallationIdentity(AsyncStorage, randomUUID);
export async function getInstallationId() {
  const finish = startupSpan('Instalación: leer o crear UUID');
  try { const id = await loadIdentity(); finish(); return id; }
  catch (error) { finish('error'); throw error; }
}
