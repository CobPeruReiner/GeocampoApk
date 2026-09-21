import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Icon } from './ui';
import { palette, radius } from '@/theme/tokens';

type Point = { id: number | string; name: string; latitude: number; longitude: number; detail?: string };
const LIMA: Region = { latitude: -12.0464, longitude: -77.0428, latitudeDelta: 0.12, longitudeDelta: 0.12 };
export function FieldMap({ location, points = [], title = 'Ubicación actual' }: { location: { latitude: number; longitude: number } | null; points?: Point[]; title?: string }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setReady(false); setFailed(false); }, [location?.latitude, location?.longitude, points.length]);
  useEffect(() => { if (ready) return; const timeout = setTimeout(() => setFailed(true), 12_000); return () => clearTimeout(timeout); }, [ready]);
  const valid = points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  const region = location ? { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.018, longitudeDelta: 0.018 } : valid[0] ? { latitude: valid[0].latitude, longitude: valid[0].longitude, latitudeDelta: 0.035, longitudeDelta: 0.035 } : LIMA;
  return <View style={styles.wrap}><MapView provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={region} showsUserLocation={Boolean(location)} showsMyLocationButton={Boolean(location)} onMapReady={() => setReady(true)}><>{valid.map((point) => <Marker key={point.id} coordinate={{ latitude: point.latitude, longitude: point.longitude }} title={point.name} description={point.detail} pinColor={palette.red} />)}</></MapView>{!ready && !failed ? <View style={styles.overlay}><ActivityIndicator color={palette.red}/><Text style={styles.overlayText}>Cargando mapa…</Text></View> : null}{failed ? <View style={styles.overlay}><Icon name="map-outline" color={palette.red} size={27}/><Text style={styles.overlayTitle}>No se pudo cargar el mapa</Text><Text style={styles.overlayText}>Verifica tu conexión y la configuración de Google Maps del build.</Text></View> : null}<View style={styles.label}><Icon name="map-outline" color={palette.red} size={17}/><Text style={styles.labelText}>{location || valid.length ? title : 'Sin ubicación reportada aún'}</Text></View></View>;
}
const styles = StyleSheet.create({ wrap: { height: 210, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: palette.soft, borderWidth: 1, borderColor: palette.line }, map: { flex: 1 }, overlay: { ...StyleSheet.absoluteFill, backgroundColor: '#F4F0EA', alignItems: 'center', justifyContent: 'center', gap: 7, padding: 22 }, overlayTitle: { color: palette.ink, fontSize: 15, fontWeight: '800' }, overlayText: { color: palette.muted, fontSize: 12, textAlign: 'center', lineHeight: 18 }, label: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#FFFFFEF2' }, labelText: { color: palette.ink, fontSize: 12, fontWeight: '800' } });
