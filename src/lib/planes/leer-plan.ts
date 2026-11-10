/** Una cuota tal como viene en el PDF del plan (fechas AAAA-MM-DD). */
export interface CuotaDetalle {
  numero: number;
  fecha: string;
  importe: number;
  /** Segundo vencimiento (ARCA: con interés resarcitorio). */
  fecha2?: string;
  importe2?: number;
}

export interface PlanLeido {
  organismo: string;
  numero: string;
  cuit: string;
  descripcion: string;
  cuotas: CuotaDetalle[];
}

/** "8.739,06" · "41787,8" · "268982,86" → número. */
function importe(t: string) {
  return Number(
    t.replace(/\$/g, "").replace(/\./g, "").replace(",", ".").trim(),
  );
}

function fecha(t: string) {
  const [d, m, a] = t.split("/");
  return `${a.length === 2 ? `20${a}` : a}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

const NUM = String.raw`[\d.]+(?:,\d+)?`;
const FECHA = String.raw`\d{2}/\d{2}/\d{4}`;

/** Plan de Mis Facilidades (ARCA): cuotas con 1° y 2° vencimiento. */
function misFacilidades(lineas: string[]): PlanLeido | null {
  const todo = lineas.join("\n");
  const numero = todo.match(/N[úu]mero de Plan:\s*(\S+)/i)?.[1];
  if (!numero || !/Cuota N/i.test(todo)) return null;
  const cuotas: CuotaDetalle[] = [];
  const primera = new RegExp(
    String.raw`^\s*(\d{1,3})\s+(${NUM})\s+(${NUM})\s+(-|${NUM})\s+(${NUM})\s+(${FECHA})\s*$`,
  );
  const segunda = new RegExp(
    String.raw`^\s*(${NUM})\s+(${NUM})\s+(${NUM})\s+(${FECHA})\s*$`,
  );
  for (const l of lineas) {
    const a = l.match(primera);
    if (a) {
      cuotas.push({
        numero: Number(a[1]),
        importe: importe(a[5]),
        fecha: fecha(a[6]),
      });
      continue;
    }
    const b = l.match(segunda);
    const ultima = cuotas.at(-1);
    if (b && ultima && ultima.fecha2 === undefined) {
      ultima.importe2 = importe(b[3]);
      ultima.fecha2 = fecha(b[4]);
    }
  }
  if (!cuotas.length) return null;
  const consolidacion = todo.match(
    /Consolidaci[óo]n:\s*(\d{2}\/\d{2}\/\d{4})/i,
  )?.[1];
  return {
    organismo: "ARCA",
    numero,
    cuit: todo.match(/CUIT:\s*(\d{11})/)?.[1] ?? "",
    descripcion: consolidacion ? `Consolidado el ${consolidacion}` : "",
    cuotas,
  };
}

/** Plan de facilidades de Rentas Jujuy (formularios F-221 a F-223). */
function rentasJujuy(lineas: string[]): PlanLeido | null {
  const todo = lineas.join("\n");
  const plan = todo.match(
    /FAC\s*-\s*\d+\s*-\s*WEB\s*-\s*\d{4}\s*-\s*\d+/i,
  )?.[0];
  if (!plan) return null;
  const cuotas: CuotaDetalle[] = [];
  const fila = new RegExp(
    String.raw`^\s*(\d{1,3})\s+(${FECHA})\s+\$?\s*(${NUM})\s*$`,
  );
  for (const l of lineas) {
    const m = l.match(fila);
    if (m)
      cuotas.push({
        numero: Number(m[1]),
        fecha: fecha(m[2]),
        importe: importe(m[3]),
      });
  }
  if (!cuotas.length) return null;
  const concepto = todo.match(/Concepto\s+([^\n]+)/i)?.[1].trim() ?? "";
  const periodos = [
    ...todo.matchAll(/\b((?:19|20)\d{2}\/(?:0[1-9]|1[0-2]))\b/g),
  ]
    .map((m) => m[1])
    .sort();
  const desc = [
    concepto,
    periodos.length ? `${periodos[0]} a ${periodos.at(-1)}` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return {
    organismo: "Rentas Jujuy",
    numero: plan.replace(/\s+/g, ""),
    cuit: todo.match(/CUIT\s*\/\s*CUIL\s*(\d{11})/i)?.[1] ?? "",
    descripcion: desc,
    cuotas,
  };
}

/** Reconoce el formato y lee el plan; null si no es un plan conocido. */
export function leerPlanDePago(lineas: string[]): PlanLeido | null {
  return misFacilidades(lineas) ?? rentasJujuy(lineas);
}
