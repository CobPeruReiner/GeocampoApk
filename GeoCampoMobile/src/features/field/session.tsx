import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';

import type { Portfolio, Profile } from './data';
import { api } from '@/services/api';

type FieldSession = {
  started: boolean; toggleJornada: () => void; pendingSync: number; ready: boolean; token: string | null; profile: Profile | null;
  portfolios: Portfolio[]; selectedPortfolio: Portfolio | null; selectPortfolio: (portfolio: Portfolio) => void;
  login: (username: string, password: string) => Promise<void>; logout: () => Promise<void>;
};
const SessionContext = createContext<FieldSession | null>(null);
export function FieldSessionProvider({ children }: { children: React.ReactNode }) {
  const [started, setStarted] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolio, setSelectedPortfolio] = useState<Portfolio | null>(null);
  const [ready, setReady] = useState(false);

  const loadInitial = async (sessionToken: string) => {
    const initial = await api.initial(sessionToken);
    setProfile(initial.profile);
    setPortfolios(initial.portfolios);
    setSelectedPortfolio((current) => current && initial.portfolios.some((item) => item.id_table === current.id_table) ? current : initial.portfolios[0] ?? null);
  };
  useEffect(() => { SecureStore.getItemAsync('geocampo.session').then(async (saved) => { if (saved) { try { const session = JSON.parse(saved) as { token: string }; setToken(session.token); await loadInitial(session.token); } catch { await SecureStore.deleteItemAsync('geocampo.session'); } } setReady(true); }); }, []);
  const login = async (username: string, password: string) => { const session = await api.login(username, password); setToken(session.token); await SecureStore.setItemAsync('geocampo.session', JSON.stringify({ token: session.token })); await loadInitial(session.token); };
  const logout = async () => { await SecureStore.deleteItemAsync('geocampo.session'); setToken(null); setProfile(null); setPortfolios([]); setSelectedPortfolio(null); setStarted(false); };
  const value = useMemo(() => ({ started, toggleJornada: () => setStarted((current) => !current), pendingSync: 0, ready, token, profile, portfolios, selectedPortfolio, selectPortfolio: setSelectedPortfolio, login, logout }), [started, ready, token, profile, portfolios, selectedPortfolio]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useFieldSession() { const session = useContext(SessionContext); if (!session) throw new Error('Missing FieldSessionProvider'); return session; }
