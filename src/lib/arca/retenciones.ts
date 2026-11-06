import { normalizarEncabezado, parsearFecha, parsearImporte } from "./parse";
import type { Celda, ErrorFila } from "./tipos";

export type Impuesto = "IVA" | "Ganancias" | "IIBB" | "Otro";

/** Una retención o percepción sufrida por el cliente, que se descuenta en una declaración jurada. */
export interface Deduccion {
  origen: "Mis Retenciones" | "SIRCREB";
  impuesto: Impuesto;
  /** Para IIBB: provincia de la retención (SIFERE). */
  jurisdiccion: string | null;
  tipo: "percepcion" | "retencion";
  fecha: string; // AAAA-MM-DD
  periodo: string; // AAAA-MM
  cuitAgente: string;
  agente: string;
  regimen: string;
  certificado: string;
  comprobante: string;
  /** Las percepciones de notas de crédito vienen en negativo. */
  importe: number;
}

export interface ResultadoDeducciones {
  origen: Deduccion["origen"];
  deducciones: Deduccion[];
  errores: ErrorFila[];
}

// Códigos de impuesto de ARCA que aparecen en Mis Retenciones.
const IMPUESTOS: Record<string, Impuesto> = {
  "767": "IVA",
  "217": "Ganancias",
};

// Códigos de jurisdicción de SIFERE (Convenio Multilateral).
export const JURISDICCIONES: Record<string, string> = {
  "901": "CABA",
  "902": "Buenos Aires",
  "903": "Catamarca",
  "904": "Córdoba",
  "905": "Corrientes",
  "906": "Chaco",
  "907": "Chubut",
  "908": "Entre Ríos",
  "909": "Formosa",
  "910": "Jujuy",
  "911": "La Pampa",
  "912": "La Rioja",
  "913": "Mendoza",
  "914": "Misiones",
  "915": "Neuquén",
  "916": "Río Negro",
  "917": "Salta",
  "918": "San Juan",
  "919": "San Luis",
  "920": "Santa Cruz",
  "921": "Santa Fe",
  "922": "Santiago del Estero",
  "923": "Tierra del Fuego",
  "924": "Tucumán",
};

type Campo =
  | "cuit"
  | "agente"
  | "impuesto"
  | "regimen"
  | "fecha"
  | "certificado"
  | "operacion"
  | "importe"
  | "comprobante";

const ENCABEZADOS: [Campo, (h: string) => boolean][] = [
  ["cuit", (h) => h.startsWith("cuit agente")],
  ["agente", (h) => h.startsWith("denominacion")],
  ["impuesto", (h) => h === "impuesto"],
  ["regimen", (h) => h === "descripcion regimen"],
  ["fecha", (h) => h.startsWith("fecha ret")],
  ["certificado", (h) => h.startsWith("numero certificado")],
  ["operacion", (h) => h === "descripcion operacion"],
  ["importe", (h) => h.startsWith("importe ret")],
  ["comprobante", (h) => h === "numero comprobante"],
];

/** Lee el Excel que exporta "Mis Retenciones" de ARCA (retenciones y percepciones de IVA, Ganancias, etc.). */
export function importarMisRetenciones(filas: Celda[][]): ResultadoDeducciones {
  const indice = filas
    .slice(0, 20)
    .findIndex((f) =>
      f.some((c) =>
        normalizarEncabezado(String(c ?? "")).startsWith("cuit agente"),
      ),
    );
  if (indice === -1) {
    throw new Error(
      "No se encontraron los encabezados de Mis Retenciones (CUIT Agente Ret./Perc., Importe Ret./Perc.).",
    );
  }
  const columnas: Partial<Record<Campo, number>> = {};
  filas[indice].forEach((c, i) => {
    const h = normalizarEncabezado(String(c ?? ""));
    const campo = ENCABEZADOS.find(([, coincide]) => coincide(h))?.[0];
    if (campo && columnas[campo] === undefined) columnas[campo] = i;
  });
  for (const campo of ["cuit", "fecha", "importe", "impuesto"] as Campo[]) {
    if (columnas[campo] === undefined)
      throw new Error(
        `Falta la columna "${campo}" en el archivo de Mis Retenciones.`,
      );
  }
  const leer = (fila: Celda[], campo: Campo) =>
    columnas[campo] === undefined
      ? ""
      : String(fila[columnas[campo]!] ?? "").trim();

  const deducciones: Deduccion[] = [];
  const errores: ErrorFila[] = [];
  for (let i = indice + 1; i < filas.length; i++) {
    const fila = filas[i];
    if (!fila || fila.every((c) => c === null || String(c).trim() === ""))
      continue;
    try {
      const fecha = parsearFecha(fila[columnas.fecha!]);
      const codigo = leer(fila, "impuesto");
      deducciones.push({
        origen: "Mis Retenciones",
        impuesto: IMPUESTOS[codigo] ?? "Otro",
        jurisdiccion: null,
        tipo: normalizarEncabezado(leer(fila, "operacion")).startsWith("percep")
          ? "percepcion"
          : "retencion",
        fecha,
        periodo: fecha.slice(0, 7),
        cuitAgente: leer(fila, "cuit").replace(/\D/g, ""),
        agente: leer(fila, "agente"),
        regimen: leer(fila, "regimen"),
        certificado: leer(fila, "certificado"),
        comprobante: leer(fila, "comprobante"),
        importe: parsearImporte(fila[columnas.importe!]),
      });
    } catch (e) {
      errores.push({
        fila: i + 1,
        mensaje: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return { origen: "Mis Retenciones", deducciones, errores };
}

/**
 * Lee el archivo de retenciones bancarias de IIBB (SIRCREB) en el formato de importación de SIFERE:
 * jurisdicción (3), CUIT del agente (13), período AAAA/MM (7), CBU (22), tipo de cuenta (2),
 * moneda (1) e importe (11, con coma decimal).
 */
export function importarSircreb(texto: string): ResultadoDeducciones {
  const deducciones: Deduccion[] = [];
  const errores: ErrorFila[] = [];
  texto.split(/\r?\n/).forEach((linea, i) => {
    if (!linea.trim()) return;
    const m = linea.match(
      /^(\d{3})(\d{2}-?\d{8}-?\d)(\d{4})\/(\d{2})(\d{22})([A-Z]{2})([A-Z])\s*([\d.,-]+)\s*$/,
    );
    if (!m) {
      errores.push({
        fila: i + 1,
        mensaje: "La línea no tiene el formato de SIRCREB de SIFERE.",
      });
      return;
    }
    const [, jurisdiccion, cuit, anio, mes, cbu, tipoCuenta, , importe] = m;
    deducciones.push({
      origen: "SIRCREB",
      impuesto: "IIBB",
      jurisdiccion:
        JURISDICCIONES[jurisdiccion] ?? `Jurisdicción ${jurisdiccion}`,
      tipo: "retencion",
      fecha: `${anio}-${mes}-01`,
      periodo: `${anio}-${mes}`,
      cuitAgente: cuit.replace(/\D/g, ""),
      agente: `CBU ${cbu}`,
      regimen: `Retención bancaria (${tipoCuenta === "CC" ? "cuenta corriente" : tipoCuenta === "CA" ? "caja de ahorro" : tipoCuenta})`,
      certificado: "",
      comprobante: "",
      importe: parsearImporte(importe),
    });
  });
  return { origen: "SIRCREB", deducciones, errores };
}

export interface TotalDeduccion {
  impuesto: Impuesto;
  jurisdiccion: string | null;
  tipo: Deduccion["tipo"];
  cantidad: number;
  importe: number;
}

/** Totales del período por impuesto, jurisdicción y tipo. */
export function totalesDeducciones(
  deducciones: Deduccion[],
  periodo: string,
): TotalDeduccion[] {
  const grupos = new Map<string, TotalDeduccion>();
  for (const d of deducciones.filter((d) => d.periodo === periodo)) {
    const clave = `${d.impuesto}|${d.jurisdiccion ?? ""}|${d.tipo}`;
    const g = grupos.get(clave) ?? {
      impuesto: d.impuesto,
      jurisdiccion: d.jurisdiccion,
      tipo: d.tipo,
      cantidad: 0,
      importe: 0,
    };
    g.cantidad++;
    g.importe = Math.round((g.importe + d.importe) * 100) / 100;
    grupos.set(clave, g);
  }
  const orden: Impuesto[] = ["IVA", "IIBB", "Ganancias", "Otro"];
  return [...grupos.values()].sort(
    (a, b) =>
      orden.indexOf(a.impuesto) - orden.indexOf(b.impuesto) ||
      (a.jurisdiccion ?? "").localeCompare(b.jurisdiccion ?? "") ||
      a.tipo.localeCompare(b.tipo),
  );
}

/** Percepciones y retenciones de IVA del período, para la liquidación. */
export function deduccionesIva(deducciones: Deduccion[], periodo: string) {
  let percepciones = 0;
  let retenciones = 0;
  for (const d of deducciones) {
    if (d.impuesto !== "IVA" || d.periodo !== periodo) continue;
    if (d.tipo === "percepcion") percepciones += d.importe;
    else retenciones += d.importe;
  }
  return {
    percepciones: Math.round(percepciones * 100) / 100,
    retenciones: Math.round(retenciones * 100) / 100,
  };
}
