// Lee las DDJJ presentadas (PDF) para cargarlas solas: IVA (F.2051/F.2002), Libro IVA Digital
// (F.2083), Ingresos Brutos Jujuy (F-232) y Ganancias sociedades (F.713).
import type { DatosIibb, JurisdiccionIibb } from "@/lib/impuestos/asientos";
import type { DdjjIva, LibroIvaDigital } from "@/lib/iva/liquidacion";

/** DDJJ anual de Ganancias de sociedades (F.713). */
export interface DdjjGanancias {
  /** Fecha de cierre del ejercicio (AAAA-MM-DD). */
  cierre: string;
  resultadoContable: number;
  resultadoImpositivo: number;
  alicuota: number;
  impuestoDeterminado: number;
  retencionesYPercepciones: number;
  saldoAFavorAnterior: number;
  credeb: number;
  /** Anticipos y demás pagos a cuenta (lo que falta para llegar al saldo). */
  anticipos: number;
  saldoAIngresar: number;
  saldoAFavor: number;
}

export type DdjjLeida =
  | {
      tipo: "iva";
      cuit: string;
      nombre: string;
      periodo: string;
      ddjj: DdjjIva;
    }
  | {
      tipo: "libro-iva";
      cuit: string;
      nombre: string;
      periodo: string;
      libro: LibroIvaDigital;
    }
  | {
      tipo: "iibb";
      cuit: string;
      nombre: string;
      periodo: string;
      jurisdiccion: string;
      datos: DatosIibb;
    }
  | { tipo: "ganancias-pj"; cuit: string; nombre: string; ddjj: DdjjGanancias };

const redondear = (n: number) => Math.round(n * 100) / 100;

/** "2.221.868,02", "-$ 18.686,59" o "10442717.37" → número. */
export function importe(texto: string): number {
  const t = texto.replace(/[$\s]/g, "");
  const negativo = t.startsWith("-");
  const limpio = t.replace(/^-/, "");
  const n = limpio.includes(",")
    ? Number(limpio.replace(/\./g, "").replace(",", "."))
    : Number(limpio);
  return Number.isFinite(n) ? (negativo ? -n : n) : 0;
}

const NUM = String.raw`-?\$?\s?-?[\d.]+(?:,\d{2})?`;

/** El primer importe que sigue a la etiqueta (en la misma línea). */
function valor(lineas: string[], etiqueta: RegExp, desde = 0): number {
  for (const l of lineas.slice(desde)) {
    const m = l.match(new RegExp(`${etiqueta.source}\\s*(${NUM})`, "i"));
    if (m) return redondear(importe(m[1]));
  }
  return 0;
}

const soloDigitos = (s: string) => s.replace(/\D/g, "");
const fechaIso = (d: string) => {
  const [dd, mm, aa] = d.split("/");
  return `${aa}-${mm}-${dd}`;
};

function ddjjIva(lineas: string[]): DdjjLeida | null {
  const todo = lineas.join("\n");
  if (!/IMPUESTO AL VALOR AGREGADO/.test(todo) || !/F\.\s?20(51|02)/.test(todo))
    return null;
  const i = lineas.findIndex((l) => /^CUIT\b/.test(l));
  const [cuit, ...nombre] = (lineas[i + 1] ?? "").split(" ");
  const per = todo.match(/Período[^\n]*\n(\d{4})(\d{2})/);
  const pres = todo.match(
    /Fecha de Presentación[^\n]*\n(\d{2}\/\d{2}\/\d{4})\s+(\d+)/,
  );
  if (!per) return null;
  const posicion = lineas.findIndex((l) =>
    /Determinación de la posición/.test(l),
  );
  // El saldo técnico a favor del contribuyente es el renglón sin "del período anterior".
  const stFavor = lineas.find(
    (l, j) =>
      j < (posicion < 0 ? lineas.length : posicion) &&
      /^Saldo técnico a favor del contribuyente \$/.test(l),
  );
  return {
    tipo: "iva",
    cuit: soloDigitos(cuit),
    nombre: nombre.join(" "),
    periodo: `${per[1]}-${per[2]}`,
    ddjj: {
      debitoFiscal: valor(lineas, /Total del débito fiscal del período/),
      creditoFiscal: valor(lineas, /Total del crédito fiscal del período/),
      saldoTecnicoAnterior: valor(
        lineas,
        /Saldo técnico a favor del contribuyente del período anterior/,
      ),
      saldoLibreDisponibilidadAnterior: valor(
        lineas,
        /Saldo a favor de libre disponibilidad del período anterior[^$\d]*/,
      ),
      retencionesYPercepciones: valor(
        lineas,
        /Total de retenciones, percepciones y pagos a cuenta[^$\d]*/,
      ),
      saldoTecnicoAFavor: stFavor
        ? redondear(importe(stFavor.split("$")[1]))
        : 0,
      saldoAPagar: valor(lineas, /Saldo de impuesto a favor de ARCA/),
      saldoLibreDisponibilidad: valor(
        lineas,
        /Saldo de libre disponibilidad a favor del contribuyente[^$\d]*/,
      ),
      fechaPresentacion: pres ? fechaIso(pres[1]) : undefined,
      transaccion: pres?.[2],
    },
  };
}

function libroIva(lineas: string[]): DdjjLeida | null {
  const todo = lineas.join("\n");
  if (!/LIBRO DE IVA DIGITAL/.test(todo)) return null;
  const cuit = todo.match(/CUIT:\s*([\d-]+)/);
  const nombre = todo.match(/Apellido y Nombre:\s*(.+)/);
  const per = todo.match(/Periodo:\s*(\d{4})(\d{2})/);
  const pres = todo.match(/Fecha de Presentación:\s*(\d{2}\/\d{2}\/\d{4})/);
  if (!cuit || !per) return null;
  const fila = (etiqueta: RegExp) => {
    const l = lineas.find((x) => etiqueta.test(x));
    const nums = (l?.match(/\$\s?-?[\d.,]+/g) ?? []).map(importe);
    return { neto: nums[0] ?? 0, impuesto: nums[2] ?? 0 };
  };
  const v = fila(/^Operaciones de Venta/);
  const ncv = fila(/^Notas de Crédito de Venta/);
  const c = fila(/^Operaciones de Compra/);
  const ncc = fila(/^Notas de Crédito de Compra/);
  return {
    tipo: "libro-iva",
    cuit: soloDigitos(cuit[1]),
    nombre: nombre?.[1].trim() ?? "",
    periodo: `${per[1]}-${per[2]}`,
    libro: {
      ventasNeto: redondear(v.neto - ncv.neto),
      debitoFiscal: redondear(v.impuesto - ncv.impuesto),
      comprasNeto: redondear(c.neto - ncc.neto),
      creditoFiscal: redondear(c.impuesto - ncc.impuesto),
      fechaPresentacion: pres ? fechaIso(pres[1]) : undefined,
    },
  };
}

function iibbJujuy(lineas: string[]): DdjjLeida | null {
  const todo = lineas.join("\n");
  if (!/PROVINCIA DE JUJUY/.test(todo) || !/F-232/.test(todo)) return null;
  const per = todo.match(/Periodo\s+(\d{4})\s*-\s*(\d{2})/);
  const cuit = todo.match(/CUIT\s+([\d-]+\/\d)/);
  if (!per || !cuit) return null;
  const i = lineas.findIndex((l) => /Apellido y Nombre o Razón Social/.test(l));
  const nombre =
    lineas
      .slice(i + 1, i + 5)
      .find((l) => !/^(Periodo|Vencimiento|Secuencia|Domicilio)/.test(l)) ?? "";
  const determinado = valor(lineas, /I\. Determinado/);
  const intereses = valor(lineas, /Intereses/);
  return {
    tipo: "iibb",
    cuit: soloDigitos(cuit[1]),
    nombre,
    periodo: `${per[1]}-${per[2]}`,
    jurisdiccion: "Jujuy",
    datos: {
      determinado: redondear(determinado + intereses),
      retenciones: valor(lineas, /^Retenciones/),
      percepciones: valor(lineas, /^Percepciones/),
      sircreb: valor(lineas, /^Recaudación Bancaria/),
      saldoAFavorAnterior: valor(lineas, /^Saldo Anterior/),
      otrosPagos: redondear(
        valor(lineas, /^Pago a Cuenta/) + valor(lineas, /^Crédito Fiscal/),
      ),
      presentada: true,
      origen: "DDJJ Rentas Jujuy (F-232)",
    },
  };
}

function convenioMultilateral(lineas: string[]): DdjjLeida | null {
  const todo = lineas.join("\n");
  if (!/Convenio Multilateral/.test(todo) || !/CM0?3/.test(todo)) return null;
  const cab = todo.match(/CUIT:\s*([\d-]+)\s+Contribuyente:\s*(.+?)\s+Sede:/);
  const per = todo.match(/Anticipo:\s*(\d{4})(\d{2})/);
  if (!cab || !per) return null;
  const pres = todo.match(/presentada el (\d{2}\/\d{2}\/\d{4})/);
  const M = String.raw`(-?\$\s?-?[\d.]+,\d{2})`;
  const fila = new RegExp(`^(9\\d{2}) (.+?) ${M} ${M} ${M} ${M} ${M} ${M}$`);
  const jurisdicciones: JurisdiccionIibb[] = [];
  for (const l of lineas) {
    const m = l.match(fila);
    if (!m || jurisdicciones.some((j) => j.codigo === m[1])) continue;
    const [det, restan, suman, aFavor, , aPagar] = m.slice(3).map(importe);
    jurisdicciones.push({
      codigo: m[1],
      nombre: m[2].trim(),
      determinado: det,
      restan,
      suman,
      aFavorContribuyente: aFavor,
      aPagar,
    });
  }
  if (!jurisdicciones.length) return null;
  const suma = (f: (j: JurisdiccionIibb) => number) =>
    redondear(jurisdicciones.reduce((t, j) => t + f(j), 0));
  return {
    tipo: "iibb",
    cuit: soloDigitos(cab[1]),
    nombre: cab[2],
    periodo: `${per[1]}-${per[2]}`,
    jurisdiccion: "Convenio Multilateral",
    datos: {
      determinado: suma((j) => j.determinado + j.suman),
      retenciones: 0,
      percepciones: 0,
      sircreb: 0,
      deduccionesDdjj: suma((j) => j.restan),
      aPagarDdjj: suma((j) => j.aPagar),
      saldoAFavorDdjj: suma((j) => j.aFavorContribuyente),
      jurisdicciones: jurisdicciones.filter(
        (j) =>
          j.determinado ||
          j.restan ||
          j.suman ||
          j.aPagar ||
          j.aFavorContribuyente,
      ),
      presentada: true,
      origen: "DDJJ Convenio Multilateral (CM03)",
      fechaPresentacion: pres ? fechaIso(pres[1]) : undefined,
    },
  };
}

function iibbSalta(lineas: string[]): DdjjLeida | null {
  const todo = lineas.join("\n");
  if (!/F903/.test(todo) || !/dgrsalta|D\.G\.R\./i.test(todo)) return null;
  const cab = todo.match(
    /C\.U\.I\.T\.[^\n]*\n([\d-]+)\s+(SI|NO)\s+(\d{1,2})\/(\d{4})/,
  );
  if (!cab) return null;
  const i = lineas.findIndex((l) => /APELLIDO Y NOMBRE O RAZÓN SOCIAL/.test(l));
  // El importe puede venir en la misma línea que la etiqueta o en la siguiente.
  const de = (etiqueta: RegExp) => {
    for (let j = 0; j < lineas.length; j++) {
      const m = lineas[j].match(etiqueta);
      if (!m) continue;
      const resto = lineas[j].slice((m.index ?? 0) + m[0].length);
      const aca = resto.match(/^\s*(-?[\d.,]+)/);
      if (aca) return redondear(importe(aca[1]));
      const sig = lineas[j + 1]?.match(/^\s*(-?[\d.,]+)\s*$/);
      return sig ? redondear(importe(sig[1])) : 0;
    }
    return 0;
  };
  const determinado = de(
    /TOTAL IMPUESTOS POR APLICACION ALICUOTA O MINIMO \(EL MAYOR\)/,
  );
  const depositar = de(/IMPORTE A DEPOSITAR/);
  const aFavorDgr = de(/^SALDO A FAVOR DGR/);
  return {
    tipo: "iibb",
    cuit: soloDigitos(cab[1]),
    nombre: lineas[i + 1] ?? "",
    periodo: `${cab[4]}-${cab[3].padStart(2, "0")}`,
    jurisdiccion: "Salta",
    datos: {
      // Intereses y accesorios: lo que se deposita por encima del saldo a favor de la DGR.
      determinado: redondear(determinado + Math.max(0, depositar - aFavorDgr)),
      retenciones: de(/MENOS RETENCIONES SEGUN ANEXO/),
      percepciones: de(/MENOS PERCEPCIONES SEGUN ANEXO/),
      sircreb: 0,
      saldoAFavorAnterior: de(/MENOS SALDO SEGUN DD\.JJ\. MES \d+ AÑO \d{4}/),
      aPagarDdjj: depositar,
      saldoAFavorDdjj: de(/A FAVOR CONTRIBUYENTE/),
      presentada: true,
      origen: "DDJJ DGR Salta (F903)",
    },
  };
}

function gananciasPj(lineas: string[]): DdjjLeida | null {
  const todo = lineas.join("\n");
  if (!/GANANCIAS/.test(todo) || !/F\.\s?713/.test(todo)) return null;
  const cab = todo.match(/Mes de Cierre[^\n]*\n(\d{1,2})\s+(\d{4})\s+([\d-]+)/);
  if (!cab) return null;
  const mes = Number(cab[1]);
  const anio = Number(cab[2]);
  const cierre = new Date(Date.UTC(anio, mes, 0)).toISOString().slice(0, 10);
  const nombre = todo.match(/F\.\s?713\s+(.+?)\s+\d{5,}\s+\d+\s*$/m);
  const determinado = valor(lineas, /Total Impuesto Determinado/);
  const saldoAIngresar = valor(lineas, /Saldo a Ingresar/);
  const ultimo = todo.match(
    /Saldo a favor (-?[\d.]+,\d{2}) (-?[\d.]+,\d{2})\s*$/m,
  );
  const saldoAFavor = ultimo ? importe(ultimo[1]) : 0;
  const retencionesYPercepciones = valor(
    lineas,
    /Retenciones y\/o Percepciones/,
  );
  const saldoAFavorAnterior = valor(lineas, /Saldo a favor periodo anterior/);
  const credeb = valor(lineas, /Cómputo Credeb para cancel\. DJ/);
  const deducciones = redondear(determinado - saldoAIngresar + saldoAFavor);
  return {
    tipo: "ganancias-pj",
    cuit: soloDigitos(cab[3]),
    nombre: nombre?.[1] ?? "",
    ddjj: {
      cierre,
      resultadoContable: valor(lineas, /Result\.del Ejerc\.\(contable\)/),
      resultadoImpositivo: valor(lineas, /^Resultado impositivo/),
      alicuota: valor(lineas, /^Alícuota %/),
      impuestoDeterminado: determinado,
      retencionesYPercepciones,
      saldoAFavorAnterior,
      credeb,
      anticipos: redondear(
        Math.max(
          0,
          deducciones - retencionesYPercepciones - saldoAFavorAnterior - credeb,
        ),
      ),
      saldoAIngresar,
      saldoAFavor,
    },
  };
}

/** Reconoce la DDJJ por su formulario y devuelve sus datos (null si no es una conocida). */
export function leerDdjj(lineas: string[]): DdjjLeida | null {
  return (
    ddjjIva(lineas) ??
    libroIva(lineas) ??
    iibbJujuy(lineas) ??
    convenioMultilateral(lineas) ??
    iibbSalta(lineas) ??
    gananciasPj(lineas)
  );
}
