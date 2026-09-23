import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from './ui';
import { palette, radius } from '@/theme/tokens';

type Point = { id: number | string; name: string; latitude: number; longitude: number; detail?: string };
const LIMA: Region = { latitude: -12.0464, longitude: -77.0428, latitudeDelta: 0.12, longitudeDelta: 0.12 };
export function FieldMap({ location, points = [], title = 'Ubicación actual' }: { location: { latitude: number; longitude: number } | null; points?: Point[]; title?: string }) {
  const [attempt, setAttempt] = useState(0);
  return <MapInstance key={attempt} location={location} points={points} title={title} onRetry={() => setAttempt((value) => value + 1)}/>;
}

function MapInstance({ location, points, title, onRetry }: { location: { latitude: number; longitude: number } | null; points: Point[]; title: string; onRetry: () => void }) {
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  // Readiness belongs to this native map instance, not to a GPS report.
  useEffect(() => {
    if (loaded) return;
    const timeout = setTimeout(() => {
      setSlow(true);
      if (__DEV__) console.warn('[GeoCampo Maps] No se recibió onMapLoaded en 20 s. Revisar logcat de Google Android Maps SDK.');
    }, 20_000);
    return () => clearTimeout(timeout);
  }, [loaded]);
  const valid = points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude) && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180);
  const region = location ? { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.018, longitudeDelta: 0.018 } : valid[0] ? { latitude: valid[0].latitude, longitude: valid[0].longitude, latitudeDelta: 0.035, longitudeDelta: 0.035 } : LIMA;
  const latitude = region.latitude;
  const longitude = region.longitude;
  const latitudeDelta = region.latitudeDelta;
  const longitudeDelta = region.longitudeDelta;
  useEffect(() => {
    if (ready) map.current?.animateToRegion({ latitude, longitude, latitudeDelta, longitudeDelta }, 350);
  }, [ready, latitude, longitude, latitudeDelta, longitudeDelta]);
  return <View style={styles.wrap}>
    <MapView ref={map} provider={PROVIDER_GOOGLE} mapType="standard" userInterfaceStyle="light" style={styles.map} initialRegion={region}
      showsUserLocation={Boolean(location)} showsMyLocationButton={Boolean(location)}
      onMapReady={() => { setReady(true); if (__DEV__) console.info('[GeoCampo Maps] Vista nativa lista.'); }}
      onMapLoaded={() => { setLoaded(true); setSlow(false); if (__DEV__) console.info('[GeoCampo Maps] Cartografía cargada.'); }}>
      {valid.map((point) => <Marker key={point.id} coordinate={{ latitude: point.latitude, longitude: point.longitude }} title={point.name} description={point.detail} pinColor={palette.red}/>)}
    </MapView>
    {!loaded ? <View style={styles.notice}>
      {!slow ? <ActivityIndicator color={palette.red} size="small"/> : <Icon name="map-outline" color={palette.red} size={18}/>}
      <Text style={styles.noticeText}>{slow ? 'El mapa está tardando en cargar.' : 'Cargando mapa…'}</Text>
      {slow ? <Pressable onPress={onRetry} accessibilityRole="button" style={styles.retry}><Text style={styles.retryText}>Reintentar</Text></Pressable> : null}
    </View> : null}
    <View pointerEvents="none" style={styles.caption}><Icon name="map-outline" color={palette.red} size={17}/><Text style={styles.captionText}>{location || valid.length ? title : 'Sin ubicación reportada aún'}</Text></View>
  </View>;
}
const styles = StyleSheet.create({
  wrap: { height: 250, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: palette.soft, borderWidth: 1, borderColor: palette.line },
  map: { ...StyleSheet.absoluteFill },
  notice: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 10, borderRadius: 12, backgroundColor: '#FFFFFEF2' },
  noticeText: { flex: 1, color: palette.ink, fontSize: 12 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  retryText: { color: palette.red, fontWeight: '800', fontSize: 12 },
  caption: { position: 'absolute', left: 10, right: 10, bottom: 28, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, padding: 10, backgroundColor: '#FFFFFEF2' },
  captionText: { flexShrink: 1, color: palette.ink, fontSize: 12, fontWeight: '800' },
});
