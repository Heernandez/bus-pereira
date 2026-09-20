import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

// Ordinary React overlay: unlike the native splash, this does not block map drawing.
export function StartupCover({ onLayout, onImageReady }: { onLayout: () => void; onImageReady: () => void }) {
  return <View onLayout={onLayout} style={styles.cover} accessibilityViewIsModal accessibilityLabel="Cargando Mi Ruta">
    <Image source={require('../../assets/splash-icon.png')} style={styles.logo} resizeMode="contain"
      onLoad={onImageReady} onError={onImageReady} />
  </View>;
}
const styles = StyleSheet.create({
  cover: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: '#0b6f50', alignItems: 'center', justifyContent: 'center', zIndex: 900, elevation: 90 },
  logo: { width: 200, height: 200 },
});
