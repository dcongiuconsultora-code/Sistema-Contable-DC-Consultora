import { normalizarNombre } from "@/lib/cuentas/cuenta-corriente";
import { conciliar } from "@/lib/movimientos/conciliar";
import { medio, type Movimiento } from "@/lib/movimientos/tipos";
import { type Clasificacion, clasificarMovimiento } from "./clasificar";
import type { MovimientoBancario, ResumenBancario } from "./tipos";

export type EstadoConciliacion =
  | "conciliado"
  | "sugerido"
  | "automatico"
  | "sin_registrar";

export interface FilaConciliacion {
  movimiento: MovimientoBancario;
  cuenta: string;
  estado: EstadoConciliacion;
  delCliente?: Movimiento;
  /** Cobro o pago propuesto porque el banco trae el CUIT o el nombre de un cliente o proveedor conocido. */
  sugerencia?: Movimiento;
  clasificacion: Clasificacion;
}

/** Clientes y proveedores conocidos (de Mis Comprobantes), por CUIT. */
export interface Conocidos {
  clientes: Map<string, string>;
  proveedores: Map<string, string>;
}

export interface Conciliacion {
  filas: FilaConciliacion[];
  /** Cobros y pagos que el cliente cargó por banco y no aparecen en el resumen (cheques o transferencias en tránsito, errores). */
  pendientesEnBanco: Movimiento[];
  totales: Record<EstadoConciliacion, { cantidad: number; importe: number }>;
}

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

function sumarDias(fecha: string, dias: number) {
  return new Date(Date.parse(fecha) + dias * 86400000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Concilia el resumen bancario con los cobros y pagos del cliente:
 * - conciliado: el cliente lo cargó (mismo importe y sentido, hasta 3 días de diferencia);
 * - sugerido: trae el CUIT o el nombre de un cliente o proveedor conocido: se propone el cobro o pago;
 * - automatico: lo resuelven las reglas (retenciones, impuesto al cheque, gastos bancarios...);
 * - sin_registrar: nadie lo cargó todavía.
 */
export function conciliarResumen(
  resumen: ResumenBancario,
  movimientos: Movimiento[],
  conocidos: Conocidos = { clientes: new Map(), proveedores: new Map() },
): Conciliacion {
  const clientePorNombre = new Map(
    [...conocidos.clientes].map(([cuit, nombre]) => [
      normalizarNombre(nombre),
      cuit,
    ]),
  );
  const proveedorPorNombre = new Map(
    [...conocidos.proveedores].map(([cuit, nombre]) => [
      normalizarNombre(nombre),
      cuit,
    ]),
  );
  const tipoCuenta = new Map(
    resumen.cuentas.map((c) => [
      c.numero,
      /AHORRO/i.test(c.tipo) ? "banco_ca" : "banco_cc",
    ]),
  );

  const sugerir = (
    m: MovimientoBancario,
    cuenta: string,
  ): Movimiento | undefined => {
    const { cuit, nombre } = sugerenciaDesdeBanco(m);
    const base = {
      id: `banco-${cuenta}-${m.fecha}-${m.referencia}-${m.importe}-${m.pagina}`,
      fecha: m.fecha,
      importe: Math.abs(m.importe),
      medio: tipoCuenta.get(cuenta) ?? "banco_cc",
      nota: m.descripcion,
      estado: "aprobado" as const,
    };
    // Por CUIT y, si el banco lo corta o no lo trae, por nombre.
    const cuitCliente = conocidos.clientes.has(cuit)
      ? cuit
      : clientePorNombre.get(normalizarNombre(nombre));
    if (m.importe > 0 && cuitCliente) {
      return {
        ...base,
        tipo: "cobro",
        contraparte: conocidos.clientes.get(cuitCliente)!,
        cuitContraparte: cuitCliente,
        retenciones: [],
      };
    }
    if (m.importe < 0) {
      const cuitProveedor = conocidos.proveedores.has(cuit)
        ? cuit
        : (proveedorPorNombre.get(normalizarNombre(nombre)) ??
          proveedorPorNombre.get(normalizarNombre(m.descripcion)));
      if (cuitProveedor) {
        return {
          ...base,
          tipo: "pago_proveedor",
          contraparte: conocidos.proveedores.get(cuitProveedor)!,
          cuitContraparte: cuitProveedor,
        };
      }
    }
    return undefined;
  };

  const todos = resumen.cuentas.flatMap((c) =>
    c.movimientos.map((m) => ({ m, cuenta: c.numero })),
  );
  const cruces = conciliar(
    todos.map((x) => x.m),
    movimientos,
  );

  const filas: FilaConciliacion[] = todos.map(({ m, cuenta }) => {
    const delCliente = cruces.get(m);
    const clasificacion = clasificarMovimiento(m);
    const sugerencia = delCliente ? undefined : sugerir(m, cuenta);
    const estado: EstadoConciliacion = delCliente
      ? "conciliado"
      : sugerencia
        ? "sugerido"
        : clasificacion.automatica
          ? "automatico"
          : "sin_registrar";
    return {
      movimiento: m,
      cuenta,
      estado,
      delCliente,
      sugerencia,
      clasificacion,
    };
  });

  // Los del cliente por banco dentro del período del resumen (con margen) que no se encontraron.
  const usados = new Set([...cruces.values()].map((m) => m.id));
  const desde = resumen.desde ? sumarDias(resumen.desde, -3) : null;
  const hasta = resumen.hasta ? sumarDias(resumen.hasta, 3) : null;
  const pendientesEnBanco = movimientos.filter(
    (m) =>
      m.estado !== "observado" &&
      medio(m.medio).bancario &&
      !usados.has(m.id) &&
      (!desde || m.fecha >= desde) &&
      (!hasta || m.fecha <= hasta),
  );

  const totales = {
    conciliado: { cantidad: 0, importe: 0 },
    sugerido: { cantidad: 0, importe: 0 },
    automatico: { cantidad: 0, importe: 0 },
    sin_registrar: { cantidad: 0, importe: 0 },
  };
  for (const f of filas) {
    totales[f.estado].cantidad++;
    totales[f.estado].importe = redondear(
      totales[f.estado].importe + Math.abs(f.movimiento.importe),
    );
  }
  return { filas, pendientesEnBanco, totales };
}

/** Datos para registrar un movimiento del banco que nadie cargó: CUIT y nombre que trae la descripción. */
export function sugerenciaDesdeBanco(m: MovimientoBancario): {
  cuit: string;
  nombre: string;
} {
  const cuit =
    m.descripcion.match(/\b((?:20|23|24|27|30|33|34)\d{9})\b/)?.[1] ?? "";
  const nombre = m.descripcion
    .replace(/^(ING\s+)?(TRANSF|TRF|TEF DATANET PR|CREDIN)[:\s]*/i, "")
    .replace(/\b\d{5,}\b.*$/, "")
    .replace(/-$/, "")
    .replace(/\s+VAR\b.*$/i, "")
    .trim();
  return { cuit, nombre };
}
