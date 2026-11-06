import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import {
  INSTRUCCIONES_TICKET,
  TicketExtraidoSchema,
} from "@/lib/tickets/esquema";

// Lee la foto de un ticket con Claude y devuelve los datos estructurados.
// Necesita ANTHROPIC_API_KEY en las variables de entorno del servidor.

const TIPOS_IMAGEN = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;
type TipoImagen = (typeof TIPOS_IMAGEN)[number];
const MAXIMO_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    return Response.json(
      { error: "El servidor no tiene configurada la clave de la API." },
      { status: 500 },
    );
  }
  const formulario = await request.formData();
  const imagen = formulario.get("imagen");
  if (!(imagen instanceof Blob)) {
    return Response.json(
      { error: "Falta la imagen del comprobante." },
      { status: 400 },
    );
  }
  if (!TIPOS_IMAGEN.includes(imagen.type as TipoImagen)) {
    return Response.json(
      { error: "La imagen tiene que ser JPG, PNG o WebP." },
      { status: 400 },
    );
  }
  if (imagen.size > MAXIMO_BYTES) {
    return Response.json(
      { error: "La imagen pesa más de 5 MB." },
      { status: 400 },
    );
  }

  const datos = Buffer.from(await imagen.arrayBuffer()).toString("base64");

  try {
    const client = new Anthropic();
    const respuesta = await client.beta.messages.parse({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      output_config: {
        effort: "medium",
        format: betaZodOutputFormat(TicketExtraidoSchema),
      },
      // Si un clasificador de seguridad rechaza el pedido, la API lo reintenta con otro modelo.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: imagen.type as TipoImagen,
                data: datos,
              },
            },
            { type: "text", text: INSTRUCCIONES_TICKET },
          ],
        },
      ],
    });

    if (respuesta.stop_reason === "refusal") {
      return Response.json(
        { error: "No se pudo procesar esta imagen." },
        { status: 422 },
      );
    }
    if (!respuesta.parsed_output) {
      return Response.json(
        { error: "No se pudieron leer los datos del comprobante." },
        { status: 502 },
      );
    }
    return Response.json(respuesta.parsed_output);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return Response.json(
        { error: "Hay muchos pedidos en este momento: probá en un minuto." },
        { status: 429 },
      );
    }
    if (error instanceof Anthropic.AuthenticationError) {
      return Response.json(
        { error: "El servidor no tiene configurada la clave de la API." },
        { status: 500 },
      );
    }
    if (error instanceof Anthropic.APIError) {
      return Response.json(
        { error: `Error al leer el comprobante (${error.status}).` },
        { status: 502 },
      );
    }
    if (error instanceof Anthropic.AnthropicError) {
      // Por ejemplo, falta ANTHROPIC_API_KEY en el servidor.
      return Response.json(
        { error: "El servidor no tiene configurada la clave de la API." },
        { status: 500 },
      );
    }
    throw error;
  }
}
