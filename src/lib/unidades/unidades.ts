import type { Comprobante } from "@/lib/arca/tipos";
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
}

export const SIN_UNIDADES: ConfigUnidades = { unidades: [], proveedores: {} };

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
