import calendario2026 from "./calendario-2026.json";

/**
 * Calendario de vencimientos de impuestos nacionales (Comisión Federal de Impuestos), por mes y por
 * terminación de CUIT. Cada columna tiene 1, 3 (0-3, 4-6, 7-9) o 5 (0-1, 2-3, 4-5, 6-7, 8-9) días.
 */
type Calendario = Record<string, (number | null)[][]>;
const CALENDARIOS: Record<number, Calendario> = { 2026: calendario2026 };

export const IMPUESTOS = {
  iva: "IVA",
  gananciasPJ: "Ganancias (sociedades)",
  gananciasPH: "Ganancias (personas humanas)",
  sicore: "Retenciones y percepciones (SICORE)",
  bienesPersonales: "Bienes personales (anticipos)",
  monotributo: "Monotributo",
  misFacilidades: "Planes de pago (Mis Facilidades)",
} as const;
export type Impuesto = keyof typeof IMPUESTOS;

export interface EmpresaVencimientos {
  id: string;
  razon_social: string;
  cuit: string;
  condicion_iva: string;
  mes_cierre?: number;
  impuestos?: string[] | null;
}

export interface Vencimiento {
  fecha: string;
  empresaId: string;
  empresa: string;
  impuesto: Impuesto;
  detalle: string;
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

export function esPersonaJuridica(cuit: string) {
  return /^3[034]/.test(cuit);
}

/** Lo que corresponde por la condición frente al IVA, si el estudio no eligió otra cosa. */
export function impuestosDe(e: EmpresaVencimientos): Impuesto[] {
  if (e.impuestos)
    return e.impuestos.filter((i): i is Impuesto => i in IMPUESTOS);
  const ganancias = esPersonaJuridica(e.cuit) ? "gananciasPJ" : "gananciasPH";
  if (/monotributo/i.test(e.condicion_iva)) return ["monotributo"];
  if (/exento/i.test(e.condicion_iva)) return [ganancias];
  return ["iva", ganancias];
}

function dia(columna: (number | null)[], cuit: string) {
  const ultimo = Number(cuit.at(-1) ?? 0);
  const i =
    columna.length === 5
      ? Math.floor(ultimo / 2)
      : columna.length === 3
        ? ultimo <= 3
          ? 0
          : ultimo <= 6
            ? 1
            : 2
        : 0;
  return columna[i] ?? null;
}

function fecha(anio: number, mes: number, d: number) {
  return `${anio}-${String(mes + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Mes anterior a `mes` (0-11), con su nombre. */
function periodoAnterior(anio: number, mes: number) {
  return mes === 0 ? `diciembre ${anio - 1}` : `${MESES[mes - 1]} ${anio}`;
}

/** Vencimientos de un mes para una empresa. */
function delMes(
  e: EmpresaVencimientos,
  anio: number,
  mes: number,
  cal: Calendario,
): Vencimiento[] {
  const lista: Vencimiento[] = [];
  const agregar = (columna: string, impuesto: Impuesto, detalle: string) => {
    const d = dia(cal[columna]?.[mes] ?? [], e.cuit);
    if (d)
      lista.push({
        fecha: fecha(anio, mes, d),
        empresaId: e.id,
        empresa: e.razon_social,
        impuesto,
        detalle,
      });
  };
  const cierre = (e.mes_cierre ?? 12) - 1; // 0-11
  // La DDJJ de sociedades vence el 5.º mes después del cierre; los 10 anticipos, del 6.º al 15.º.
  const mesesDesdeCierre = (mes - cierre + 12) % 12;
  for (const imp of impuestosDe(e)) {
    if (imp === "iva")
      agregar("iva", imp, `DDJJ y pago de ${periodoAnterior(anio, mes)}`);
    if (imp === "gananciasPJ") {
      if (mesesDesdeCierre === 5)
        agregar(
          "gananciasDdjjPJ",
          imp,
          `DDJJ del ejercicio cerrado en ${MESES[cierre]}`,
        );
      if (mesesDesdeCierre !== 4 && mesesDesdeCierre !== 5)
        agregar("gananciasAnticipoPJ", imp, "Anticipo");
    }
    if (imp === "gananciasPH") {
      agregar("gananciasAnticipoPH", imp, "Anticipo");
      agregar(
        "gananciasDdjjPH",
        imp,
        "DDJJ anual (Ganancias y Bienes Personales)",
      );
    }
    if (imp === "sicore") {
      agregar("sicorePrimera", imp, "Pago a cuenta de la 1.ª quincena");
      agregar("sicoreDdjj", imp, `DDJJ de ${periodoAnterior(anio, mes)}`);
    }
    if (imp === "bienesPersonales")
      agregar("bienesPersonalesAnticipo", imp, "Anticipo");
    if (imp === "monotributo")
      agregar("monotributo", imp, `Cuota de ${MESES[mes]}`);
    if (imp === "misFacilidades")
      agregar("misFacilidades", imp, "Cuota del plan de pagos");
  }
  return lista;
}

/** Vencimientos de todas las empresas entre dos fechas (inclusive), ordenados por fecha. */
export function vencimientos(
  empresas: EmpresaVencimientos[],
  desde: string,
  hasta: string,
): { lista: Vencimiento[]; faltanAnios: number[] } {
  const lista: Vencimiento[] = [];
  const faltan = new Set<number>();
  let [anio, mes] = desde.split("-").map(Number);
  mes -= 1;
  const [anioFin, mesFin] = hasta.split("-").map(Number);
  while (anio * 12 + mes <= anioFin * 12 + mesFin - 1) {
    const cal = CALENDARIOS[anio];
    if (!cal) faltan.add(anio);
    else for (const e of empresas) lista.push(...delMes(e, anio, mes, cal));
    mes++;
    if (mes === 12) {
      mes = 0;
      anio++;
    }
  }
  return {
    lista: lista
      .filter((v) => v.fecha >= desde && v.fecha <= hasta)
      .sort(
        (a, b) =>
          a.fecha.localeCompare(b.fecha) || a.empresa.localeCompare(b.empresa),
      ),
    faltanAnios: [...faltan],
  };
}
