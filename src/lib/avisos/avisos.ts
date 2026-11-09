import { IMPUESTOS, type Vencimiento } from "@/lib/vencimientos/vencimientos";

export interface Plantilla {
  id?: string;
  nombre: string;
  asunto: string;
  cuerpo: string;
}

/** Modelos que trae el sistema; el estudio los puede copiar y adaptar. */
export const PLANTILLAS_BASE: Plantilla[] = [
  {
    nombre: "Vencimientos del mes",
    asunto: "Vencimientos de {mes} · {empresa}",
    cuerpo: `Hola, ¿cómo están?

Les recordamos los vencimientos de {empresa} para los próximos días:

{vencimientos}

Para poder presentar en término necesitamos que la documentación esté cargada en el sistema antes del {fecha_limite}.

Cualquier duda, nos escriben por acá.

Saludos,
{estudio}`,
  },
  {
    nombre: "Pedido de documentación mensual",
    asunto: "Documentación de {mes_anterior} · {empresa}",
    cuerpo: `Hola, ¿cómo están?

Para cerrar {mes_anterior} de {empresa} necesitamos que carguen en el sistema, a más tardar el {fecha_limite}:

• Fotos de los tickets y facturas de compra que no figuren en ARCA.
• Los resúmenes bancarios del mes (en PDF).
• Los cobros y pagos del mes, con sus retenciones.
• El inventario de fin de mes, si corresponde.

Si algo no llega en esa fecha, la liquidación se hace con lo que haya cargado.

Saludos,
{estudio}`,
  },
  {
    nombre: "Recordatorio libre",
    asunto: "Recordatorio · {empresa}",
    cuerpo: `Hola, ¿cómo están?



Saludos,
{estudio}`,
  },
];

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

function fechaLarga(iso: string) {
  const [a, m, d] = iso.split("-").map(Number);
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

export interface DatosAviso {
  empresa: string;
  /** Mes de referencia (AAAA-MM). */
  mes: string;
  fechaLimite: string;
  vencimientos: Vencimiento[];
  estudio: string;
}

/** Reemplaza los campos {empresa}, {mes}, {vencimientos}… del modelo. */
export function completarPlantilla(texto: string, d: DatosAviso) {
  const [a, m] = d.mes.split("-").map(Number);
  const anterior =
    m === 1 ? `diciembre de ${a - 1}` : `${MESES[m - 2]} de ${a}`;
  const lista = d.vencimientos.length
    ? d.vencimientos
        .map(
          (v) =>
            `• ${fechaLarga(v.fecha)}: ${IMPUESTOS[v.impuesto]} — ${v.detalle}`,
        )
        .join("\n")
    : "• No tenemos vencimientos cargados para estos días.";
  return texto
    .replaceAll("{empresa}", d.empresa)
    .replaceAll("{mes}", `${MESES[m - 1]} de ${a}`)
    .replaceAll("{mes_anterior}", anterior)
    .replaceAll(
      "{fecha_limite}",
      d.fechaLimite ? fechaLarga(d.fechaLimite) : "—",
    )
    .replaceAll("{vencimientos}", lista)
    .replaceAll("{estudio}", d.estudio);
}

/** Link para abrir el mail ya escrito en Gmail (desde la cuenta del estudio). */
export function linkGmail(para: string[], asunto: string, cuerpo: string) {
  const p = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: para.join(","),
    su: asunto,
    body: cuerpo,
  });
  return `https://mail.google.com/mail/?${p.toString()}`;
}
