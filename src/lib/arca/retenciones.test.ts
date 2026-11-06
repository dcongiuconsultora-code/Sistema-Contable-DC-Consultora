import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { leerXls } from "./leer-xls";
import {
  deduccionesIva,
  importarMisRetenciones,
  importarSircreb,
  totalesDeducciones,
} from "./retenciones";

const fixture = (nombre: string) =>
  fs.readFileSync(path.join(__dirname, "__fixtures__", nombre));

describe("Mis Retenciones (.xls de ARCA)", () => {
  const b = fixture("mis-retenciones-ejemplo.xls");
  const r = importarMisRetenciones(
    leerXls(
      b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
    ),
  );

  it("lee todas las filas con acentos e impuestos", () => {
    expect(r.errores).toEqual([]);
    expect(r.deducciones).toHaveLength(5);
    expect(r.deducciones[0]).toMatchObject({
      impuesto: "IVA",
      tipo: "percepcion",
      fecha: "2026-09-29",
      cuitAgente: "30733333331",
      agente: "Proveedor Uno SA",
      importe: 2711.61,
    });
    expect(r.deducciones[3]).toMatchObject({
      impuesto: "Ganancias",
      tipo: "retencion",
      importe: 32056.6,
    });
  });

  it("suma las percepciones de IVA del período, restando las de notas de crédito", () => {
    expect(deduccionesIva(r.deducciones, "2026-09")).toEqual({
      percepciones: 2440.78,
      retenciones: 201600,
    });
    expect(deduccionesIva(r.deducciones, "2026-08")).toEqual({
      percepciones: 4135.13,
      retenciones: 0,
    });
  });
});

describe("SIRCREB (formato de importación de SIFERE)", () => {
  const r = importarSircreb(fixture("sircreb-ejemplo.txt").toString("latin1"));

  it("lee jurisdicción, agente e importe", () => {
    expect(r.errores).toEqual([]);
    expect(
      r.deducciones.map((d) => [
        d.jurisdiccion,
        d.cuitAgente,
        d.periodo,
        d.importe,
      ]),
    ).toEqual([
      ["Salta", "30500010084", "2026-09", 3025],
      ["Jujuy", "30703088534", "2026-09", 750],
      ["Santiago del Estero", "30500010084", "2026-09", 1200.5],
    ]);
  });

  it("agrupa por jurisdicción", () => {
    expect(
      totalesDeducciones(r.deducciones, "2026-09").map((t) => [
        t.jurisdiccion,
        t.importe,
      ]),
    ).toEqual([
      ["Jujuy", 750],
      ["Salta", 3025],
      ["Santiago del Estero", 1200.5],
    ]);
  });

  it("marca las líneas con otro formato", () => {
    expect(importarSircreb("esto no es sircreb\n").errores).toHaveLength(1);
  });
});
