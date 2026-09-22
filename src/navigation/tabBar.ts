import type { ViewStyle } from 'react-native';

// Shared with any screen that needs to hide the tab bar (e.g. a full-screen
// detail view) and later restore the exact same look the navigator started with.
export const getTabBarStyle = (insetsBottom: number): ViewStyle => ({
  height: 78 + insetsBottom,
  paddingBottom: Math.max(insetsBottom + 8, 10),
  paddingTop: 8,
  borderTopLeftRadius: 22,
  borderTopRightRadius: 22,
  borderTopWidth: 0,
  backgroundColor: '#ffffff',
  position: 'absolute',
  left: 0,
  right: 0,
  bottom: 0,
  shadowColor: '#000',
  shadowOpacity: 0.08,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: -2 },
  elevation: 8,
});
