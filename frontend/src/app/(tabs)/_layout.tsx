import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { palette } from '@/theme/tokens';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
const tabs = { home: ['Inicio', 'home-outline'], route: ['Mi ruta', 'git-network-outline'], search: ['Consultar', 'search-outline'], history: ['Historial', 'time-outline'], profile: ['Perfil', 'person-outline'] } as const;
export default function TabsLayout() { const insets = useSafeAreaInsets(); const height = 58 + Math.max(insets.bottom, 6); return <Tabs screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: palette.red, tabBarInactiveTintColor: '#77716B', tabBarStyle: { height, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 6), backgroundColor: palette.surface, borderTopColor: palette.line }, tabBarItemStyle: { minWidth: 0 }, tabBarLabelStyle: { fontWeight: '700', fontSize: 11 }, tabBarIconStyle: { marginBottom: -2 }, tabBarIcon: ({ color, size }) => <Ionicons name={tabs[route.name as keyof typeof tabs][1]} size={size} color={color} /> })}>{Object.entries(tabs).map(([name, [title]]) => <Tabs.Screen key={name} name={name} options={{ title }} />)}</Tabs>; }
