import { type DocumentoPdf, extraerLineas, type LineaPdf } from "./lineas";

/** Abre un PDF en el navegador con pdf.js y devuelve sus líneas de texto. */
export async function leerPdf(archivo: File): Promise<LineaPdf[]> {
  const pdfjs = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    // El prototipo de un solo archivo trae el worker embebido; la app lo sirve como archivo aparte.
    const embebido = (globalThis as { __PDF_WORKER_SRC__?: string })
      .__PDF_WORKER_SRC__;
    pdfjs.GlobalWorkerOptions.workerSrc =
      embebido ??
      new URL(
        "pdfjs-dist/build/pdf.worker.min.mjs",
        import.meta.url,
      ).toString();
  }
  const doc = await pdfjs.getDocument({
    data: new Uint8Array(await archivo.arrayBuffer()),
  }).promise;
  try {
    return await extraerLineas(doc as unknown as DocumentoPdf);
  } finally {
    await doc.destroy();
  }
}
