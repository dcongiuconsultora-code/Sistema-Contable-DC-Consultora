import type { Comprobante } from "@/lib/arca/tipos";
import type { FilaConciliacion } from "@/lib/bancos/conciliacion";
import { generarAsiento, type LineaAsiento } from "@/lib/movimientos/asiento";
import type { Movimiento } from "@/lib/movimientos/tipos";
import { nombreCuenta } from "@/lib/plan/plan";
import {
  type ConfigUnidades,
  SIN_UNIDADES,
  unidadDeCompra,
  unidadDeCuenta,
  unidadDeMovimiento,
  unidadDeVenta,
} from "@/lib/unidades/unidades";

export interface Asiento {
  /** Solo los asientos manuales, para poder borrarlos. */
  id?: string;
  fecha: string;
  origen: "ARCA" | "Cliente" | "Banco" | "Manual" | "Cierre";
  descripcion: string;
  lineas: LineaAsiento[];
  /** Unidad de negocio; null = de toda la empresa (o compartido entre unidades). */
  unidad?: string | null;
}

// Cuentas por defecto mientras no haya una configuración por cliente o por proveedor.
export const CUENTAS_DEFECTO = {
  ventas: "4.1.01.001", // Ventas de mercaderías
  compras: "5.1.01.004", // Compras de mercaderías
  deudores: "1.1.03.001",
  proveedores: "2.1.01.001",
  ivaDebito: "2.1.04.001",
  ivaCredito: "1.1.04.004",
  // ARCA informa las percepciones juntas en "Otros tributos": se toman como de IVA hasta clasificarlas.
  percepcionesCompras: "1.1.04.008",
  tributosVentas: "2.1.04.015",
};

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

function linea(
  cuenta: string,
  debe: number,
  haber: number,
  detalle?: string,
): LineaAsiento {
  // Un importe negativo (nota de crédito) pasa al otro lado.
  const d = redondear(debe - haber);
  return {
    cuenta,
    nombre: nombreCuenta(cuenta),
    debe: d > 0 ? d : 0,
    haber: d < 0 ? -d : 0,
    detalle,
  };
}

function sinCeros(lineas: LineaAsiento[]) {
  return lineas.filter((l) => l.debe !== 0 || l.haber !== 0);
}

function descripcionComprobante(c: Comprobante) {
  return `${c.tipoNombre} ${String(c.puntoVenta).padStart(5, "0")}-${String(c.numeroDesde).padStart(8, "0")}${c.contraparte ? ` · ${c.contraparte}` : ""}`;
}

/** Venta (comprobante emitido): Deudores contra Ventas, IVA débito fiscal y otros tributos. */
export function asientoVenta(c: Comprobante): Asiento {
  const neto = c.netoGravado + c.noGravado + c.exento;
  return {
    fecha: c.fecha,
    origen: "ARCA",
    descripcion: descripcionComprobante(c),
    lineas: sinCeros([
      linea(
        CUENTAS_DEFECTO.deudores,
        c.total,
        0,
        c.contraparte || "Consumidor final",
      ),
      linea(CUENTAS_DEFECTO.ventas, 0, neto),
      linea(CUENTAS_DEFECTO.ivaDebito, 0, c.iva),
      linea(CUENTAS_DEFECTO.tributosVentas, 0, c.otrosTributos),
    ]),
  };
}

/** Compra (recibido o ticket): Compras, IVA crédito fiscal y percepciones contra Proveedores. */
export function asientoCompra(c: Comprobante): Asiento {
  const neto = c.netoGravado + c.noGravado + c.exento;
  return {
    fecha: c.fecha,
    origen: "ARCA",
    descripcion: descripcionComprobante(c),
    lineas: sinCeros([
      linea(CUENTAS_DEFECTO.compras, neto, 0),
      linea(CUENTAS_DEFECTO.ivaCredito, c.iva, 0),
      linea(CUENTAS_DEFECTO.percepcionesCompras, c.otrosTributos, 0),
      linea(CUENTAS_DEFECTO.proveedores, 0, c.total, c.contraparte),
    ]),
  };
}

/**
 * Movimientos del banco que resuelven las reglas (impuestos, retenciones, gastos bancarios,
 * cobros de contado). Los conciliados ya están en los movimientos del cliente; los sugeridos y
 * los sin registrar todavía no se contabilizan.
 */
export function asientoBancario(
  f: FilaConciliacion,
  cuentaBanco: string,
): Asiento | null {
  if (f.estado !== "automatico" || !f.clasificacion.cuenta) return null;
  const m = f.movimiento;
  const importe = Math.abs(m.importe);
  const contra = f.clasificacion.cuenta;
  return {
    fecha: m.fecha,
    origen: "Banco",
    descripcion: `${f.clasificacion.concepto} · ${m.descripcion}`,
    lineas:
      m.importe < 0
        ? [linea(contra, importe, 0), linea(cuentaBanco, 0, importe)]
        : [linea(cuentaBanco, importe, 0), linea(contra, 0, importe)],
  };
}

export interface FuentesDiario {
  ventas: Comprobante[];
  compras: Comprobante[];
  movimientos: Movimiento[];
  banco: { fila: FilaConciliacion; cuentaBanco: string }[];
  unidades?: ConfigUnidades;
  /** Asientos que cargó el estudio a mano. */
  manuales?: Asiento[];
}

/** Libro diario con todo lo que entró al sistema, ordenado por fecha. */
export function generarDiario(f: FuentesDiario): Asiento[] {
  const cfg = f.unidades ?? SIN_UNIDADES;
  const asientos: Asiento[] = [
    ...f.ventas.map((c) => ({
      ...asientoVenta(c),
      unidad: unidadDeVenta(c, cfg),
    })),
    ...f.compras.map((c) => ({
      ...asientoCompra(c),
      unidad: unidadDeCompra(c, cfg),
    })),
    ...f.movimientos
      .filter((m) => m.estado !== "observado")
      .map((m) => ({
        fecha: m.fecha,
        origen:
          m.origen === "banco" ? ("Banco" as const) : ("Cliente" as const),
        descripcion: m.contraparte || m.nota || m.tipo,
        lineas: generarAsiento(m),
        unidad: unidadDeMovimiento(m, cfg),
      })),
    ...f.banco
      .map(({ fila, cuentaBanco }): Asiento | null => {
        const a = asientoBancario(fila, cuentaBanco);
        return a && { ...a, unidad: unidadDeCuenta(fila.cuenta, cfg) };
      })
      .filter((a): a is Asiento => a !== null),
    ...(f.manuales ?? []),
  ];
  return asientos.sort((a, b) => a.fecha.localeCompare(b.fecha));
}
