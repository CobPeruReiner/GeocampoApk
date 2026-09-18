export type VisitStatus = 'Pendiente' | 'Gestionado' | 'Reprogramado';
export type Client = { id: string; name: string; document: string; address: string; district: string; debt: number; campaign: number; status: VisitStatus; priority?: string; risk: string; time: string; distance: string; phone: string };

export const clients: Client[] = [
  { id: 'rosa-mendoza', name: 'Rosa Mendoza Torres', document: 'DNI 45•••218', address: 'Av. Próceres 5421', district: 'San Juan de Lurigancho', debt: 4280, campaign: 2990, status: 'Pendiente', priority: 'Prioridad alta', risk: 'Riesgo medio', time: '10:30 a. m.', distance: '800 m', phone: '987•••421' },
  { id: 'juan-paredes', name: 'Juan Paredes Huamán', document: 'DNI 10•••934', address: 'Jr. Los Jazmines 234', district: 'San Juan de Lurigancho', debt: 1950, campaign: 1250, status: 'Pendiente', risk: 'Riesgo bajo', time: '11:15 a. m.', distance: '1.2 km', phone: '944•••202' },
  { id: 'elsa-fernandez', name: 'Elsa Fernández Ríos', document: 'DNI 42•••631', address: 'Av. Canto Grande 890', district: 'San Juan de Lurigancho', debt: 6400, campaign: 4850, status: 'Pendiente', priority: 'Compromiso hoy', risk: 'Riesgo medio', time: '12:00 p. m.', distance: '1.8 km', phone: '911•••462' },
  { id: 'miguel-torres', name: 'Miguel Torres Vega', document: 'DNI 47•••502', address: 'Calle Las Flores 112', district: 'San Juan de Lurigancho', debt: 890, campaign: 640, status: 'Gestionado', risk: 'Riesgo bajo', time: '9:20 a. m.', distance: '500 m', phone: '955•••197' },
  { id: 'carmen-diaz', name: 'Carmen Díaz Flores', document: 'DNI 44•••811', address: 'Av. Wiesse 1530', district: 'San Juan de Lurigancho', debt: 3120, campaign: 2540, status: 'Reprogramado', risk: 'Riesgo medio', time: '18 sep · 10:00', distance: '2.4 km', phone: '998•••103' },
];
export const byId = (id?: string) => clients.find((client) => client.id === id) ?? clients[0];
export const currency = (value: number) => `S/ ${value.toLocaleString('es-PE')}`;
