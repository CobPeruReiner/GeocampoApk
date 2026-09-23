import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { FieldSessionProvider } from '@/features/field/session';
import { palette } from '@/theme/tokens';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <FieldSessionProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.canvas } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="client/[id]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="client/[id]/history" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="client/[id]/history/[managementId]" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="client/[id]/address" options={{ animation: 'slide_from_right' }} />
          <Stack.Screen name="management/[id]" options={{ animation: 'slide_from_bottom' }} />
        </Stack>
      </FieldSessionProvider>
    </SafeAreaProvider>
  );
}
