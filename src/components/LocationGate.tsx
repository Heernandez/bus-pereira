import React from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocationAccess } from '../context/LocationAccess';

export function LocationGate({ children }: { children: React.ReactNode }) {
  const { state, busy, retry, openSettings, positionError } = useLocationAccess();
  const blocked = state !== 'ready';
  const services = state === 'services-disabled';
  const permanent = state === 'permission-blocked';
  const title = state === 'checking' ? 'Comprobando ubicación' : services ? 'La ubicación del teléfono está apagada' : state === 'error' ? 'No pudimos comprobar la ubicación' : 'Necesitamos el permiso de ubicación';
  const message = services
    ? Platform.OS === 'android' ? 'Activa la ubicación del teléfono para usar el mapa. Al continuar se abrirá la solicitud del sistema.' : 'Activa Localización en Ajustes → Privacidad y seguridad → Localización y vuelve a la app.'
    : permanent ? 'El permiso está bloqueado. Abre Ajustes y permite la ubicación mientras usas la app.'
    : state === 'permission-denied' ? 'Denegaste el permiso de ubicación. Puedes solicitarlo nuevamente para explorar y planear tu viaje.'
    : state === 'error' ? 'Intenta comprobar nuevamente el permiso y el servicio de ubicación.'
    : 'Permite el acceso a tu ubicación para explorar estaciones y planear tu viaje.';
  return <View style={{ flex: 1 }}>
    <View style={{ flex: 1 }} pointerEvents={blocked ? 'none' : 'auto'} accessibilityElementsHidden={blocked} importantForAccessibility={blocked ? 'no-hide-descendants' : 'auto'}>{children}</View>
    {blocked && <View style={styles.overlay} accessibilityViewIsModal>
      <View style={styles.panel}>
        <Text style={styles.title}>{title}</Text>
        {state === 'checking' ? <ActivityIndicator color="#1f6feb" /> : <>
          <Text style={styles.message}>{message}</Text>
          {positionError && <Text style={styles.message}>{positionError}</Text>}
          <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={() => void retry()}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{permanent || (services && Platform.OS === 'ios') ? 'Abrir ajustes' : services ? 'Activar ubicación' : state === 'error' ? 'Reintentar' : 'Pedir permiso nuevamente'}</Text>}
          </Pressable>
          {services && Platform.OS === 'android' && <Pressable accessibilityRole="button" onPress={() => void openSettings()}><Text style={styles.link}>Abrir ajustes de ubicación</Text></Pressable>}
        </>}
      </View>
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'center', paddingHorizontal: 24, paddingBottom: 90, zIndex: 100, elevation: 30 },
  panel: { backgroundColor: '#fff', borderRadius: 22, padding: 24, gap: 16 },
  title: { fontSize: 21, fontWeight: '800', color: '#111827' },
  message: { fontSize: 15, lineHeight: 22, color: '#475569' },
  button: { backgroundColor: '#1f6feb', borderRadius: 12, padding: 15, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  link: { color: '#1f6feb', textAlign: 'center', padding: 8 },
});
