import { describe, expect, it } from "vitest";
import type { Comprobante } from "./tipos";
import { compararImportacion, posiblesDuplicados } from "./duplicados";

const c = (numero: number, extra: Partial<Comprobante> = {}) =>
  ({
    tipoCodigo: 1,
    puntoVenta: 2,
    numeroDesde: numero,
    cuitContraparte: "20111111112",
    fecha: "2026-10-05",
    total: 1210,
    clase: "factura",
    ...extra,
  }) as Comprobante;

describe("duplicados", () => {
  it("cuenta nuevos, los que ya estaban y los repetidos en el archivo", () => {
    const r = compararImportacion([c(1), c(2)], [c(2), c(3), c(3), c(4)]);
    expect(r).toMatchObject({ nuevos: 2, yaEstaban: 1, repetidosEnArchivo: 1 });
    expect(r.unicos.map((x) => x.numeroDesde)).toEqual([2, 3, 4]);
  });

  it("detecta posibles duplicados con distinto número", () => {
    const g = posiblesDuplicados([
      c(1),
      c(7),
      c(8, { total: 500 }),
      c(9, { fecha: "2026-10-06" }),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0].map((x) => x.numeroDesde)).toEqual([1, 7]);
  });
});
