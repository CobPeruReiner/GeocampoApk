import type { Client, Portfolio, Profile, RouteVisit } from '@/features/field/data';

const baseUrl = process.env.EXPO_PUBLIC_API_URL;
if (!baseUrl) throw new Error('Falta EXPO_PUBLIC_API_URL. Configura la URL de la API local.');

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(body.message || 'No fue posible completar la solicitud.', response.status);
  return body as T;
}
export const api = {
  login: (username: string, password: string) => request<{ token: string; profile: Profile }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  initial: (token: string) => request<{ profile: Profile; portfolios: Portfolio[] }>('/field/initial', {}, token),
  route: (token: string, idTable: number, q = '') => request<{ portfolio: Portfolio; summary: { total: number; completed: number }; items: RouteVisit[] }>(`/field/route?idTable=${idTable}&q=${encodeURIComponent(q)}`, {}, token),
  clients: (token: string, idTable: number, q: string) => request<{ portfolio: Portfolio; items: Client[] }>(`/field/clients?idTable=${idTable}&q=${encodeURIComponent(q)}`, {}, token),
  client: (token: string, idTable: number, identifier: string) => request<{ item: Client }>(`/field/clients/${encodeURIComponent(identifier)}?idTable=${idTable}`, {}, token),
  history: (token: string, idTable: number, identifier: string) => request<{ items: ManagementRecord[] }>(`/field/clients/${encodeURIComponent(identifier)}/history?idTable=${idTable}`, {}, token),
};
export type ManagementRecord = { id: number; created_at: string; time?: string; effect?: string; reason?: string; observation?: string; promise_date?: string; promise_amount?: number; latitud?: number; longitud?: number };
