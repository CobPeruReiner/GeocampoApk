export type Portfolio = { id_table: number; id_cartera: number; table_name: string; name: string };
export type Profile = { id: number; username: string; name: string; document?: string; role?: string; portfolioId?: number; type?: string; status: number; isSupervisor?: boolean };
export type ClientField = { field: string; header: string; type: string; width: number; color: string; value: unknown };
export type Client = { id: string; identifier: string; document?: string; name: string; account?: string; debt?: unknown; campaign?: unknown; portfolio: { idTable: number; idCartera: number; name: string }; fields: ClientField[] };
export type RouteVisit = { account_id: number; identifier: string; document?: string; name: string; account?: string; address?: string; latitude?: number | null; longitude?: number | null; route_detail_id: number; assignment_id?: number; visit_order?: number; scheduled_at?: string; visited_at?: string; management_count: number; state: { code: string; description: string; completed: boolean }; portfolio: Client['portfolio'] };
export const currency = (value: unknown) => {
  const number = Number(value);
  return Number.isFinite(number) ? `S/ ${number.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'No disponible';
};
