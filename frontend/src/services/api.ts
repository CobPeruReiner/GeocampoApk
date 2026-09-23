import type { Client, Portfolio, Profile, RouteVisit } from '@/features/field/data';

const baseUrl = process.env.EXPO_PUBLIC_API_URL;
if (!baseUrl) throw new Error('Falta EXPO_PUBLIC_API_URL. Configura la URL de la API local.');

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export const socketUrl = baseUrl.replace(/\/api\/?$/, '');
export const apiUrl = (path: string) => `${baseUrl}${path}`;
async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, { ...init, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  } catch {
    throw new ApiError('No se pudo conectar con el servidor. Verifica que estés conectado a la red de trabajo e inténtalo nuevamente.', 0);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message || 'No fue posible completar la solicitud.', response.status);
  return body as T;
}
export const api = {
  login: (username: string, password: string) => request<{ token: string; profile: Profile }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  initial: (token: string) => request<{ profile: Profile; portfolios: Portfolio[] }>('/field/initial', {}, token),
  route: (token: string, idTable: number, q = '') => request<{ portfolio: Portfolio; summary: { total: number; completed: number; unplanned: number }; items: RouteVisit[]; unplanned: RouteVisit[] }>(`/field/route?idTable=${idTable}&q=${encodeURIComponent(q)}`, {}, token),
  saveRoute: (token: string, idTable: number, assignmentIds: number[]) => request<{ message: string; routeId: number; action: 'created' | 'updated'; stops: number }>('/field/route', { method: 'POST', body: JSON.stringify({ idTable, assignmentIds }) }, token),
  clients: (token: string, idTable: number, q: string) => request<{ portfolio: Portfolio; items: Client[] }>(`/field/clients?idTable=${idTable}&q=${encodeURIComponent(q)}`, {}, token),
  client: (token: string, idTable: number, identifier: string) => request<{ item: Client }>(`/field/clients/${encodeURIComponent(identifier)}?idTable=${idTable}`, {}, token),
  history: (token: string, idTable: number, identifier: string) => request<{ items: ManagementRecord[]; summary: ManagementSummary }>(`/field/clients/${encodeURIComponent(identifier)}/history?idTable=${idTable}`, {}, token),
  personalHistory: (token: string, idTable: number, from?: string, to?: string) => request<{ range: { startDate: string; endDate: string }; items: ManagementRecord[] }>(`/field/history?idTable=${idTable}${from ? `&from=${encodeURIComponent(from)}` : ''}${to ? `&to=${encodeURIComponent(to)}` : ''}`, {}, token),
  managementDetail: (token: string, idTable: number, source: ManagementSource, id: number) => request<{ item: ManagementRecord }>(`/field/managements/${source}/${id}?idTable=${idTable}`, {}, token),
  addressCorrection: (token: string, idTable: number, identifier: string) => request<AddressCorrectionData>(`/field/clients/${encodeURIComponent(identifier)}/address-correction?idTable=${idTable}`, {}, token),
  saveAddressCorrection: (token: string, idTable: number, identifier: string, payload: AddressCorrectionInput) => request<{ message: string; id: number }>(`/field/clients/${encodeURIComponent(identifier)}/address-correction`, { method: 'POST', body: JSON.stringify({ idTable, ...payload }) }, token),
  advisors: (token: string, idCartera: number) => request<{ items: Advisor[] }>(`/supervisor/advisors?idCartera=${idCartera}`, {}, token),
  managementOptions: (token: string, idTable: number, identifier: string) => request<ManagementOptions>(`/management/${encodeURIComponent(identifier)}/options?idTable=${idTable}`, {}, token),
  managementEffects: (token: string, actionId: number) => request<{ items: ManagementEffect[] }>(`/management/catalog/effects/${actionId}`, {}, token),
  managementMotives: (token: string, effectId: number) => request<{ items: ManagementOption[] }>(`/management/catalog/motives/${effectId}`, {}, token),
  managementContacts: (token: string, effectId: number) => request<{ items: ManagementOption[] }>(`/management/catalog/contacts/${effectId}`, {}, token),
  saveManagement: async (token: string, identifier: string, form: FormData) => {
    let response: Response;
    try {
      if (__DEV__) console.info('[GeoCampo] Enviando gestión', { url: `${baseUrl}/management/${encodeURIComponent(identifier)}` });
      response = await fetch(`${baseUrl}/management/${encodeURIComponent(identifier)}`, { method: 'POST', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` }, body: form });
    } catch (cause) {
      if (__DEV__) console.error('[GeoCampo] Error al enviar gestión', { url: `${baseUrl}/management/${encodeURIComponent(identifier)}`, message: cause instanceof Error ? cause.message : String(cause) });
      throw new ApiError('No se pudo conectar con el servidor. La gestión no fue enviada.', 0);
    }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiError(body.message || 'No fue posible guardar la gestión.', response.status);
    return body as { message: string; id?: number };
  },
  reportLocation: (token: string, idTable: number, location: { latitude: number; longitude: number; accuracy: number | null }, active = true) => request<void>('/field/location', { method: 'POST', body: JSON.stringify({ ...location, idTable, active }) }, token),
};
export type ManagementSource = 'CAMPO' | 'CALL';
export type ManagementCategory = { code: 'CD' | 'CI' | 'NC' | 'OTROS'; name: string };
export type ManagementEvidence = { slot: number; name: string; url: string };
export type ManagementRecord = { id: number; source?: ManagementSource; source_label?: string; created_at: string; time?: string; identifier?: string; effect?: string; effect_id?: number | null; reason?: string; contact?: string; observation?: string; phone?: string; floors?: string; door?: string; facade?: string; promise_date?: string; promise_amount?: number; latitud?: number | null; longitud?: number | null; gps_status?: string; category?: ManagementCategory; evidence_count?: number; evidence?: ManagementEvidence[] };
export type ManagementSummary = Record<ManagementSource, Record<'total' | 'CD' | 'CI' | 'NC' | 'OTROS', number>>;
export type AddressCorrectionData = { assignment: { id_asignacion: number; address?: string; district?: string; department?: string; province?: string }; correction: { direccion_corregida?: string; direccion_search?: string; distrito_corregido?: string; latitud?: number | null; longitud?: number | null; validado?: number; fecha_registro?: string } | null };
export type AddressCorrectionInput = { correctedAddress: string; searchAddress?: string; correctedDistrict?: string; latitude?: number | null; longitude?: number | null };
export type Advisor = { id: number; name: string; assigned: number; managed_today: number; last_management_at?: string; latitude: number | null; longitude: number | null; live: boolean; location_source: string | null };
export type ManagementOption = { id: number; name: string };
export type ManagementEffect = ManagementOption & { promise: boolean };
export type ManagementOptions = { client: { identifier: string; document?: string }; actions: ManagementOption[]; addresses: { id: number; address: string }[] };
