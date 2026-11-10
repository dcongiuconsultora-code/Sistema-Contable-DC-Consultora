import type { CuotaDetalle } from "@/lib/planes/leer-plan";
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
  /** Planes de pago por empresa: sus cuotas reemplazan al aviso genérico de Mis Facilidades. */
  planes: Record<string, PlanPago[]> = {},
): { lista: Vencimiento[]; faltanAnios: number[] } {
  const lista: Vencimiento[] = [];
  const faltan = new Set<number>();
  let [anio, mes] = desde.split("-").map(Number);
  mes -= 1;
  const [anioFin, mesFin] = hasta.split("-").map(Number);
  while (anio * 12 + mes <= anioFin * 12 + mesFin - 1) {
    const cal = CALENDARIOS[anio];
    if (!cal) faltan.add(anio);
    else
      for (const e of empresas)
        lista.push(
          ...delMes(e, anio, mes, cal).filter(
            (v) => !(v.impuesto === "misFacilidades" && planes[e.id]?.length),
          ),
        );
    mes++;
    if (mes === 12) {
      mes = 0;
      anio++;
    }
  }
  for (const e of empresas)
    for (const plan of planes[e.id] ?? [])
      for (const c of cuotasDelPlan(plan))
        if (!c.pagada && plan.estado === "vigente")
          lista.push({
            fecha: c.fecha,
            empresaId: e.id,
            empresa: e.razon_social,
            impuesto: "misFacilidades",
            detalle: detallePlan(plan, c),
          });
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

// Planes de pago ------------------------------------------------------------------------------

export interface PlanPago {
  id?: string;
  organismo: string;
  numero: string;
  descripcion: string;
  cuotas: number;
  /** Mes de la primera cuota (AAAA-MM). */
  primeraCuota: string;
  importeCuota: number;
  /** null = el día de Mis Facilidades del calendario de ARCA (o el 16 si no hay calendario). */
  diaVencimiento: number | null;
  cuotasPagadas: number[];
  estado: "vigente" | "cancelado" | "caducado";
  /** Cuotas exactas leídas del PDF del plan (fecha e importe de cada una). */
  detalleCuotas?: CuotaDetalle[] | null;
}

export interface CuotaPlan {
  numero: number;
  mes: string;
  fecha: string;
  importe: number;
  pagada: boolean;
  /** Segundo vencimiento, si el plan lo tiene. */
  fecha2?: string;
  importe2?: number;
}

function sumarMesesPlan(mes: string, n: number) {
  const [a, m] = mes.split("-").map(Number);
  const t = a * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Cuotas del plan con su fecha de vencimiento. */
export function cuotasDelPlan(plan: PlanPago): CuotaPlan[] {
  if (plan.detalleCuotas?.length)
    return plan.detalleCuotas.map((c) => ({
      numero: c.numero,
      mes: c.fecha.slice(0, 7),
      fecha: c.fecha,
      importe: c.importe,
      fecha2: c.fecha2,
      importe2: c.importe2,
      pagada: plan.cuotasPagadas.includes(c.numero),
    }));
  return Array.from({ length: plan.cuotas }, (_, i) => {
    const mes = sumarMesesPlan(plan.primeraCuota, i);
    const [anio, m] = mes.split("-").map(Number);
    const delCalendario =
      CALENDARIOS[anio]?.misFacilidades?.[m - 1]?.[0] ?? null;
    const ultimoDia = new Date(Date.UTC(anio, m, 0)).getUTCDate();
    const d = Math.min(plan.diaVencimiento ?? delCalendario ?? 16, ultimoDia);
    return {
      numero: i + 1,
      mes,
      fecha: fecha(anio, m - 1, d),
      importe: plan.importeCuota,
      pagada: plan.cuotasPagadas.includes(i + 1),
    };
  });
}

export function detallePlan(plan: PlanPago, c: CuotaPlan) {
  const nombre = [plan.organismo, plan.numero && `plan ${plan.numero}`]
    .filter(Boolean)
    .join(" ");
  const importe = c.importe || plan.importeCuota;
  return `${nombre}: cuota ${c.numero} de ${plan.cuotas}${importe ? ` ($ ${importe.toLocaleString("es-AR", { minimumFractionDigits: 2 })})` : ""}`;
}

/** Cuotas vencidas sin pagar (para la alerta en rojo). */
export function cuotasVencidas(planes: PlanPago[], hoy: string) {
  return planes
    .filter((p) => p.estado === "vigente")
    .flatMap((p) =>
      cuotasDelPlan(p)
        .filter((c) => !c.pagada && c.fecha < hoy)
        .map((c) => ({ plan: p, cuota: c })),
    );
}
