import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Android/iOS no longer let a screen render a solid, non-transparent status
// bar (edge-to-edge is mandatory), so we fake one: a black block sized to the
// inset, with light system icons on top of it. Use as the first child of a
// screen's outer column, and drop the screen's own `+ insets.top` padding —
// this block already reserves that space.
export function StatusBarSpacer() {
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  return <>
    {focused && <StatusBar style="light" />}
    <View style={{ height: insets.top, backgroundColor: '#000' }} />
  </>;
}
