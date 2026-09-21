import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { palette } from '@/theme/tokens';
import { useFieldSession } from '@/features/field/session';
const tabs = { home: ['Inicio', 'home-outline'], route: ['Mi ruta', 'git-network-outline'], search: ['Consultar', 'search-outline'], history: ['Historial', 'time-outline'], profile: ['Perfil', 'person-outline'] } as const;
export default function TabsLayout() { return <Tabs screenOptions={({ route }) => ({ headerShown: false, tabBarActiveTintColor: palette.red, tabBarInactiveTintColor: '#77716B', tabBarStyle: { height: 68, paddingTop: 7, backgroundColor: palette.surface, borderTopColor: palette.line }, tabBarLabelStyle: { fontWeight: '700', fontSize: 11 }, tabBarIcon: ({ color, size }) => <Ionicons name={tabs[route.name as keyof typeof tabs][1]} size={size} color={color} /> })}>{Object.entries(tabs).map(([name, [title]]) => <Tabs.Screen key={name} name={name} options={{ title }} />)}</Tabs>; }
