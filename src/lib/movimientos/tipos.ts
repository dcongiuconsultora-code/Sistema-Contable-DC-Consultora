// Movimientos que carga el cliente: cobros, pagos, sueldos, honorarios, gastos, impuestos y
// movimientos con los socios. Las cuentas son las del plan modelo.

export type TipoMovimiento =
  | "cobro"
  | "pago_proveedor"
  | "sueldo"
  | "honorarios"
  | "gasto"
  | "impuesto"
  | "socios";

export type EstadoMovimiento = "enviado" | "aprobado" | "observado";

export interface MedioPago {
  id: string;
  nombre: string;
  /** Cuenta del medio cuando entra plata (cobro). */
  cuentaEntrada: string;
  /** Cuenta del medio cuando sale plata (pago). */
  cuentaSalida: string;
  /** Movimientos que tienen que aparecer en el resumen del banco. */
  bancario: boolean;
}

export const MEDIOS: MedioPago[] = [
  {
    id: "efectivo",
    nombre: "Efectivo",
    cuentaEntrada: "1.1.01.001",
    cuentaSalida: "1.1.01.001",
    bancario: false,
  },
  {
    id: "banco_cc",
    nombre: "Transferencia / débito - cuenta corriente",
    cuentaEntrada: "1.1.01.006",
    cuentaSalida: "1.1.01.006",
    bancario: true,
  },
  {
    id: "banco_ca",
    nombre: "Transferencia / débito - caja de ahorro",
    cuentaEntrada: "1.1.01.007",
    cuentaSalida: "1.1.01.007",
    bancario: true,
  },
  {
    id: "mercadopago",
    nombre: "Mercado Pago u otra billetera",
    cuentaEntrada: "1.1.01.009",
    cuentaSalida: "1.1.01.009",
    bancario: false,
  },
  {
    id: "cheque",
    nombre: "Cheque (recibido o emitido)",
    cuentaEntrada: "1.1.03.003",
    cuentaSalida: "2.1.01.003",
    bancario: false,
  },
  {
    id: "tarjeta",
    nombre: "Tarjeta (cobro con tarjeta / pago con tarjeta de crédito)",
    cuentaEntrada: "1.1.03.004",
    cuentaSalida: "2.1.01.004",
    bancario: false,
  },
];

export function medio(id: string) {
  const m = MEDIOS.find((x) => x.id === id);
  if (!m) throw new Error(`Medio de pago desconocido: ${id}`);
  return m;
}

export const CATEGORIAS_GASTO: [string, string][] = [
  ["5.3.01.007", "Alquiler"],
  ["5.3.01.009", "Luz"],
  ["5.3.01.010", "Gas"],
  ["5.3.01.011", "Agua"],
  ["5.3.01.012", "Teléfono e internet"],
  ["5.3.01.014", "Software y suscripciones"],
  ["5.3.01.016", "Mantenimiento y reparaciones"],
  ["5.3.01.017", "Limpieza"],
  ["5.3.01.018", "Combustible, movilidad y viáticos"],
  ["5.3.01.013", "Librería y útiles"],
  ["5.3.01.015", "Seguros"],
  ["5.2.01.004", "Publicidad"],
  ["5.2.01.005", "Fletes"],
  ["5.3.01.024", "Gastos bancarios"],
  ["5.3.01.027", "Otros gastos"],
];

export const IMPUESTOS: [string, string][] = [
  ["2.1.04.002", "IVA"],
  ["2.1.04.007", "Ingresos Brutos"],
  ["2.1.04.005", "Impuesto a las Ganancias"],
  ["2.1.03.005", "Cargas sociales (F.931)"],
  ["2.1.04.012", "Autónomos / monotributo"],
  ["2.1.04.013", "Plan de pagos ARCA"],
  ["2.1.04.014", "Plan de pagos provincial"],
  ["2.1.04.010", "Tasas municipales"],
  ["2.1.04.015", "Otro impuesto"],
];

export const CONCEPTOS_SUELDO: [string, string][] = [
  ["2.1.03.001", "Sueldo del mes"],
  ["2.1.03.002", "Aguinaldo (SAC)"],
  ["1.1.04.002", "Adelanto de sueldo"],
  ["2.1.03.010", "Liquidación final / indemnización"],
];

export const OPERACIONES_SOCIOS: [string, string, "entrada" | "salida"][] = [
  ["1.1.04.024", "Retiro de un socio", "salida"],
  ["3.1.01.003", "Aporte de un socio", "entrada"],
  ["2.1.02.004", "Préstamo de un socio", "entrada"],
];

export interface RetencionSufrida {
  impuesto: "IVA" | "Ganancias" | "IIBB";
  jurisdiccion?: string;
  importe: number;
}

export interface Movimiento {
  id: string;
  tipo: TipoMovimiento;
  fecha: string; // AAAA-MM-DD
  /** Lo que entra o sale efectivamente por el medio de pago. */
  importe: number;
  medio: string; // id de MEDIOS
  /** Proveedor, cliente, empleado o profesional. */
  contraparte: string;
  cuitContraparte: string;
  /**
   * Para gastos, impuestos, sueldos y socios: la cuenta elegida de su lista.
   * Para pagos con factura: se usa Proveedores.
   */
  cuenta?: string;
  /** Cuenta contable elegida a mano por quien carga o por el estudio: tiene prioridad. */
  imputacion?: string;
  /** Si el gasto u honorario tiene factura (que llega por ARCA o como ticket). */
  conFactura?: boolean;
  /** Retenciones que el cliente le hizo a la empresa al pagarle. Solo en cobros. */
  retenciones?: RetencionSufrida[];
  /** Período del sueldo o del impuesto (AAAA-MM). */
  periodo?: string;
  nota: string;
  estado: EstadoMovimiento;
  observacion?: string;
  /** "banco" si lo registró el estudio desde la conciliación bancaria; si no, lo cargó el cliente. */
  origen?: "cliente" | "banco";
  /** Unidad de negocio, en empresas que las tienen. */
  unidad?: string;
}

export const TIPOS: {
  id: TipoMovimiento;
  nombre: string;
  ayuda: string;
  entra: boolean;
}[] = [
  {
    id: "cobro",
    nombre: "Cobro de un cliente",
    ayuda: "Plata que te pagó un cliente",
    entra: true,
  },
  {
    id: "pago_proveedor",
    nombre: "Pago a un proveedor",
    ayuda: "Pago de facturas de compras",
    entra: false,
  },
  {
    id: "sueldo",
    nombre: "Pago de sueldo",
    ayuda: "Sueldos, aguinaldo, adelantos",
    entra: false,
  },
  {
    id: "honorarios",
    nombre: "Pago de honorarios",
    ayuda: "Contador, abogado, otros profesionales",
    entra: false,
  },
  {
    id: "gasto",
    nombre: "Gasto",
    ayuda: "Alquiler, servicios, combustible, etc.",
    entra: false,
  },
  {
    id: "impuesto",
    nombre: "Pago de impuestos",
    ayuda: "VEP, IIBB, F.931, planes de pago",
    entra: false,
  },
  {
    id: "socios",
    nombre: "Retiro o aporte de socios",
    ayuda: "Plata que sacan o ponen los dueños",
    entra: false,
  },
];

/** Si el movimiento hace entrar plata al medio de pago. */
export function entraPlata(m: Pick<Movimiento, "tipo" | "cuenta">) {
  if (m.tipo === "cobro") return true;
  if (m.tipo === "socios")
    return OPERACIONES_SOCIOS.find(([c]) => c === m.cuenta)?.[2] === "entrada";
  return false;
}
