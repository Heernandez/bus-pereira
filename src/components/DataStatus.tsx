import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
export function DataStatus({ error, retry }: { error: string | null; retry: () => void }) {
  return <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
    {error ? <><Text style={{ color: '#475569', textAlign: 'center' }}>{error}</Text><Pressable accessibilityRole="button" onPress={retry}><Text style={{ color: '#1f6feb', padding: 12, fontWeight: '700' }}>Reintentar</Text></Pressable></> : <><ActivityIndicator color="#1f6feb" /><Text>Cargando información…</Text></>}
  </View>;
}
