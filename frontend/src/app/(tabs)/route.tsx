import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { RouteVisit } from '@/features/field/data';
import { AppHeader, Button, Icon, Page, Pill } from '@/features/field/ui';
import { FieldMap } from '@/features/field/map';
import { useFieldSession } from '@/features/field/session';
import { api } from '@/services/api';
import { palette, radius } from '@/theme/tokens';

type RouteSummary = { total: number; completed: number; unplanned: number };

export default function RouteScreen() {
  const { token, selectedPortfolio } = useFieldSession();
  const [items, setItems] = useState<RouteVisit[]>([]); const [unplanned, setUnplanned] = useState<RouteVisit[]>([]); const [summary, setSummary] = useState<RouteSummary>();
  const [selected, setSelected] = useState<number[]>([]); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    if (!token || !selectedPortfolio) return;
    setLoading(true); setError('');
    try {
      const result = await api.route(token, selectedPortfolio.id_table);
      setItems(result.items); setUnplanned(result.unplanned || []); setSummary(result.summary);
      setSelected([...result.items.filter((item) => item.assignment_id).sort((a, b) => (a.visit_order || 99999) - (b.visit_order || 99999)).map((item) => Number(item.assignment_id))]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible cargar tus cuentas asignadas.'); }
    finally { setLoading(false); }
  }, [token, selectedPortfolio]);
  useEffect(() => { const timer = setTimeout(() => { void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  const available = useMemo(() => [...items, ...unplanned], [items, unplanned]);
  const selectedItems = useMemo(() => selected.map((id) => available.find((item) => Number(item.assignment_id) === id)).filter((item): item is RouteVisit => Boolean(item)), [available, selected]);
  const routePoints = useMemo(() => selectedItems
    .filter((item) => Number.isFinite(Number(item.latitude)) && Number.isFinite(Number(item.longitude)))
    .map((item, index) => ({ id: item.assignment_id || item.account_id, name: `${index + 1}. ${item.name || 'Cuenta sin nombre'}`, detail: item.address || item.account || item.identifier, latitude: Number(item.latitude), longitude: Number(item.longitude) })), [selectedItems]);
  const toggle = (item: RouteVisit) => {
    const id = Number(item.assignment_id); if (!id || item.state.completed) return;
    setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  };
  const move = (id: number, direction: -1 | 1) => setSelected((current) => { const index = current.indexOf(id); const target = index + direction; if (index < 0 || target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; });
  const save = async () => {
    if (!token || !selectedPortfolio) return;
    if (!selected.length) { setError('Selecciona al menos una cuenta para crear tu ruta semanal.'); return; }
    setSaving(true); setError('');
    try { const result = await api.saveRoute(token, selectedPortfolio.id_table, selected); Alert.alert('Ruta semanal guardada', result.message); await load(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'No fue posible guardar tu ruta semanal.'); }
    finally { setSaving(false); }
  };
  return <Page><AppHeader/><ScrollView contentContainerStyle={styles.scroll} refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={palette.red}/> }>
    <Text style={styles.title}>Mi ruta</Text><Text style={styles.subtitle}>{selectedPortfolio?.name || 'Cargando cartera…'}</Text>
    <View style={styles.status}><View><Text style={styles.statusTitle}>{summary ? `${summary.completed}/${summary.total} gestionadas` : 'Cargando ruta'}</Text><Text style={styles.statusText}>Organiza tus visitas de la semana</Text></View><Icon name="git-network-outline" color="#fff" size={27}/></View>
    {error ? <View style={styles.notice}><Icon name="warning-outline" color={palette.amber}/><Text style={styles.noticeText}>{error}</Text></View> : null}
    {loading && !summary ? <View style={styles.loading}><ActivityIndicator color={palette.red}/></View> : null}
    {!loading ? <><View style={styles.plan}><View style={{ flex: 1 }}><Text style={styles.planTitle}>{selected.length} parada{selected.length === 1 ? '' : 's'} seleccionada{selected.length === 1 ? '' : 's'}</Text><Text style={styles.planText}>Selecciona tus cuentas, ordena el recorrido y guarda tu ruta semanal.</Text></View><Pill label={items.length ? 'Ruta actual' : 'Nueva ruta'} tone={items.length ? 'green' : 'neutral'}/></View>
    {selectedItems.length ? <><View style={styles.routeMap}><Text style={styles.section}>Mapa de la ruta</Text><Text style={styles.mapHelp}>{routePoints.length ? `${routePoints.length} de ${selectedItems.length} paradas tienen una ubicación validada.` : 'Aún no hay paradas con ubicación validada. Corrige la dirección desde cada cuenta para ubicarlas en el mapa.'}</Text><FieldMap location={null} points={routePoints} title={`${routePoints.length} parada${routePoints.length === 1 ? '' : 's'} ubicada${routePoints.length === 1 ? '' : 's'}`}/></View><View style={styles.order}><Text style={styles.section}>Orden del recorrido</Text>{selectedItems.map((item, index) => <View key={`order-${item.assignment_id}`} style={styles.orderItem}><View style={styles.number}><Text style={styles.numberText}>{index + 1}</Text></View><View style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={styles.name}>{item.name || 'Sin nombre'}</Text><Text numberOfLines={1} style={styles.meta}>{item.account || item.identifier}</Text></View><Pressable disabled={index === 0} onPress={() => move(Number(item.assignment_id), -1)} style={[styles.arrow, index === 0 && styles.disabled]}><Icon name="chevron-up" size={18}/></Pressable><Pressable disabled={index === selectedItems.length - 1} onPress={() => move(Number(item.assignment_id), 1)} style={[styles.arrow, index === selectedItems.length - 1 && styles.disabled]}><Icon name="chevron-down" size={18}/></Pressable></View>)}</View></> : null}
    <Button label={saving ? 'Guardando ruta…' : items.length ? 'Actualizar mi ruta semanal' : 'Crear mi ruta semanal'} icon="map-outline" onPress={saving ? undefined : save}/>
    <Text style={styles.section}>Cuentas asignadas</Text><Text style={styles.helper}>Las visitas ya gestionadas se conservan en la ruta y no se pueden retirar.</Text>
    {available.length ? available.map((item) => { const isSelected = selected.includes(Number(item.assignment_id)); const locked = item.state.completed; return <Pressable key={`${item.assignment_id}-${item.identifier}`} disabled={locked} onPress={() => toggle(item)} style={[styles.account, isSelected && styles.accountSelected, locked && styles.accountLocked]}><View style={[styles.check, isSelected && styles.checkSelected]}><Icon name={isSelected ? 'checkmark' : 'add'} size={17} color={isSelected ? '#fff' : palette.muted}/></View><View style={{ flex: 1, minWidth: 0 }}><View style={styles.accountTop}><Text numberOfLines={2} style={styles.name}>{item.name || 'Sin nombre'}</Text>{locked ? <Pill label="Gestionada" tone="green"/> : null}</View><Text numberOfLines={1} style={styles.meta}>{item.account || item.identifier} · {item.state.description}</Text></View></Pressable>; }) : <View style={styles.empty}><Icon name="calendar-clear-outline" color={palette.green} size={30}/><Text style={styles.emptyTitle}>No tienes cuentas asignadas</Text><Text style={styles.emptyText}>Cuando supervisión te asigne cuentas, podrás agregarlas a tu ruta aquí.</Text></View>}</> : null}
  </ScrollView></Page>;
}

const styles = StyleSheet.create({ scroll: { padding: 20, gap: 13, paddingBottom: 32 }, title: { fontSize: 30, fontWeight: '900', color: palette.ink }, subtitle: { color: palette.muted, fontSize: 15 }, status: { backgroundColor: palette.black, borderRadius: radius.lg, padding: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, statusTitle: { color: '#fff', fontSize: 20, fontWeight: '900' }, statusText: { color: '#D2CCC5', marginTop: 4 }, loading: { minHeight: 160, alignItems: 'center', justifyContent: 'center' }, notice: { backgroundColor: palette.amberSoft, borderRadius: 14, padding: 14, flexDirection: 'row', gap: 8, alignItems: 'center' }, noticeText: { color: palette.amber, fontWeight: '700', flex: 1 }, plan: { flexDirection: 'row', gap: 10, alignItems: 'center', padding: 14, borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.line }, planTitle: { color: palette.ink, fontWeight: '900', fontSize: 17 }, planText: { color: palette.muted, fontSize: 13, lineHeight: 18, marginTop: 3 }, section: { color: palette.ink, fontWeight: '900', fontSize: 20 }, helper: { color: palette.muted, fontSize: 13, lineHeight: 18, marginTop: -8 }, routeMap: { gap: 7 }, mapHelp: { color: palette.muted, fontSize: 13, lineHeight: 18 }, order: { gap: 8 }, orderItem: { borderWidth: 1, borderColor: palette.line, borderRadius: 14, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: palette.surface }, number: { width: 27, height: 27, borderRadius: 14, backgroundColor: palette.red, alignItems: 'center', justifyContent: 'center' }, numberText: { color: '#fff', fontWeight: '900', fontSize: 12 }, arrow: { width: 32, height: 32, borderRadius: 10, backgroundColor: palette.soft, justifyContent: 'center', alignItems: 'center' }, disabled: { opacity: .35 }, account: { borderWidth: 1.5, borderColor: palette.line, borderRadius: radius.md, padding: 14, flexDirection: 'row', gap: 11, alignItems: 'center', backgroundColor: palette.surface }, accountSelected: { borderColor: palette.red, backgroundColor: palette.redSoft }, accountLocked: { opacity: .72 }, check: { width: 30, height: 30, borderRadius: 10, backgroundColor: palette.soft, alignItems: 'center', justifyContent: 'center' }, checkSelected: { backgroundColor: palette.red }, accountTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }, name: { flex: 1, color: palette.ink, fontSize: 16, fontWeight: '900' }, meta: { color: palette.muted, marginTop: 4, fontSize: 13 }, empty: { borderWidth: 1.5, borderColor: palette.line, borderRadius: radius.lg, padding: 26, gap: 8, alignItems: 'center' }, emptyTitle: { color: palette.ink, fontSize: 18, fontWeight: '800' }, emptyText: { color: palette.muted, textAlign: 'center', lineHeight: 20 } });
