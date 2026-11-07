// Conversión entre las filas de Supabase y los tipos de la app. Funciones puras, sin red.
import type { Deduccion } from "@/lib/arca/retenciones";
import type { Comprobante, Operacion } from "@/lib/arca/tipos";
import type { CuentaBancaria, ResumenBancario } from "@/lib/bancos/tipos";
import type { Movimiento } from "@/lib/movimientos/tipos";

export interface FilaComprobante {
  id?: string;
  empresa_id: string;
  operacion: Operacion;
  origen: "arca" | "ticket";
  archivo_id?: string | null;
  fecha: string;
  tipo_codigo: number;
  tipo_nombre: string;
  letra: string;
  clase: string;
  punto_venta: number;
  numero_desde: number;
  numero_hasta: number;
  cae: string;
  cuit_contraparte: string;
  contraparte: string;
  moneda: string;
  tipo_cambio: number;
  alicuotas: Comprobante["alicuotas"];
  neto_gravado: number;
  no_gravado: number;
  exento: number;
  otros_tributos: number;
  iva: number;
  total: number;
  computa_iva: boolean;
  advertencias: string[];
}

export function comprobanteAFila(
  c: Comprobante,
  empresaId: string,
  operacion: Operacion,
  archivoId: string | null,
): FilaComprobante {
  return {
    empresa_id: empresaId,
    operacion,
    origen: "arca",
    archivo_id: archivoId,
    fecha: c.fecha,
    tipo_codigo: c.tipoCodigo,
    tipo_nombre: c.tipoNombre,
    letra: c.letra,
    clase: c.clase,
    punto_venta: c.puntoVenta,
    numero_desde: c.numeroDesde,
    numero_hasta: c.numeroHasta,
    cae: c.cae,
    cuit_contraparte: c.cuitContraparte,
    contraparte: c.contraparte,
    moneda: c.moneda,
    tipo_cambio: c.tipoCambio,
    alicuotas: c.alicuotas,
    neto_gravado: c.netoGravado,
    no_gravado: c.noGravado,
    exento: c.exento,
    otros_tributos: c.otrosTributos,
    iva: c.iva,
    total: c.total,
    computa_iva: c.computaIva,
    advertencias: c.advertencias,
  };
}

/** Postgres devuelve los numeric como texto: se convierten acá. */
const num = (v: unknown) => Number(v ?? 0);

export function filaAComprobante(
  f: FilaComprobante,
  fila: number,
): Comprobante {
  return {
    fila,
    fecha: f.fecha,
    periodo: f.fecha.slice(0, 7),
    tipoCodigo: f.tipo_codigo,
    tipoNombre: f.tipo_nombre,
    letra: f.letra as Comprobante["letra"],
    clase: f.clase as Comprobante["clase"],
    puntoVenta: f.punto_venta,
    numeroDesde: num(f.numero_desde),
    numeroHasta: num(f.numero_hasta),
    cae: f.cae,
    cuitContraparte: f.cuit_contraparte,
    contraparte: f.contraparte,
    moneda: f.moneda,
    tipoCambio: num(f.tipo_cambio),
    alicuotas: (f.alicuotas ?? []).map((a) => ({
      tasa: a.tasa === null ? null : num(a.tasa),
      neto: num(a.neto),
      iva: num(a.iva),
    })),
    netoGravado: num(f.neto_gravado),
    noGravado: num(f.no_gravado),
    exento: num(f.exento),
    otrosTributos: num(f.otros_tributos),
    iva: num(f.iva),
    total: num(f.total),
    computaIva: f.computa_iva,
    advertencias: f.advertencias ?? [],
  };
}

export interface FilaMovimiento {
  id: string;
  empresa_id: string;
  tipo: Movimiento["tipo"];
  fecha: string;
  importe: number;
  medio: string;
  contraparte: string;
  cuit_contraparte: string;
  cuenta: string | null;
  con_factura: boolean | null;
  retenciones: NonNullable<Movimiento["retenciones"]>;
  periodo: string | null;
  nota: string;
  estado: Movimiento["estado"];
  observacion: string | null;
  origen: "cliente" | "banco";
  unidad_id: string | null;
}

export function movimientoAFila(
  m: Movimiento,
  empresaId: string,
): FilaMovimiento {
  return {
    id: m.id,
    empresa_id: empresaId,
    tipo: m.tipo,
    fecha: m.fecha,
    importe: m.importe,
    medio: m.medio,
    contraparte: m.contraparte,
    cuit_contraparte: m.cuitContraparte,
    cuenta: m.cuenta ?? null,
    con_factura: m.conFactura ?? null,
    retenciones: m.retenciones ?? [],
    periodo: m.periodo ?? null,
    nota: m.nota,
    estado: m.estado,
    observacion: m.observacion ?? null,
    origen: m.origen ?? "cliente",
    unidad_id: m.unidad ?? null,
  };
}

export function filaAMovimiento(f: FilaMovimiento): Movimiento {
  return {
    id: f.id,
    tipo: f.tipo,
    fecha: f.fecha,
    importe: num(f.importe),
    medio: f.medio,
    contraparte: f.contraparte,
    cuitContraparte: f.cuit_contraparte,
    cuenta: f.cuenta ?? undefined,
    conFactura: f.con_factura ?? undefined,
    retenciones:
      f.tipo === "cobro"
        ? (f.retenciones ?? []).map((r) => ({ ...r, importe: num(r.importe) }))
        : undefined,
    periodo: f.periodo ?? undefined,
    nota: f.nota,
    estado: f.estado,
    observacion: f.observacion ?? undefined,
    origen: f.origen,
    unidad: f.unidad_id ?? undefined,
  };
}

export interface FilaDeduccion {
  empresa_id: string;
  archivo_id: string | null;
  origen: string;
  impuesto: Deduccion["impuesto"];
  jurisdiccion: string | null;
  tipo: Deduccion["tipo"];
  fecha: string;
  cuit_agente: string;
  agente: string;
  regimen: string;
  certificado: string;
  comprobante: string;
  importe: number;
}

export function deduccionAFila(
  d: Deduccion,
  empresaId: string,
  archivoId: string | null,
): FilaDeduccion {
  return {
    empresa_id: empresaId,
    archivo_id: archivoId,
    origen: d.origen,
    impuesto: d.impuesto,
    jurisdiccion: d.jurisdiccion,
    tipo: d.tipo,
    fecha: d.fecha,
    cuit_agente: d.cuitAgente,
    agente: d.agente,
    regimen: d.regimen,
    certificado: d.certificado,
    comprobante: d.comprobante,
    importe: d.importe,
  };
}

export function filaADeduccion(f: FilaDeduccion): Deduccion {
  return {
    origen: f.origen as Deduccion["origen"],
    impuesto: f.impuesto,
    jurisdiccion: f.jurisdiccion,
    tipo: f.tipo,
    fecha: f.fecha,
    periodo: f.fecha.slice(0, 7),
    cuitAgente: f.cuit_agente,
    agente: f.agente,
    regimen: f.regimen,
    certificado: f.certificado,
    comprobante: f.comprobante,
    importe: num(f.importe),
  };
}

/** Lo que se guarda del resumen bancario aparte de los movimientos. */
export interface DatosResumen {
  banco: string;
  titular: string;
  cuit: string;
  desde: string | null;
  hasta: string | null;
  controles: string[];
  cuentas: Omit<CuentaBancaria, "movimientos">[];
}

export interface FilaMovimientoBancario {
  empresa_id: string;
  archivo_id: string;
  banco: string;
  cuenta: string;
  tipo_cuenta: string;
  fecha: string;
  descripcion: string;
  referencia: string;
  importe: number;
  saldo: number | null;
  orden: number;
  pagina: number;
}

export function resumenAFilas(
  r: ResumenBancario,
  empresaId: string,
  archivoId: string,
): { datos: DatosResumen; filas: FilaMovimientoBancario[] } {
  let orden = 0;
  return {
    datos: {
      banco: r.banco,
      titular: r.titular,
      cuit: r.cuit,
      desde: r.desde,
      hasta: r.hasta,
      controles: r.controles,
      cuentas: r.cuentas.map((c) => ({
        banco: c.banco,
        tipo: c.tipo,
        numero: c.numero,
        moneda: c.moneda,
        saldoInicial: c.saldoInicial,
        saldoFinal: c.saldoFinal,
        impuestoDebitosCreditos: c.impuestoDebitosCreditos,
      })),
    },
    filas: r.cuentas.flatMap((c) =>
      c.movimientos.map((m) => ({
        empresa_id: empresaId,
        archivo_id: archivoId,
        banco: c.banco,
        cuenta: c.numero,
        tipo_cuenta: c.tipo,
        fecha: m.fecha,
        descripcion: m.descripcion,
        referencia: m.referencia,
        importe: m.importe,
        saldo: m.saldo,
        orden: orden++,
        pagina: m.pagina,
      })),
    ),
  };
}

export function filasAResumen(
  datos: DatosResumen,
  filas: FilaMovimientoBancario[],
): ResumenBancario {
  const ordenadas = [...filas].sort((a, b) => a.orden - b.orden);
  return {
    banco: datos.banco,
    titular: datos.titular,
    cuit: datos.cuit,
    desde: datos.desde,
    hasta: datos.hasta,
    controles: datos.controles,
    cuentas: datos.cuentas.map((c) => ({
      ...c,
      movimientos: ordenadas
        .filter((f) => f.cuenta === c.numero)
        .map((f) => ({
          fecha: f.fecha,
          descripcion: f.descripcion,
          referencia: f.referencia,
          importe: num(f.importe),
          saldo: f.saldo === null ? null : num(f.saldo),
          pagina: f.pagina,
        })),
    })),
  };
}
