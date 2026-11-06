import { interpretarTipo } from "@/lib/arca/tipos-comprobante";
import type { Alicuota, Comprobante } from "@/lib/arca/tipos";
import { pesos } from "@/lib/formato";
import type { TicketExtraido } from "./esquema";
import type { DatosQr } from "./qr";

export type Gravedad = "error" | "aviso";

export interface Observacion {
  gravedad: Gravedad;
  mensaje: string;
}

function redondear(n: number) {
  return Math.round(n * 100) / 100;
}

/** Dígito verificador del CUIT (módulo 11). */
export function cuitValido(cuit: string): boolean {
  const d = cuit.replace(/\D/g, "");
  if (d.length !== 11) return false;
  const pesosCuit = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesosCuit.reduce((s, p, i) => s + p * Number(d[i]), 0);
  const resto = 11 - (suma % 11);
  const verificador = resto === 11 ? 0 : resto === 10 ? 9 : resto;
  return verificador === Number(d[10]);
}

/** Los datos del QR son exactos: reemplazan a lo leído en la foto. */
export function combinarConQr(
  t: TicketExtraido,
  qr: DatosQr | null,
): TicketExtraido {
  if (!qr) return t;
  return {
    ...t,
    legible: true,
    tipoCodigo: qr.tipoCodigo || t.tipoCodigo,
    cuitEmisor: qr.cuitEmisor,
    cuitReceptor: qr.cuitReceptor || t.cuitReceptor,
    puntoVenta: qr.puntoVenta || t.puntoVenta,
    numero: qr.numero || t.numero,
    fecha: qr.fecha || t.fecha,
    total: qr.moneda === "PES" ? qr.total : t.total,
    cae: qr.codigoAutorizacion || t.cae,
  };
}

export interface TicketRevisado {
  datos: TicketExtraido;
  observaciones: Observacion[];
  /** true si genera crédito fiscal para el cliente. */
  computaIva: boolean;
}

/**
 * Controles para que el estudio confíe en lo cargado: CUIT válido, sumas que cierran, IVA que
 * corresponde a la alícuota y que el tique sea a nombre del cliente para computar crédito fiscal.
 */
export function revisarTicket(
  datos: TicketExtraido,
  cuitCliente: string | null,
  hoy = new Date(),
): TicketRevisado {
  const obs: Observacion[] = [];
  const error = (mensaje: string) => obs.push({ gravedad: "error", mensaje });
  const aviso = (mensaje: string) => obs.push({ gravedad: "aviso", mensaje });

  if (!datos.legible)
    error(
      "No se pudo leer el comprobante. Probá con otra foto, derecha y con buena luz.",
    );
  if (!cuitValido(datos.cuitEmisor))
    error("El CUIT del emisor no es válido: revisalo.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha) ||
    Number.isNaN(Date.parse(datos.fecha))
  ) {
    error("La fecha no es válida.");
  } else if (Date.parse(datos.fecha) > hoy.getTime() + 86400000) {
    error("La fecha es posterior a hoy.");
  }
  if (!datos.numero) error("Falta el número del comprobante.");
  if (datos.total <= 0) error("Falta el total.");

  const tipo = interpretarTipo(datos.tipoCodigo || datos.tipoTexto);
  const letra = tipo?.letra ?? "";
  const aNombreDelCliente =
    !cuitCliente || datos.cuitReceptor === cuitCliente.replace(/\D/g, "");
  const computaIva = (letra === "A" || letra === "M") && aNombreDelCliente;

  if (letra === "A" || letra === "M") {
    if (!datos.cuitReceptor)
      aviso(
        "El comprobante A no muestra el CUIT del comprador: confirmá que sea a nombre del cliente.",
      );
    else if (!aNombreDelCliente)
      error(
        "El comprobante está a nombre de otro CUIT: no genera crédito fiscal para este cliente.",
      );
  } else if (tipo) {
    aviso(
      `${tipo.nombre}: no genera crédito fiscal. Se carga como gasto por el total.`,
    );
  }

  for (const [tasa, neto, iva] of [
    [21, datos.netoGravado21, datos.iva21],
    [10.5, datos.netoGravado105, datos.iva105],
    [27, datos.netoGravado27, datos.iva27],
  ] as const) {
    if (
      neto > 0 &&
      Math.abs(redondear((neto * tasa) / 100) - iva) > Math.max(1, iva * 0.01)
    ) {
      aviso(
        `El IVA ${String(tasa).replace(".", ",")}% (${pesos(iva)}) no corresponde al neto (${pesos(neto)}).`,
      );
    }
  }

  const suma = redondear(
    datos.netoGravado21 +
      datos.netoGravado105 +
      datos.netoGravado27 +
      datos.iva21 +
      datos.iva105 +
      datos.iva27 +
      datos.noGravado +
      datos.percepcionIva +
      datos.percepcionIibb +
      datos.otrosTributos,
  );
  if (computaIva && Math.abs(suma - datos.total) > 1) {
    aviso(
      `Los importes suman ${pesos(suma)} y el total es ${pesos(datos.total)}: revisá si falta algún concepto.`,
    );
  }

  for (const duda of datos.dudas) aviso(`Lectura dudosa: ${duda}`);
  return { datos, observaciones: obs, computaIva };
}

/** Convierte un ticket revisado en un comprobante de compra, igual que los que vienen de ARCA. */
export function ticketAComprobante(
  r: TicketRevisado,
  fila: number,
): Comprobante {
  const d = r.datos;
  const tipo = interpretarTipo(d.tipoCodigo || d.tipoTexto);
  const signo = tipo?.clase === "nota_credito" ? -1 : 1;
  const s = (n: number) => redondear(n * signo);

  let alicuotas: Alicuota[] = [];
  let netoGravado = 0;
  let iva = 0;
  let noGravado: number;
  if (r.computaIva) {
    alicuotas = (
      [
        { tasa: 21, neto: d.netoGravado21, iva: d.iva21 },
        { tasa: 10.5, neto: d.netoGravado105, iva: d.iva105 },
        { tasa: 27, neto: d.netoGravado27, iva: d.iva27 },
      ] as Alicuota[]
    )
      .filter((a) => a.neto || a.iva)
      .map((a) => ({ tasa: a.tasa, neto: s(a.neto), iva: s(a.iva) }));
    netoGravado = redondear(alicuotas.reduce((t, a) => t + a.neto, 0));
    iva = redondear(alicuotas.reduce((t, a) => t + a.iva, 0));
    noGravado = s(d.noGravado);
  } else {
    // Sin crédito fiscal todo va a no gravado, como las facturas B y C recibidas de ARCA.
    noGravado = s(d.total - d.otrosTributos);
  }

  return {
    fila,
    fecha: d.fecha,
    periodo: d.fecha.slice(0, 7),
    tipoCodigo: tipo?.codigo ?? 0,
    tipoNombre: tipo?.nombre ?? (d.tipoTexto || "Comprobante"),
    letra: tipo?.letra ?? "",
    clase: tipo?.clase ?? "factura",
    puntoVenta: d.puntoVenta,
    numeroDesde: d.numero,
    numeroHasta: d.numero,
    cae: d.cae,
    cuitContraparte: d.cuitEmisor,
    contraparte: d.razonSocialEmisor,
    moneda: "ARS",
    tipoCambio: 1,
    alicuotas,
    netoGravado,
    noGravado,
    exento: 0,
    otrosTributos: r.computaIva
      ? s(d.percepcionIva + d.percepcionIibb + d.otrosTributos)
      : s(d.otrosTributos),
    iva,
    total: s(d.total),
    computaIva: r.computaIva,
    advertencias: r.observaciones.map((o) => o.mensaje),
  };
}

/** Clave para cruzar un ticket con el mismo comprobante cuando aparezca en Mis Comprobantes. */
export function claveComprobante(
  c: Pick<Comprobante, "cuitContraparte" | "puntoVenta" | "numeroDesde">,
) {
  return `${c.cuitContraparte}-${c.puntoVenta}-${c.numeroDesde}`;
}
