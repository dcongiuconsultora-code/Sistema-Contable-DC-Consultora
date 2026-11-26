// Logos del estudio para los informes: el bordó para el Excel y el blanco para la franja del PDF.
export async function logosInforme(): Promise<{
  excel?: ArrayBuffer;
  pdf?: string;
}> {
  const leer = (url: string) =>
    fetch(url)
      .then((r) => (r.ok ? r.arrayBuffer() : undefined))
      .catch(() => undefined);
  const [excel, blanco] = await Promise.all([
    leer("/logo-dc.png"),
    leer("/logo-dc-blanco.png"),
  ]);
  let binario = "";
  for (const b of new Uint8Array(blanco ?? new ArrayBuffer(0)))
    binario += String.fromCharCode(b);
  return {
    excel,
    pdf: blanco ? `data:image/png;base64,${btoa(binario)}` : undefined,
  };
}
