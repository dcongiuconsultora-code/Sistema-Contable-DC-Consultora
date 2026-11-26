// Recordatorios personalizados para cada cliente (cuotas de planes vencidas o por vencer,
// monotributo y demás vencimientos), con el texto listo para WhatsApp o mail.
import {
  cuotasDelPlan,
  type EmpresaVencimientos,
  IMPUESTOS,
  type PlanPago,
  vencimientos,
} from "@/lib/vencimientos/vencimientos";
import { pesos } from "@/lib/formato";

export interface PendienteCliente {
  nivel: "urgente" | "aviso";
  /** Para ordenar y para no repetir. */
  fecha: string;
  texto: string;
}

const dm = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}`;

function sumarDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const nombrePlan = (p: PlanPago) =>
  `${p.organismo === "ARCA" ? "plan de ARCA" : `plan de ${p.organismo}`}${p.numero ? ` ${p.numero}` : ""}`;

/** Lo que hay que recordarle a un cliente: deudas de planes primero, después lo que vence. */
export function pendientesDeCliente(
  empresa: EmpresaVencimientos,
  planes: PlanPago[],
  hoy: string,
  dias = 7,
): PendienteCliente[] {
  const r: PendienteCliente[] = [];
  const hasta = sumarDias(hoy, dias);
  for (const p of planes.filter((x) => x.estado === "vigente")) {
    const impagas = cuotasDelPlan(p).filter((c) => !c.pagada);
    const vencidas = impagas.filter((c) => c.fecha < hoy);
    if (vencidas.length >= 2)
      r.push({
        nivel: "urgente",
        fecha: vencidas[0].fecha,
        texto: `Debés ${vencidas.length} cuotas del ${nombrePlan(p)} (cuotas ${vencidas.map((c) => c.numero).join(", ")}, $ ${pesos(vencidas.reduce((t, c) => t + c.importe, 0))} en total). Está a punto de caducar: pagalas cuanto antes.`,
      });
    else if (vencidas.length === 1)
      r.push({
        nivel: "urgente",
        fecha: vencidas[0].fecha,
        texto: `No pagaste la cuota ${vencidas[0].numero} del ${nombrePlan(p)} ($ ${pesos(vencidas[0].importe)}), que venció el ${dm(vencidas[0].fecha)}. Si se junta otra cuota impaga, el plan puede caducar.`,
      });
    const proxima = impagas.find((c) => c.fecha >= hoy && c.fecha <= hasta);
    if (proxima)
      r.push({
        nivel: "aviso",
        fecha: proxima.fecha,
        texto: `${proxima.fecha === hoy ? "Hoy vence" : `El ${dm(proxima.fecha)} vence`} la cuota ${proxima.numero} del ${nombrePlan(p)} ($ ${pesos(proxima.importe)}).`,
      });
  }
  const conPlanes = { [empresa.id]: planes };
  for (const v of vencimientos([empresa], hoy, hasta, conPlanes).lista) {
    if (v.impuesto === "misFacilidades") continue; // las cuotas ya van arriba, con su detalle
    r.push({
      nivel: "aviso",
      fecha: v.fecha,
      texto:
        v.impuesto === "monotributo"
          ? `${v.fecha === hoy ? "Hoy vence" : `El ${dm(v.fecha)} vence`} la cuota del monotributo (${v.detalle.replace(/^Cuota de /i, "")}).`
          : `${v.fecha === hoy ? "Hoy vence" : `El ${dm(v.fecha)} vence`} ${IMPUESTOS[v.impuesto]}: ${v.detalle}.`,
    });
  }
  return r.sort(
    (a, b) =>
      (a.nivel === b.nivel ? 0 : a.nivel === "urgente" ? -1 : 1) ||
      a.fecha.localeCompare(b.fecha),
  );
}

/** Asunto y texto del recordatorio, cortito para leer en el celular. */
export function mensajeParaCliente(
  nombre: string,
  pendientes: PendienteCliente[],
): { asunto: string; texto: string } {
  const urgente = pendientes.some((p) => p.nivel === "urgente");
  return {
    asunto: urgente
      ? `Importante: tenés cuotas impagas · ${nombre}`
      : `Recordatorio de vencimientos · ${nombre}`,
    texto: `Hola, ¿cómo estás? Te escribimos de DC Consultora para recordarte:

${pendientes.map((p) => `${p.nivel === "urgente" ? "⚠️" : "•"} ${p.texto}`).join("\n")}

Si ya lo pagaste, avisanos así lo marcamos. Cualquier duda, escribinos.

DC Consultora`,
  };
}

/**
 * Número para WhatsApp en formato internacional argentino (549 + área + número, sin 0 ni 15).
 * null si no parece un celular válido.
 */
export function numeroWhatsapp(
  telefono: string | null | undefined,
): string | null {
  if (!telefono) return null;
  let d = telefono.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("54")) {
    d = d.slice(2);
    if (d.startsWith("9")) d = d.slice(1);
  }
  if (d.startsWith("0")) d = d.slice(1);
  // Quita el 15 que va después del código de área (2 a 4 dígitos) en los celulares viejos.
  if (d.length === 12)
    for (const area of [2, 3, 4])
      if (d.slice(area, area + 2) === "15") {
        d = d.slice(0, area) + d.slice(area + 2);
        break;
      }
  return d.length === 10 ? `549${d}` : null;
}

export function linkWhatsapp(
  telefono: string | null | undefined,
  texto: string,
) {
  const n = numeroWhatsapp(telefono);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(texto)}` : null;
}
