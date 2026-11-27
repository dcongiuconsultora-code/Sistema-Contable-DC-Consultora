import type { Comprobante, Reparto } from "@/lib/arca/tipos";
import type { Movimiento } from "@/lib/movimientos/tipos";

export interface Unidad {
  id: string;
  nombre: string;
  /** Las ventas de estos puntos de venta son de la unidad. */
  puntosVenta: number[];
  /** Los movimientos de estas cuentas bancarias son de la unidad (si la cuenta no se comparte). */
  cuentasBancarias: string[];
}

export interface ConfigUnidades {
  unidades: Unidad[];
  /** CUIT del proveedor → id de la unidad a la que le vende. */
  proveedores: Record<string, string>;
  /** CUIT del proveedor → prorrateo entre unidades (si le vende a varias). */
  repartos?: Record<string, Reparto>;
}

export const SIN_UNIDADES: ConfigUnidades = { unidades: [], proveedores: {} };

/** Prorrateo de una compra: el de la factura; si no, el del proveedor (salvo unidad elegida a mano). */
export function repartoDeCompra(
  c: Comprobante,
  cfg: ConfigUnidades,
): Reparto | null {
  if (c.reparto?.length) return c.reparto;
  if (c.unidad) return null;
  return cfg.repartos?.[c.cuitContraparte] ?? null;
}

/** Los pagos a un proveedor prorrateado se reparten igual que sus facturas. */
export function repartoDeMovimiento(
  m: Movimiento,
  cfg: ConfigUnidades,
): Reparto | null {
  if (m.unidad || !m.cuitContraparte) return null;
  if (!["pago_proveedor", "honorarios", "gasto"].includes(m.tipo)) return null;
  return cfg.repartos?.[m.cuitContraparte] ?? null;
}

/**
 * Cuánto de un asiento le toca a la unidad pedida (1 = todo, 0 = nada): undefined es toda la
 * empresa; null, lo compartido (sin unidad o lo que el prorrateo no asigna).
 */
export function pesoEnUnidad(
  a: { unidad?: string | null; reparto?: Reparto | null },
  filtro: string | null | undefined,
): number {
  if (filtro === undefined) return 1;
  if (a.reparto?.length) {
    const asignado = a.reparto.reduce((t, r) => t + r.porcentaje, 0);
    if (filtro === null) return Math.max(0, 100 - asignado) / 100;
    return (a.reparto.find((r) => r.unidad === filtro)?.porcentaje ?? 0) / 100;
  }
  return (a.unidad ?? null) === filtro ? 1 : 0;
}

/** Controla un prorrateo: porcentajes positivos que no pasan de 100. */
export function erroresReparto(r: Reparto): string[] {
  const e: string[] = [];
  if (r.some((x) => !(x.porcentaje > 0)))
    e.push("Los porcentajes tienen que ser mayores a 0.");
  const t = r.reduce((s, x) => s + x.porcentaje, 0);
  if (t > 100.0001)
    e.push(`Los porcentajes suman ${t} %: no pueden pasar de 100.`);
  return e;
}

/** Las ventas se asignan por punto de venta. */
export function unidadDeVenta(
  c: Comprobante,
  cfg: ConfigUnidades,
): string | null {
  return (
    cfg.unidades.find((u) => u.puntosVenta.includes(c.puntoVenta))?.id ?? null
  );
}

/** Las compras (y los tickets) se asignan por proveedor, salvo que se haya elegido la unidad a mano. */
export function unidadDeCompra(
  c: Comprobante,
  cfg: ConfigUnidades,
): string | null {
  return c.unidad ?? cfg.proveedores[c.cuitContraparte] ?? null;
}

/** Los cobros y pagos llevan la unidad que eligió quien los cargó; si no, la del proveedor. */
export function unidadDeMovimiento(
  m: Movimiento,
  cfg: ConfigUnidades,
): string | null {
  if (m.unidad) return m.unidad;
  if (
    (m.tipo === "pago_proveedor" ||
      m.tipo === "honorarios" ||
      m.tipo === "gasto") &&
    m.cuitContraparte
  ) {
    return cfg.proveedores[m.cuitContraparte] ?? null;
  }
  return null;
}

/** Un movimiento del banco es de una unidad solo si su cuenta es exclusiva de esa unidad. */
export function unidadDeCuenta(
  numeroCuenta: string,
  cfg: ConfigUnidades,
): string | null {
  const duenas = cfg.unidades.filter((u) =>
    u.cuentasBancarias.includes(numeroCuenta),
  );
  return duenas.length === 1 ? duenas[0].id : null;
}

export function nombreUnidad(id: string | null, cfg: ConfigUnidades) {
  if (!id) return "Compartido";
  return cfg.unidades.find((u) => u.id === id)?.nombre ?? "Compartido";
}
