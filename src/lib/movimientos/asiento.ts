import { cuitValido } from "@/lib/tickets/validar";
import { nombreCuenta } from "@/lib/plan/plan";
import { entraPlata, medio, type Movimiento } from "./tipos";

export interface LineaAsiento {
  cuenta: string;
  nombre: string;
  debe: number;
  haber: number;
  detalle?: string;
}

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

const CUENTAS_RETENCION = {
  IVA: "1.1.04.007",
  Ganancias: "1.1.04.010",
  IIBB: "1.1.04.014",
} as const;

/** La cuenta que va contra el medio de pago. */
export function cuentaDelMovimiento(m: Movimiento): string {
  if (m.imputacion) return m.imputacion;
  switch (m.tipo) {
    case "cobro":
      return "1.1.03.001"; // Deudores por ventas: la factura ya entró por Mis Comprobantes emitidos
    case "pago_proveedor":
      return "2.1.01.001"; // Proveedores: la factura entra por Mis Comprobantes recibidos
    case "honorarios":
      return m.conFactura === false ? "5.3.01.005" : "2.1.01.001";
    case "gasto":
      return m.conFactura ? "2.1.01.001" : (m.cuenta ?? "5.3.01.027");
    case "sueldo":
      return m.cuenta ?? "2.1.03.001";
    case "impuesto":
      return m.cuenta ?? "2.1.04.015";
    case "socios":
      return m.cuenta ?? "1.1.04.024";
  }
}

/** Asiento que genera el movimiento. Debe y haber siempre balancean. */
export function generarAsiento(m: Movimiento): LineaAsiento[] {
  const linea = (
    cuenta: string,
    debe: number,
    haber: number,
    detalle?: string,
  ): LineaAsiento => ({
    cuenta,
    nombre: nombreCuenta(cuenta),
    debe: redondear(debe),
    haber: redondear(haber),
    detalle,
  });
  const mp = medio(m.medio);
  const contra = cuentaDelMovimiento(m);
  const detalle = m.contraparte || undefined;

  if (m.tipo === "cobro") {
    // Lo que el cliente retuvo también cancela la factura: total cobrado = importe recibido + retenciones.
    const retenciones = (m.retenciones ?? []).filter((r) => r.importe > 0);
    const totalRetenido = retenciones.reduce((s, r) => s + r.importe, 0);
    return [
      linea(mp.cuentaEntrada, m.importe, 0),
      ...retenciones.map((r) =>
        linea(
          CUENTAS_RETENCION[r.impuesto],
          r.importe,
          0,
          r.jurisdiccion ? `${r.impuesto} ${r.jurisdiccion}` : r.impuesto,
        ),
      ),
      linea(contra, 0, m.importe + totalRetenido, detalle),
    ];
  }
  if (entraPlata(m)) {
    return [
      linea(mp.cuentaEntrada, m.importe, 0),
      linea(contra, 0, m.importe, detalle),
    ];
  }
  return [
    linea(contra, m.importe, 0, detalle),
    linea(mp.cuentaSalida, 0, m.importe),
  ];
}

export function totalesAsiento(lineas: LineaAsiento[]) {
  const debe = redondear(lineas.reduce((s, l) => s + l.debe, 0));
  const haber = redondear(lineas.reduce((s, l) => s + l.haber, 0));
  return { debe, haber, balancea: debe === haber };
}

/** Errores que impiden enviar el movimiento. */
export function validarMovimiento(m: Movimiento, hoy = new Date()): string[] {
  const errores: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.fecha)) errores.push("Falta la fecha.");
  else if (Date.parse(m.fecha) > hoy.getTime() + 86400000)
    errores.push("La fecha es posterior a hoy.");
  if (!(m.importe > 0)) errores.push("El importe tiene que ser mayor a cero.");
  if (
    ["cobro", "pago_proveedor", "honorarios", "sueldo"].includes(m.tipo) &&
    !m.contraparte.trim()
  ) {
    errores.push(
      m.tipo === "sueldo"
        ? "Falta el nombre del empleado."
        : m.tipo === "cobro"
          ? "Falta el cliente."
          : "Falta a quién se le pagó.",
    );
  }
  if (m.cuitContraparte && !cuitValido(m.cuitContraparte))
    errores.push("El CUIT/CUIL no es válido.");
  if (
    ["gasto", "impuesto", "sueldo", "socios"].includes(m.tipo) &&
    !m.cuenta &&
    !(m.tipo === "gasto" && m.conFactura)
  ) {
    errores.push("Elegí el concepto.");
  }
  for (const r of m.retenciones ?? []) {
    if (r.importe < 0) errores.push("Las retenciones no pueden ser negativas.");
    if (r.impuesto === "IIBB" && r.importe > 0 && !r.jurisdiccion)
      errores.push("Indicá la provincia de la retención de IIBB.");
  }
  return errores;
}
