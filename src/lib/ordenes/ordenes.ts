// Órdenes de trabajo de una unidad que fabrica a pedido (como la planilla "Seguimiento de
// órdenes de trabajo" de Fabriestant): pedido, materiales, mano de obra, estado y pagos a cuenta.

export const ESTADOS_ORDEN = [
  "No empezado",
  "En proceso",
  "Terminado",
] as const;
export type EstadoOrden = (typeof ESTADOS_ORDEN)[number];

export interface PagoOrden {
  fecha: string;
  importe: number;
  recibo: string;
}

export interface OrdenTrabajo {
  id?: string;
  unidadId?: string | null;
  /** Número de pedido, como en la planilla: AAMM-NNN (2611-067). */
  numero: string;
  fecha: string;
  cliente: string;
  tipo: string;
  detalle: string;
  cantidad: number;
  /** Precio total del trabajo. */
  total: number;
  /** IVA que se cobra aparte del total (en la planilla, la columna IVA). */
  ivaAparte: number;
  conFactura: boolean;
  factura: string;
  materiales: number;
  /** Columna OT de la planilla: días de plazo para entregar. */
  plazoDias: number | null;
  estado: EstadoOrden;
  pagos: PagoOrden[];
}

/** Tipos de trabajo de la planilla, para sugerir al cargar. */
export const TIPOS_TRABAJO = [
  "Aéreo",
  "Arreglos",
  "Banquetas",
  "Caramelera",
  "Check-out",
  "Cigarrera",
  "Cocina",
  "Escritorio",
  "Estándar",
  "Estantería vertical",
  "Exhibidor panadero",
  "Herrajes",
  "Lockers",
  "Maxi kiosco",
  "Mesas de luz",
  "Mini kiosco",
  "Modificaciones",
  "Mostrador",
  "Mostrador combinado",
  "Nicho boutique",
  "Perchero",
  "Personalizado",
  "Placard",
  "Porta afiche",
  "Porta cartulina",
  "Reparaciones",
  "Sandwichera",
  "Varios",
  "Vitrina vertical",
];

const r2 = (n: number) => Math.round(n * 100) / 100;

export const cobrado = (o: OrdenTrabajo) =>
  r2(o.pagos.reduce((t, p) => t + p.importe, 0));

/** Lo que falta cobrar: total + IVA aparte − pagos. */
export const saldo = (o: OrdenTrabajo) =>
  r2(o.total + o.ivaAparte - cobrado(o));

/** Como en la planilla: lo facturado menos los materiales. */
export const manoDeObra = (o: OrdenTrabajo) => r2(o.total - o.materiales);

/** Importe sin IVA de un trabajo facturado (el total incluye el 21 %). */
export const sinIva = (o: OrdenTrabajo) =>
  o.conFactura ? r2(o.total / 1.21) : o.total;

function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Fecha comprometida de entrega (fecha del pedido + plazo). */
export const fechaEntrega = (o: OrdenTrabajo) =>
  o.plazoDias ? sumarDias(o.fecha, o.plazoDias) : null;

/** Sin terminar y con la fecha de entrega ya pasada. */
export function atrasada(o: OrdenTrabajo, hoy: string) {
  const entrega = fechaEntrega(o);
  return o.estado !== "Terminado" && !!entrega && entrega < hoy;
}

/** Próximo número de pedido: AAMM de la fecha y el correlativo del año que sigue. */
export function proximoNumero(ordenes: OrdenTrabajo[], fecha: string) {
  const aa = fecha.slice(2, 4);
  const mm = fecha.slice(5, 7);
  const ultimo = ordenes.reduce((max, o) => {
    const m = /^(\d{2})\d{2}-(\d+)$/.exec(o.numero.trim());
    return m && m[1] === aa ? Math.max(max, Number(m[2])) : max;
  }, 0);
  return `${aa}${mm}-${String(ultimo + 1).padStart(3, "0")}`;
}

export interface ResumenMes {
  mes: string;
  cantidad: number;
  total: number;
  materiales: number;
  manoDeObra: number;
  cobrado: number;
  saldo: number;
}

/** Totales por mes del pedido (como las sumas de la columna A de la planilla). */
export function resumenPorMes(ordenes: OrdenTrabajo[]): ResumenMes[] {
  const meses = new Map<string, ResumenMes>();
  for (const o of ordenes) {
    const mes = o.fecha.slice(0, 7);
    const r = meses.get(mes) ?? {
      mes,
      cantidad: 0,
      total: 0,
      materiales: 0,
      manoDeObra: 0,
      cobrado: 0,
      saldo: 0,
    };
    r.cantidad += 1;
    r.total = r2(r.total + o.total);
    r.materiales = r2(r.materiales + o.materiales);
    r.manoDeObra = r2(r.manoDeObra + manoDeObra(o));
    r.cobrado = r2(r.cobrado + cobrado(o));
    r.saldo = r2(r.saldo + saldo(o));
    meses.set(mes, r);
  }
  return [...meses.values()].sort((a, b) => b.mes.localeCompare(a.mes));
}

export interface SaldoCliente {
  cliente: string;
  ordenes: number;
  saldo: number;
  ultima: string;
}

/** Clientes que deben algo (saldo mayor a $ 1), del que más debe al que menos. */
export function saldosPorCliente(ordenes: OrdenTrabajo[]): SaldoCliente[] {
  const porCliente = new Map<string, SaldoCliente>();
  for (const o of ordenes) {
    const s = saldo(o);
    if (s <= 1) continue;
    const nombre = o.cliente.trim() || "Sin nombre";
    const c = porCliente.get(nombre.toLowerCase()) ?? {
      cliente: nombre,
      ordenes: 0,
      saldo: 0,
      ultima: o.fecha,
    };
    c.ordenes += 1;
    c.saldo = r2(c.saldo + s);
    if (o.fecha > c.ultima) c.ultima = o.fecha;
    porCliente.set(nombre.toLowerCase(), c);
  }
  return [...porCliente.values()].sort((a, b) => b.saldo - a.saldo);
}

/** Para no importar dos veces la misma orden. */
export const claveOrden = (o: OrdenTrabajo) =>
  [o.numero.trim(), o.fecha, o.cliente.trim().toLowerCase(), r2(o.total)].join(
    "|",
  );

export function nuevaOrden(ordenes: OrdenTrabajo[], hoy: string): OrdenTrabajo {
  return {
    numero: proximoNumero(ordenes, hoy),
    fecha: hoy,
    cliente: "",
    tipo: "",
    detalle: "",
    cantidad: 1,
    total: 0,
    ivaAparte: 0,
    conFactura: false,
    factura: "",
    materiales: 0,
    plazoDias: null,
    estado: "No empezado",
    pagos: [],
  };
}
