// Código QR de los comprobantes electrónicos (RG 4892): una URL de ARCA con los datos del
// comprobante en JSON, en base64, en el parámetro `p`.

export interface DatosQr {
  fecha: string; // AAAA-MM-DD
  cuitEmisor: string;
  puntoVenta: number;
  tipoCodigo: number;
  numero: number;
  total: number;
  moneda: string;
  cotizacion: number;
  cuitReceptor: string;
  codigoAutorizacion: string;
}

function base64Utf8(texto: string): string {
  const normal = texto.replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
  const relleno = normal + "=".repeat((4 - (normal.length % 4)) % 4);
  const bytes = Uint8Array.from(atob(relleno), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Devuelve los datos del QR de ARCA, o null si el texto no es uno. */
export function interpretarQrArca(texto: string): DatosQr | null {
  let url: URL;
  try {
    url = new URL(texto.trim());
  } catch {
    return null;
  }
  if (!/(^|\.)(afip|arca)\.gob\.ar$/i.test(url.hostname)) return null;
  const p = url.searchParams.get("p");
  if (!p) return null;
  let datos: Record<string, unknown>;
  try {
    datos = JSON.parse(base64Utf8(p));
  } catch {
    return null;
  }
  const cuit = String(datos.cuit ?? "").replace(/\D/g, "");
  if (cuit.length !== 11) return null;
  return {
    fecha: String(datos.fecha ?? ""),
    cuitEmisor: cuit,
    puntoVenta: Number(datos.ptoVta) || 0,
    tipoCodigo: Number(datos.tipoCmp) || 0,
    numero: Number(datos.nroCmp) || 0,
    total: Number(datos.importe) || 0,
    moneda: String(datos.moneda ?? "PES"),
    cotizacion: Number(datos.ctz) || 1,
    cuitReceptor: datos.nroDocRec
      ? String(datos.nroDocRec).replace(/\D/g, "")
      : "",
    codigoAutorizacion: String(datos.codAut ?? ""),
  };
}

/** Busca un QR en la imagen. Corre en el navegador. */
export async function leerQrDeImagen(imagen: Blob): Promise<DatosQr | null> {
  const { default: jsQR } = await import("jsqr");
  const bitmap = await createImageBitmap(imagen);
  // Las fotos de celular son grandes: se achican para que la búsqueda sea rápida.
  const escala = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const pixeles = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const codigo = jsQR(pixeles.data, pixeles.width, pixeles.height);
  return codigo ? interpretarQrArca(codigo.data) : null;
}
