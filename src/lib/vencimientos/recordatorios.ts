import {
  cuotasVencidas,
  detallePlan,
  type EmpresaVencimientos,
  IMPUESTOS,
  type PlanPago,
  vencimientos,
} from "./vencimientos";

export interface Recordatorio {
  clave: string;
  linea: string;
}

function fechaLarga(iso: string) {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function sumarDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Qué hay que recordarle a cada empresa: lo que vence entre hoy y `dias` días, y las cuotas de
 * planes que ya vencieron sin pagar. Cada uno tiene una clave para mandarlo una sola vez.
 */
export function recordatoriosDelDia(
  empresas: EmpresaVencimientos[],
  planes: Record<string, PlanPago[]>,
  hoy: string,
  dias = 3,
): Map<string, Recordatorio[]> {
  const r = new Map<string, Recordatorio[]>();
  const agregar = (empresaId: string, x: Recordatorio) =>
    r.set(empresaId, [...(r.get(empresaId) ?? []), x]);
  for (const v of vencimientos(empresas, hoy, sumarDias(hoy, dias), planes)
    .lista)
    agregar(v.empresaId, {
      clave: `vence|${v.fecha}|${v.impuesto}|${v.detalle}`,
      linea: `• ${fechaLarga(v.fecha)}: ${IMPUESTOS[v.impuesto]} — ${v.detalle}`,
    });
  for (const e of empresas)
    for (const { plan, cuota } of cuotasVencidas(planes[e.id] ?? [], hoy))
      agregar(e.id, {
        clave: `vencida|${plan.id ?? plan.numero}|${cuota.numero}`,
        linea: `• VENCIDA el ${fechaLarga(cuota.fecha)}: ${detallePlan(plan, cuota)}. Si no la pagaste, el plan puede caducar.`,
      });
  return r;
}

export function textoRecordatorio(empresa: string, lineas: string[]) {
  return `Hola, te recordamos los vencimientos de ${empresa}:

${lineas.join("\n")}

Si ya lo pagaste o presentaste, no hace falta que hagas nada. Cualquier duda, escribinos por acá.

DC Consultora`;
}
