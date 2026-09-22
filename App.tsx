import React from 'react';
import { useViewTiming } from './src/hooks/useViewTiming';
import { startupLog } from './src/services/startupTiming';
import * as SplashScreen from 'expo-splash-screen';

startupLog('Splash: solicitando retención');
void SplashScreen.preventAutoHideAsync().then(() => startupLog('Splash: retención confirmada')).catch(() => startupLog('Splash: error de retención'));
import { SessionProvider } from './src/context/Session';
import { OpeningProvider } from './src/context/Opening';
import { OpeningCampaign } from './src/components/OpeningCampaign';
import { StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, useIsFocused } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { LocationAccessProvider } from './src/context/LocationAccess';
import { getTabBarStyle } from './src/navigation/tabBar';
import { StatusBarSpacer } from './src/components/StatusBarSpacer';

import { ExploreScreen } from './src/screens/ExploreScreen';
import { TripScreen } from './src/screens/TripScreen';
import { AccountScreen } from './src/screens/AccountScreen';
import { PassScreen } from './src/screens/PassScreen';

type RootTabParamList = {
  Explorar: undefined;
  Viaje: undefined;
  RutasFavoritas: undefined;
  Pasabordo: undefined;
  Cuenta: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

function PlaceholderScreen({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  const onViewLayout = useViewTiming('Rutas favoritas', useIsFocused());
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.placeholderWrap}>
      <StatusBarSpacer />
      <View onLayout={onViewLayout}
        style={[
          styles.placeholderContainer,
          { paddingTop: 24, paddingBottom: insets.bottom + 96 },
        ]}
      >
        <View style={styles.iconCircle}>
          <Ionicons name={icon} size={32} color="#1f6feb" />
        </View>
        <Text style={styles.placeholderTitle}>{title}</Text>
        <Text style={styles.placeholderSubtitle}>{subtitle}</Text>
      </View>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <OpeningProvider renderOpening={(campaign, _loading, dismiss) => <OpeningCampaign key={campaign?.id ?? 'loading'} campaign={campaign} dismiss={dismiss} />}>
          <LocationAccessProvider><AppContent /></LocationAccessProvider>
        </OpeningProvider>
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function AppContent() {
  const insets = useSafeAreaInsets();

  return (
    <NavigationContainer onReady={() => startupLog('Navegación: lista')}>
      <Tab.Navigator
        initialRouteName="Explorar"
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: getTabBarStyle(insets.bottom),
          tabBarActiveTintColor: '#1f6feb',
          tabBarInactiveTintColor: '#64748b',
          tabBarLabelStyle: styles.tabLabel,
          tabBarIcon: ({ color, size, focused }) => {
            const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
              Explorar: 'navigate',
              Viaje: 'ticket',
              RutasFavoritas: 'star',
              Pasabordo: 'card',
              Cuenta: 'person',
            };

            const iconName = iconMap[route.name] ?? 'ellipse';
            return <Ionicons name={iconName} size={size} color={focused ? '#1f6feb' : color} />;
          },
        })}
      >
        <Tab.Screen
          name="Explorar"
          component={ExploreScreen}
          options={{ tabBarLabel: 'Explorar' }}
        />
        <Tab.Screen
          name="Viaje"
          component={TripScreen}
          options={{
            tabBarLabel: 'Viaje',
          }}
        />
        <Tab.Screen
          name="RutasFavoritas"
          options={{ tabBarLabel: 'Rutas Favoritas' }}
        >
          {() => (
            <PlaceholderScreen
              title="Rutas favoritas"
              subtitle="Guarda tus recorridos preferidos para acceder rápido."
              icon="star"
            />
          )}
        </Tab.Screen>
        <Tab.Screen
          name="Pasabordo"
          component={PassScreen}
          options={{ tabBarLabel: 'Pasabordo' }}
        />
        <Tab.Screen
          name="Cuenta"
          component={AccountScreen}
          options={{ tabBarLabel: 'Cuenta' }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
  },
  placeholderWrap: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  placeholderContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#dbeafe',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  placeholderTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  placeholderSubtitle: {
    fontSize: 15,
    color: '#64748b',
    textAlign: 'center',
    lineHeight: 22,
  },
});
