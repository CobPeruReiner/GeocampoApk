import { Ionicons } from '@expo/vector-icons';
import { Link, router } from 'expo-router';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RouteVisit } from './data';
import { currency } from './data';
import { useFieldSession } from './session';
import { palette, radius } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];
export const Icon = ({ name, size = 21, color = palette.ink }: { name: IconName; size?: number; color?: string }) => <Ionicons name={name} size={size} color={color} />;
export function Page({ children }: { children: ReactNode }) { return <SafeAreaView style={styles.page} edges={['top']}><View style={styles.content}>{children}</View></SafeAreaView>; }

export function AppHeader() {
  const { started, profile, selectedPortfolio } = useFieldSession();
  const initials = (profile?.name || '').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'GC';
  return <View style={styles.header}><View style={styles.brandMark}><Text style={styles.brandInitials}>GC</Text></View><View style={styles.brandText}><Text style={styles.brandName}>GEOCAMPO</Text><Text style={styles.zone}>{selectedPortfolio?.name || 'Sin cartera asignada'}</Text></View><View style={[styles.gps, !started && styles.gpsMuted]}><View style={[styles.gpsDot, !started && styles.gpsDotMuted]} /><Text style={[styles.gpsText, !started && styles.gpsTextMuted]}>{started ? 'GPS activo' : 'GPS pendiente'}</Text></View><View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View></View>;
}

export function Pill({ label, tone = 'neutral' }: { label: string; tone?: 'red' | 'green' | 'amber' | 'neutral' }) {
  const toneStyle = tone === 'red' ? styles.pillRed : tone === 'green' ? styles.pillGreen : tone === 'amber' ? styles.pillAmber : styles.pillNeutral;
  const textStyle = tone === 'red' ? styles.pillTextRed : tone === 'green' ? styles.pillTextGreen : tone === 'amber' ? styles.pillTextAmber : styles.pillTextNeutral;
  return <View style={[styles.pill, toneStyle]}><Text style={[styles.pillText, textStyle]}>{label}</Text></View>;
}

export function Button({ label, onPress, variant = 'primary', icon }: { label: string; onPress?: () => void; variant?: 'primary' | 'dark' | 'soft' | 'outline'; icon?: IconName }) {
  const variantStyle = variant === 'primary' ? styles.primaryButton : variant === 'dark' ? styles.darkButton : variant === 'soft' ? styles.softButton : styles.outlineButton;
  const textStyle = variant === 'primary' || variant === 'dark' ? styles.buttonTextLight : variant === 'soft' ? styles.buttonTextRed : styles.buttonTextDark;
  return <Pressable onPress={onPress} style={({ pressed }) => [styles.button, variantStyle, pressed && styles.pressed]}>{icon && <Icon name={icon} size={19} color={variant === 'primary' || variant === 'dark' ? '#fff' : palette.ink} />}<Text style={[styles.buttonText, textStyle]}>{label}</Text></Pressable>;
}

export function ClientCard({ client, compact = false }: { client: RouteVisit; compact?: boolean }) {
  const isManaged = client.state.completed;
  const tone = isManaged ? 'green' : client.state.code === 'REPROGRAMADO' ? 'amber' : 'neutral';
  const scheduled = client.scheduled_at ? new Date(client.scheduled_at).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }) : 'Sin hora programada';
  return <View style={[styles.clientCard, compact && styles.clientCardCompact]}><View style={styles.cardTop}><Pill label={client.state.description} tone={tone} /><Text style={styles.time}>{scheduled}</Text></View><Text style={styles.clientName}>{client.name}</Text><Text style={styles.address}><Icon name="id-card-outline" size={16} color={palette.muted} /> {client.document || client.identifier}</Text><View style={styles.cardBottom}><Text style={styles.debt}>{client.management_count} gestiones</Text><View style={styles.cardActions}><Link href={{ pathname: '/client/[id]', params: { id: client.identifier, idTable: client.portfolio.idTable } }} asChild><Pressable style={styles.squareAction}><Icon name="person-outline" size={20} /></Pressable></Link>{isManaged ? <Link href={{ pathname: '/client/[id]', params: { id: client.identifier, idTable: client.portfolio.idTable } }} asChild><Pressable style={styles.cardActionDark}><Text style={styles.cardActionText}>Ver ficha</Text></Pressable></Link> : <Link href={{ pathname: '/management/[id]', params: { id: client.identifier, idTable: client.portfolio.idTable } }} asChild><Pressable style={styles.cardActionRed}><Icon name="clipboard-outline" color="#fff" size={19} /><Text style={styles.cardActionText}>Gestionar</Text></Pressable></Link>}</View></View></View>;
}

export function BackHeader({ title }: { title: string }) { return <View style={styles.backHeader}><Pressable onPress={() => router.back()} hitSlop={12}><Icon name="arrow-back" size={26} /></Pressable><Text style={styles.backTitle}>{title}</Text></View>; }

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: palette.canvas }, content: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
  header: { paddingHorizontal: 20, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: palette.surface, borderBottomWidth: 1, borderColor: palette.line }, brandMark: { width: 44, height: 44, borderRadius: 13, backgroundColor: palette.red, alignItems: 'center', justifyContent: 'center' }, brandInitials: { color: '#fff', fontWeight: '800', fontSize: 17 }, brandText: { flex: 1 }, brandName: { color: palette.ink, fontSize: 17, fontWeight: '800' }, zone: { color: palette.muted, fontSize: 13, marginTop: 2 },
  gps: { backgroundColor: palette.greenSoft, paddingHorizontal: 11, height: 34, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6 }, gpsMuted: { backgroundColor: palette.soft }, gpsDot: { height: 8, width: 8, borderRadius: 8, backgroundColor: palette.green }, gpsDotMuted: { backgroundColor: palette.muted }, gpsText: { color: palette.green, fontSize: 13, fontWeight: '800' }, gpsTextMuted: { color: palette.muted }, avatar: { backgroundColor: palette.soft, width: 40, height: 40, borderRadius: 13, justifyContent: 'center', alignItems: 'center' }, avatarText: { fontSize: 14, fontWeight: '800', color: '#5C5650' },
  pill: { alignSelf: 'flex-start', borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 5 }, pillText: { fontSize: 12, fontWeight: '800' }, pillRed: { backgroundColor: palette.redSoft }, pillGreen: { backgroundColor: palette.greenSoft }, pillAmber: { backgroundColor: palette.amberSoft }, pillNeutral: { backgroundColor: palette.soft }, pillTextRed: { color: palette.red }, pillTextGreen: { color: palette.green }, pillTextAmber: { color: palette.amber }, pillTextNeutral: { color: '#625C56' },
  button: { minHeight: 50, borderRadius: 15, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, primaryButton: { backgroundColor: palette.red }, darkButton: { backgroundColor: palette.black }, softButton: { backgroundColor: palette.redSoft }, outlineButton: { backgroundColor: palette.surface, borderWidth: 1.5, borderColor: palette.line }, buttonText: { fontSize: 16, fontWeight: '800' }, buttonTextLight: { color: '#fff' }, buttonTextRed: { color: palette.red }, buttonTextDark: { color: palette.ink }, pressed: { opacity: 0.78 },
  clientCard: { backgroundColor: palette.surface, borderWidth: 1.5, borderColor: palette.line, borderRadius: radius.lg, padding: 16, gap: 9 }, clientCardCompact: { borderRadius: radius.md }, cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, time: { color: palette.muted, fontSize: 12, fontWeight: '700', flexShrink: 1, textAlign: 'right' }, clientName: { color: palette.ink, fontSize: 18, fontWeight: '800' }, address: { color: palette.muted, fontSize: 14, lineHeight: 20 }, cardBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }, debt: { color: palette.ink, fontSize: 17, fontWeight: '800' }, cardActions: { flexDirection: 'row', gap: 7, alignItems: 'center' }, squareAction: { height: 43, width: 43, backgroundColor: palette.soft, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, cardActionRed: { height: 43, paddingHorizontal: 13, borderRadius: 12, backgroundColor: palette.red, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 5 }, cardActionDark: { height: 43, paddingHorizontal: 13, borderRadius: 12, backgroundColor: palette.black, alignItems: 'center', justifyContent: 'center' }, cardActionText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  backHeader: { minHeight: 64, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: palette.surface, borderBottomWidth: 1, borderColor: palette.line }, backTitle: { color: palette.ink, fontSize: 17, fontWeight: '800', flex: 1 },
});
