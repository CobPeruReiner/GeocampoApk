import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { StyleSheet, Text, View } from 'react-native';
import { Icon } from './ui';
import { palette, radius } from '@/theme/tokens';

type Point = { id: number | string; name: string; latitude: number; longitude: number; detail?: string };
const LIMA: Region = { latitude: -12.0464, longitude: -77.0428, latitudeDelta: 0.12, longitudeDelta: 0.12 };
export function FieldMap({ location, points = [], title = 'Ubicación actual' }: { location: { latitude: number; longitude: number } | null; points?: Point[]; title?: string }) {
  const valid = points.filter((point) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude));
  const region = location ? { latitude: location.latitude, longitude: location.longitude, latitudeDelta: 0.018, longitudeDelta: 0.018 } : valid[0] ? { latitude: valid[0].latitude, longitude: valid[0].longitude, latitudeDelta: 0.035, longitudeDelta: 0.035 } : LIMA;
  return <View style={styles.wrap}><MapView provider={PROVIDER_GOOGLE} style={styles.map} initialRegion={region} showsUserLocation={Boolean(location)} showsMyLocationButton={Boolean(location)}><>{valid.map((point) => <Marker key={point.id} coordinate={{ latitude: point.latitude, longitude: point.longitude }} title={point.name} description={point.detail} pinColor={palette.red} />)}</></MapView><View style={styles.label}><Icon name="map-outline" color={palette.red} size={17}/><Text style={styles.labelText}>{location || valid.length ? title : 'Sin ubicación reportada aún'}</Text></View></View>;
}
const styles = StyleSheet.create({ wrap: { height: 210, borderRadius: radius.lg, overflow: 'hidden', backgroundColor: palette.soft, borderWidth: 1, borderColor: palette.line }, map: { flex: 1 }, label: { position: 'absolute', left: 12, bottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: '#FFFFFEF2' }, labelText: { color: palette.ink, fontSize: 12, fontWeight: '800' } });
