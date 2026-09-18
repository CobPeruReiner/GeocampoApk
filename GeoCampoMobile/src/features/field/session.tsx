import { createContext, useContext, useMemo, useState } from 'react';
type FieldSession = { started: boolean; toggleJornada: () => void; pendingSync: number };
const SessionContext = createContext<FieldSession | null>(null);
export function FieldSessionProvider({ children }: { children: React.ReactNode }) {
  const [started, setStarted] = useState(false);
  const value = useMemo(() => ({ started, toggleJornada: () => setStarted((current) => !current), pendingSync: 2 }), [started]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useFieldSession() { const session = useContext(SessionContext); if (!session) throw new Error('Missing FieldSessionProvider'); return session; }
