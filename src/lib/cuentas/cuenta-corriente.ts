import type { Comprobante } from "@/lib/arca/tipos";
import type { Movimiento } from "@/lib/movimientos/tipos";

export type Lado = "cliente" | "proveedor";

export interface ItemCuenta {
  fecha: string;
  descripcion: string;
  /** Aumenta la deuda: facturas y notas de débito. */
  cargo: number;
  /** La disminuye: cobros, pagos, retenciones y notas de crédito. */
  abono: number;
  saldo: number;
  origen: "ARCA" | "Ticket" | "Cliente" | "Banco";
  /** Movimiento cargado por el cliente que el estudio todavía no aprobó. */
  sinAprobar?: boolean;
}

export interface ComprobantePendiente {
  fecha: string;
  descripcion: string;
  total: number;
  pendiente: number;
  dias: number;
}

export interface CuentaCorriente {
  clave: string;
  nombre: string;
  cuit: string;
  lado: Lado;
  items: ItemCuenta[];
  /** Positivo: el cliente nos debe / le debemos al proveedor. Negativo: saldo a favor. */
  saldo: number;
  pendientes: ComprobantePendiente[];
  antiguedad: {
    hasta30: number;
    hasta60: number;
    hasta90: number;
    mas90: number;
  };
}

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

export function normalizarNombre(nombre: string) {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(
      /\b(S\.?\s?A\.?\s?I?\.?\s?C?\.?|S\.?\s?R\.?\s?L\.?|S\.?\s?A\.?\s?S\.?)\s*$/g,
      "",
    )
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

function numeroComprobante(c: Comprobante) {
  return `${c.tipoNombre} ${String(c.puntoVenta).padStart(5, "0")}-${String(c.numeroDesde).padStart(8, "0")}`;
}

/** Movimientos del cliente que afectan la cuenta corriente de un cliente o proveedor. */
function ladoDelMovimiento(m: Movimiento): Lado | null {
  if (m.tipo === "cobro") return "cliente";
  if (m.tipo === "pago_proveedor") return "proveedor";
  if (
    (m.tipo === "honorarios" || m.tipo === "gasto") &&
    m.conFactura !== false &&
    m.contraparte.trim()
  )
    return "proveedor";
  return null;
}

function diasEntre(desde: string, hasta: string) {
  return Math.max(
    0,
    Math.floor((Date.parse(hasta) - Date.parse(desde)) / 86400000),
  );
}

/**
 * Arma las cuentas corrientes de clientes (con los comprobantes emitidos) o de proveedores (con
 * los recibidos y los tickets), y les aplica los cobros o pagos que cargó el cliente. Se agrupan
 * por CUIT; un movimiento sin CUIT se asigna por nombre. Los comprobantes a consumidor final (sin
 * CUIT) no tienen cuenta corriente.
 */
export function cuentasCorrientes(
  lado: Lado,
  comprobantes: Comprobante[],
  movimientos: Movimiento[],
  fechaCorte: string,
  origenComprobantes: (c: Comprobante) => ItemCuenta["origen"] = () => "ARCA",
): CuentaCorriente[] {
  const cuentas = new Map<
    string,
    { nombre: string; cuit: string; items: Omit<ItemCuenta, "saldo">[] }
  >();
  const cuitPorNombre = new Map<string, string>();

  const obtener = (clave: string, nombre: string, cuit: string) => {
    let c = cuentas.get(clave);
    if (!c) {
      c = { nombre, cuit, items: [] };
      cuentas.set(clave, c);
    }
    if (!c.nombre && nombre) c.nombre = nombre;
    return c;
  };

  for (const c of comprobantes) {
    if (c.cuitContraparte.length !== 11) continue;
    if (c.contraparte)
      cuitPorNombre.set(normalizarNombre(c.contraparte), c.cuitContraparte);
    const cuenta = obtener(c.cuitContraparte, c.contraparte, c.cuitContraparte);
    const importe = Math.abs(c.total);
    const resta = c.total < 0;
    cuenta.items.push({
      fecha: c.fecha,
      descripcion: numeroComprobante(c),
      cargo: resta ? 0 : importe,
      abono: resta ? importe : 0,
      origen: origenComprobantes(c),
    });
  }

  for (const m of movimientos) {
    if (m.estado === "observado" || ladoDelMovimiento(m) !== lado) continue;
    const cuit =
      m.cuitContraparte.length === 11
        ? m.cuitContraparte
        : cuitPorNombre.get(normalizarNombre(m.contraparte));
    const clave = cuit ?? `nombre:${normalizarNombre(m.contraparte)}`;
    const cuenta = obtener(clave, m.contraparte, cuit ?? "");
    const retenciones = (m.retenciones ?? []).filter((r) => r.importe > 0);
    const base = {
      fecha: m.fecha,
      cargo: 0,
      // Los registrados desde la conciliación bancaria los crea el estudio.
      origen: m.origen === "banco" ? ("Banco" as const) : ("Cliente" as const),
      sinAprobar: m.estado !== "aprobado",
    };
    cuenta.items.push({
      ...base,
      descripcion: m.tipo === "cobro" ? "Cobro" : "Pago",
      abono: m.importe,
    });
    for (const r of retenciones) {
      cuenta.items.push({
        ...base,
        descripcion: `Retención ${r.impuesto}${r.jurisdiccion ? ` ${r.jurisdiccion}` : ""}`,
        abono: r.importe,
      });
    }
  }

  return [...cuentas.entries()]
    .map(([clave, c]) => {
      // En la misma fecha, primero el comprobante y después el pago.
      const ordenados = [...c.items].sort(
        (a, b) => a.fecha.localeCompare(b.fecha) || b.cargo - a.cargo,
      );
      let saldo = 0;
      const items = ordenados.map((i) => {
        saldo = redondear(saldo + i.cargo - i.abono);
        return { ...i, saldo };
      });

      // Antigüedad: los pagos cancelan primero los comprobantes más viejos.
      let disponible = items.reduce((s, i) => s + i.abono, 0);
      const pendientes: ComprobantePendiente[] = [];
      for (const i of items.filter((x) => x.cargo > 0)) {
        const aplicado = Math.min(disponible, i.cargo);
        disponible -= aplicado;
        const pendiente = redondear(i.cargo - aplicado);
        if (pendiente > 0.005) {
          pendientes.push({
            fecha: i.fecha,
            descripcion: i.descripcion,
            total: i.cargo,
            pendiente,
            dias: diasEntre(i.fecha, fechaCorte),
          });
        }
      }
      const antiguedad = { hasta30: 0, hasta60: 0, hasta90: 0, mas90: 0 };
      for (const p of pendientes) {
        const tramo =
          p.dias <= 30
            ? "hasta30"
            : p.dias <= 60
              ? "hasta60"
              : p.dias <= 90
                ? "hasta90"
                : "mas90";
        antiguedad[tramo] = redondear(antiguedad[tramo] + p.pendiente);
      }

      return {
        clave,
        nombre: c.nombre || c.cuit,
        cuit: c.cuit,
        lado,
        items,
        saldo,
        pendientes,
        antiguedad,
      };
    })
    .sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo));
}
