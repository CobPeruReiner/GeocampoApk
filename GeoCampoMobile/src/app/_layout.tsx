import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { FieldSessionProvider } from '@/features/field/session';
import { palette } from '@/theme/tokens';

export default function RootLayout() {
  return (
    <FieldSessionProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.canvas } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="client/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="management/[id]" options={{ animation: 'slide_from_bottom' }} />
      </Stack>
    </FieldSessionProvider>
  );
}
