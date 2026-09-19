import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '';

type Account = {
  name: string;
  email: string;
  picture: string;
  provider: 'mock' | 'google';
};

export function AccountScreen() {
  const insets = useSafeAreaInsets();
  const [account, setAccount] = useState<Account | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: googleWebClientId || undefined,
      offlineAccess: true,
    });
    setIsConfigured(Boolean(googleWebClientId));
  }, []);

  const signIn = async () => {
    if (!isConfigured) {
      Alert.alert(
        'Google aún no configurado',
        'Agrega los client IDs en .env.local y reinicia Metro para probar el OAuth real.',
      );
      return;
    }

    try {
      await GoogleSignin.hasPlayServices();
      const result = await GoogleSignin.signIn();

      if (isSuccessResponse(result)) {
        setAccount({
          name: result.data.user.name ?? 'Usuario Google',
          email: result.data.user.email,
          picture: result.data.user.photo ?? 'google',
          provider: 'google',
        });
      }
    } catch (error) {
      console.error('[GoogleAuth] Error de Google Sign-In nativo', error);
      Alert.alert('No se pudo iniciar sesión', 'Google canceló o rechazó la autenticación.');
    }
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        { paddingTop: 28 + insets.top, paddingBottom: 104 + insets.bottom },
      ]}
    >
      <Text style={styles.eyebrow}>TU CUENTA</Text>
      <Text style={styles.title}>Cuenta</Text>
      <Text style={styles.subtitle}>Administra tu identidad y el dispositivo asociado.</Text>

      {account ? (
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{account.name.charAt(0)}</Text>
          </View>
          <View style={styles.profileText}>
            <Text style={styles.profileName}>{account.name}</Text>
            <Text style={styles.profileEmail}>{account.email}</Text>
            <View style={styles.connectedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#0f766e" />
              <Text style={styles.connectedText}>Google conectado</Text>
            </View>
          </View>
          <Pressable onPress={() => setAccount(null)} accessibilityLabel="Cerrar sesión">
            <Ionicons name="log-out-outline" size={22} color="#64748b" />
          </Pressable>
        </View>
      ) : (
        <View style={styles.loginPanel}>
          <View style={styles.googleIcon}><Text style={styles.googleG}>G</Text></View>
          <Text style={styles.loginTitle}>Inicia sesión para continuar</Text>
          <Text style={styles.loginBody}>Tu cuenta permitirá asociar pasabordos y un único dispositivo autorizado.</Text>
          <Pressable
            style={[styles.googleButton, !isConfigured && styles.googleButtonDisabled]}
            onPress={signIn}
            disabled={!isConfigured}
          >
            <Ionicons name="logo-google" size={19} color="#fff" />
            <Text style={styles.googleButtonText}>Continuar con Google</Text>
          </Pressable>
          <Text style={styles.configHint}>
            {isConfigured ? 'Selector nativo de Google preparado.' : 'Modo preparación: falta el Web Client ID.'}
          </Text>
        </View>
      )}

      <Text style={styles.sectionTitle}>Seguridad del dispositivo</Text>
      <View style={styles.securityCard}>
        <View style={styles.securityIcon}><Ionicons name="phone-portrait-outline" size={22} color="#1f6feb" /></View>
        <View style={styles.securityText}>
          <Text style={styles.securityTitle}>Un dispositivo por cuenta</Text>
          <Text style={styles.securityBody}>El backend deberá registrar el identificador del dispositivo y firmar los tickets para evitar capturas reutilizadas.</Text>
        </View>
      </View>

      <View style={styles.securityCard}>
        <View style={[styles.securityIcon, styles.greenIcon]}><Ionicons name="shield-checkmark-outline" size={22} color="#0f766e" /></View>
        <View style={styles.securityText}>
          <Text style={styles.securityTitle}>Sesión segura</Text>
          <Text style={styles.securityBody}>La app no almacenará secretos de Google. El intercambio de tokens y la validación de tickets deben vivir en el backend.</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  content: { padding: 20, paddingTop: 28 },
  eyebrow: { color: '#1f6feb', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title: { color: '#111827', fontSize: 31, fontWeight: '800', marginTop: 5 },
  subtitle: { color: '#64748b', fontSize: 14, lineHeight: 21, marginTop: 7, marginBottom: 22 },
  loginPanel: { alignItems: 'center', backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: '#e2e8f0', padding: 24 },
  googleIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  googleG: { color: '#4285f4', fontSize: 31, fontWeight: '800' },
  loginTitle: { color: '#111827', fontSize: 19, fontWeight: '800', textAlign: 'center' },
  loginBody: { color: '#64748b', fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 8, marginBottom: 19 },
  googleButton: { width: '100%', minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, backgroundColor: '#1f6feb', borderRadius: 13 },
  googleButtonDisabled: { opacity: 0.55 },
  googleButtonText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  configHint: { color: '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: 12 },
  profileCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#e2e8f0', padding: 15 },
  avatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#1f6feb', fontSize: 22, fontWeight: '800' },
  profileText: { flex: 1, marginLeft: 12 },
  profileName: { color: '#111827', fontSize: 16, fontWeight: '800' },
  profileEmail: { color: '#64748b', fontSize: 12, marginTop: 3 },
  connectedBadge: { flexDirection: 'row', alignItems: 'center', marginTop: 7 },
  connectedText: { color: '#0f766e', fontSize: 11, fontWeight: '700', marginLeft: 4 },
  sectionTitle: { color: '#111827', fontSize: 18, fontWeight: '800', marginTop: 28, marginBottom: 10 },
  securityCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#e2e8f0', padding: 14, marginBottom: 10 },
  securityIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center' },
  greenIcon: { backgroundColor: '#ccfbf1' },
  securityText: { flex: 1, marginLeft: 11 },
  securityTitle: { color: '#334155', fontSize: 14, fontWeight: '800' },
  securityBody: { color: '#64748b', fontSize: 12, lineHeight: 18, marginTop: 4 },
});
