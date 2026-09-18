import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import * as Location from 'expo-location';

import type { Portfolio, Profile } from './data';
import { api } from '@/services/api';

type FieldSession = {
  started: boolean; toggleJornada: () => void; pendingSync: number; ready: boolean; token: string | null; profile: Profile | null;
  portfolios: Portfolio[]; selectedPortfolio: Portfolio | null; selectPortfolio: (portfolio: Portfolio) => void;
  login: (username: string, password: string) => Promise<void>; logout: () => Promise<void>;
  online: boolean; location: { latitude: number; longitude: number; accuracy: number | null; updatedAt: number } | null;
  locationError: string | null; requestLocation: () => Promise<boolean>;
};
const SessionContext = createContext<FieldSession | null>(null);
export function FieldSessionProvider({ children }: { children: React.ReactNode }) {
  const [started, setStarted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<Portfolio | null>(null);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);
  const [location, setLocation] = useState<FieldSession['location']>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  const loadInitial = async (sessionToken: string) => {
    const initial = await api.initial(sessionToken);
    setProfile(initial.profile);
    setPortfolios(initial.portfolios);
    setSelectedPortfolio((current) => current && initial.portfolios.some((item) => item.id_table === current.id_table) ? current : initial.portfolios[0] ?? null);
  };
  useEffect(() => { SecureStore.getItemAsync('geocampo.session').then(async (saved) => { if (saved) { try { const session = JSON.parse(saved) as { token: string }; setToken(session.token); await loadInitial(session.token); } catch { await SecureStore.deleteItemAsync('geocampo.session'); } } setReady(true); }); }, []);
  useEffect(() => NetInfo.addEventListener((state) => setOnline(Boolean(state.isConnected && state.isInternetReachable !== false))), []);
  useEffect(() => { if (started && token && location) api.reportLocation(token, location, true).catch(() => undefined); }, [started, token, location]);
  useEffect(() => {
    if (!started) return;
    let subscription: Location.LocationSubscription | undefined;
    Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 60_000, distanceInterval: 20 }, (position) => {
      setLocation({ latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy, updatedAt: position.timestamp });
    }).then((watcher) => { subscription = watcher; }).catch(() => setLocationError('Se perdió el seguimiento de ubicación.'));
    return () => subscription?.remove();
  }, [started]);
  const requestLocation = async () => {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') { setLocationError('Permiso de ubicación no concedido.'); return false; }
    try {
      const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const report = { latitude: current.coords.latitude, longitude: current.coords.longitude, accuracy: current.coords.accuracy, updatedAt: current.timestamp };
      setLocation(report);
      if (started && token) await api.reportLocation(token, report, true);
      setLocationError(null); return true;
    } catch { setLocationError('No fue posible obtener la ubicación actual.'); return false; }
  };
  const login = async (username: string, password: string) => { const session = await api.login(username, password); setToken(session.token); await SecureStore.setItemAsync('geocampo.session', JSON.stringify({ token: session.token })); await loadInitial(session.token); };
  const logout = async () => { await SecureStore.deleteItemAsync('geocampo.session'); setToken(null); setProfile(null); setPortfolios([]); setSelectedPortfolio(null); setStarted(false); };
  const toggleJornada = () => { if (started) { if (token && location) api.reportLocation(token, location, false).catch(() => undefined); setStarted(false); return; } requestLocation().then((granted) => { if (granted) setStarted(true); }); };
  const value = useMemo(() => ({ started, toggleJornada, pendingSync: 0, ready, token, profile, portfolios, selectedPortfolio, selectPortfolio: setSelectedPortfolio, login, logout, online, location, locationError, requestLocation }), [started, ready, token, profile, portfolios, selectedPortfolio, online, location, locationError]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useFieldSession() { const session = useContext(SessionContext); if (!session) throw new Error('Missing FieldSessionProvider'); return session; }
