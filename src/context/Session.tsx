import { startupSpan } from '../services/startupTiming';
import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';

type SessionState = { account: Account | null; busy: 'restore' | 'signIn' | 'signOut' | null; isConfigured: boolean; restoreError: boolean; restoreSession: () => Promise<void>; signIn: () => Promise<void>; signOut: () => Promise<void> };
const SessionContext = createContext<SessionState | null>(null);
export function useSession() { const value = useContext(SessionContext); if (!value) throw new Error('SessionProvider requerido'); return value; }
const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

type Account = {
  id: string;
  name: string;
  email: string;
  picture: string;
  provider: 'mock' | 'google';
};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const isConfigured = Boolean(googleWebClientId);
  const [busy, setBusy] = useState<'restore' | 'signIn' | 'signOut' | null>('restore');
  const [restoreError, setRestoreError] = useState(false);
  const operation = useRef(false);
  const mounted = useRef(false);

  const restoreSession = async () => {
    if (operation.current) return;
    operation.current = true;
    const finish = startupSpan('Google: restaurar sesión');
    setBusy('restore');
    setRestoreError(false);
    try {
      if (!isConfigured) { finish('sin configuración'); return; }
      const result = await GoogleSignin.signInSilently();
      finish(result.type === 'success' ? 'sesión recuperada' : 'sin sesión');
      if (mounted.current) setAccount(result.type === 'success' ? {
        id: result.data.user.id,
        name: result.data.user.name ?? 'Usuario Google',
        email: result.data.user.email,
        picture: result.data.user.photo ?? 'google',
        provider: 'google',
      } : null);
    } catch {
      finish('error');
      if (mounted.current) setRestoreError(true);
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  useEffect(() => {
    mounted.current = true;
    if (isConfigured) {
      GoogleSignin.configure({ webClientId: googleWebClientId, offlineAccess: true });
    }
    void restoreSession();
  return () => { mounted.current = false; };
  }, []);

  const signIn = async () => {
    if (operation.current) return;
    if (!isConfigured) {
      Alert.alert(
        'Google aún no configurado',
        'Agrega los client IDs en .env.local y reinicia Metro para probar el OAuth real.',
      );
      return;
    }

    operation.current = true;
    setBusy('signIn');
    setRestoreError(false);
    try {
      await GoogleSignin.hasPlayServices();
      const result = await GoogleSignin.signIn();

      if (mounted.current && isSuccessResponse(result)) {
        setAccount({
          id: result.data.user.id,
          name: result.data.user.name ?? 'Usuario Google',
          email: result.data.user.email,
          picture: result.data.user.photo ?? 'google',
          provider: 'google',
        });
      }
    } catch {
      Alert.alert('No se pudo iniciar sesión', 'No pudimos completar la conexión con Google. Intenta nuevamente.');
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(null);
    }
  };

  const signOut = async () => {
    if (operation.current) return;
    operation.current = true;
    setBusy('signOut');
    try {
      await GoogleSignin.signOut();
      if (mounted.current) setAccount(null);
    } catch {
      Alert.alert('No se pudo cerrar sesión', 'Intenta nuevamente. Tu sesión sigue abierta.');
    } finally {
      operation.current = false;
      if (mounted.current) setBusy(null);
    }
  };

    return <SessionContext.Provider value={{ account, busy, isConfigured, restoreError, restoreSession, signIn, signOut }}>{children}</SessionContext.Provider>;
}
