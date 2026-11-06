import { z } from "zod";

// Lo que se le pide a Claude que lea de la foto de un ticket o factura. Lo comparten la ruta del
// servidor (API de Anthropic con salida estructurada) y el prototipo (capacidad `sample`).

const importe = z
  .number()
  .describe("Importe en pesos, con punto decimal. 0 si no figura.");

export const TicketExtraidoSchema = z.object({
  legible: z
    .boolean()
    .describe("false si la foto no es un comprobante o no se puede leer."),
  tipoCodigo: z
    .number()
    .int()
    .describe(
      "Código ARCA del comprobante: 1 Factura A, 6 Factura B, 11 Factura C, 81 Tique Factura A, 82 Tique Factura B, 83 Tique, 111 Tique Factura C, 3/8/13 notas de crédito. 0 si no se sabe.",
    ),
  tipoTexto: z
    .string()
    .describe('Cómo lo nombra el comprobante, por ejemplo "TIQUE FACTURA A".'),
  cuitEmisor: z.string().describe("CUIT del emisor, solo los 11 dígitos."),
  razonSocialEmisor: z.string(),
  cuitReceptor: z
    .string()
    .describe(
      "CUIT del comprador si figura, solo dígitos; vacío si es consumidor final.",
    ),
  puntoVenta: z.number().int(),
  numero: z.number().int(),
  fecha: z.string().describe("Fecha de emisión en formato AAAA-MM-DD."),
  netoGravado21: importe,
  netoGravado105: importe,
  netoGravado27: importe,
  iva21: importe,
  iva105: importe,
  iva27: importe,
  noGravado: importe.describe("Conceptos no gravados o exentos."),
  percepcionIva: importe,
  percepcionIibb: importe,
  otrosTributos: importe.describe(
    "Impuestos internos, impuestos a los combustibles y otros tributos que no son IVA ni percepciones.",
  ),
  total: importe,
  cae: z.string().describe("CAE o CAI si figura, solo dígitos; vacío si no."),
  dudas: z
    .array(z.string())
    .describe("Datos que no se leen con seguridad. Vacío si todo es claro."),
});

export type TicketExtraido = z.infer<typeof TicketExtraidoSchema>;

export const INSTRUCCIONES_TICKET = `Sos un asistente de un estudio contable argentino. La imagen es la foto de un comprobante de compra que subió un cliente: un tique o tique factura de controlador fiscal, o una factura electrónica.

Leé los datos tal como están impresos. No inventes ni calcules lo que no figura: si un importe no aparece, poné 0; si un texto no aparece, dejalo vacío. Si dudás de un dato, ponelo igual y agregá una línea a "dudas" diciendo cuál y por qué.

Reglas:
- Los CUIT van solo con dígitos (11).
- La fecha va como AAAA-MM-DD.
- Los importes van como número con punto decimal (1234.56), sin separador de miles.
- En los tiques factura A el IVA viene discriminado: separá neto e IVA por alícuota (21%, 10,5% y 27%).
- En los tiques B o C y en los tiques a consumidor final el IVA no se discrimina: poné el total y dejá netos e IVA en 0.
- Si la foto no es un comprobante o no se puede leer, poné legible en false.`;

/** Formato de respuesta en texto, para el prototipo (que no tiene salida estructurada). */
export const FORMATO_JSON_TICKET = `Respondé solo con un objeto JSON con estas claves: legible (boolean), tipoCodigo (entero), tipoTexto, cuitEmisor, razonSocialEmisor, cuitReceptor, puntoVenta (entero), numero (entero), fecha, netoGravado21, netoGravado105, netoGravado27, iva21, iva105, iva27, noGravado, percepcionIva, percepcionIibb, otrosTributos, total (números), cae, dudas (lista de textos).`;
