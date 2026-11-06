import {
  FORMATO_JSON_TICKET,
  INSTRUCCIONES_TICKET,
  type TicketExtraido,
  TicketExtraidoSchema,
} from "./esquema";

/** Lee una foto de comprobante y devuelve sus datos. */
export type LectorTicket = (imagen: Blob) => Promise<TicketExtraido>;

/** En la app: la foto va a la ruta del servidor, que llama a la API de Anthropic. */
export const leerConServidor: LectorTicket = async (imagen) => {
  const formulario = new FormData();
  formulario.append("imagen", imagen);
  const respuesta = await fetch("/api/tickets/leer", {
    method: "POST",
    body: formulario,
  });
  const cuerpo = await respuesta.json().catch(() => null);
  if (!respuesta.ok)
    throw new Error(cuerpo?.error ?? "No se pudo leer el comprobante.");
  return TicketExtraidoSchema.parse(cuerpo);
};

interface Muestra {
  json(input: string, opciones: { images: Blob[] }): Promise<unknown>;
  limits(): Promise<{ images?: unknown }>;
}

const ERRORES_MUESTRA: Record<string, string> = {
  not_granted: "No se dio permiso para usar Claude en esta página.",
  rate_limited: "Hay muchos pedidos en este momento: probá en un rato.",
  image_rejected:
    "La imagen no se puede usar: probá con otra foto (JPG o PNG).",
  invalid_json:
    "No se pudieron leer los datos: probá de nuevo o con otra foto.",
  refused: "No se pudo procesar esta imagen.",
};

/**
 * En el prototipo publicado como artifact: usa la capacidad `sample` de claude.ai, que corre con
 * la cuenta de quien mira la página. Devuelve null si la página no puede usarla.
 */
export async function lectorDelPrototipo(): Promise<LectorTicket | null> {
  const claude = (
    globalThis as { claude?: { use(nombre: string): Promise<unknown> } }
  ).claude;
  const muestra = (await claude?.use("sample")) as Muestra | null | undefined;
  if (!muestra) return null;
  const limites = await muestra.limits().catch(() => null);
  if (!limites?.images) return null;
  return async (imagen) => {
    try {
      const datos = await muestra.json(
        `${INSTRUCCIONES_TICKET}\n\n${FORMATO_JSON_TICKET}`,
        { images: [imagen] },
      );
      return TicketExtraidoSchema.parse(datos);
    } catch (e) {
      const codigo = (e as { code?: string })?.code;
      if (codigo)
        throw new Error(
          ERRORES_MUESTRA[codigo] ?? "No se pudo leer el comprobante.",
        );
      throw new Error(
        "Los datos leídos no tienen el formato esperado: probá de nuevo.",
      );
    }
  };
}
