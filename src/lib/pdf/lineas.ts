// Agrupa el texto de un PDF en líneas con la posición horizontal de cada fragmento.
// Los resúmenes bancarios se leen por columnas, así que la posición es lo que distingue
// un débito de un crédito.

export interface Fragmento {
  x: number;
  /** Borde derecho: los importes están alineados a la derecha. */
  fin: number;
  texto: string;
}

export interface LineaPdf {
  pagina: number;
  y: number;
  fragmentos: Fragmento[];
  texto: string;
}

/** Lo mínimo que usamos de un documento abierto con pdf.js. */
export interface DocumentoPdf {
  numPages: number;
  getPage(n: number): Promise<{
    getTextContent(): Promise<{ items: unknown[] }>;
  }>;
}

interface ItemTexto {
  str: string;
  width: number;
  transform: number[];
}

export async function extraerLineas(doc: DocumentoPdf): Promise<LineaPdf[]> {
  const lineas: LineaPdf[] = [];
  for (let pagina = 1; pagina <= doc.numPages; pagina++) {
    const { items } = await (await doc.getPage(pagina)).getTextContent();
    const porAltura: LineaPdf[] = [];
    for (const item of items as ItemTexto[]) {
      if (!item.str?.trim()) continue;
      const y = item.transform[5];
      // Fragmentos a menos de 2 puntos de altura van en la misma línea.
      let linea = porAltura.find((l) => Math.abs(l.y - y) < 2);
      if (!linea) {
        linea = { pagina, y, fragmentos: [], texto: "" };
        porAltura.push(linea);
      }
      linea.fragmentos.push({
        x: item.transform[4],
        fin: item.transform[4] + item.width,
        texto: item.str.trim(),
      });
    }
    porAltura.sort((a, b) => b.y - a.y);
    for (const l of porAltura) {
      l.fragmentos.sort((a, b) => a.x - b.x);
      l.texto = l.fragmentos.map((f) => f.texto).join(" ");
    }
    lineas.push(...porAltura);
  }
  return lineas;
}
