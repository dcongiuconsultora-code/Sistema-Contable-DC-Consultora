import { describe, expect, it } from "vitest";
import type { Cell } from "exceljs";
import { evaluador } from "./excel-a-pdf";

const hoja = (valores: Record<string, unknown>) => ({
  getCell: (ref: string) => {
    const v = valores[ref] ?? null;
    return {
      value: v,
      formula:
        typeof v === "object" && v && "formula" in v
          ? (v as { formula: string }).formula
          : undefined,
    } as unknown as Cell;
  },
});

describe("fórmulas del modelo", () => {
  it("sumas, rangos y referencias", () => {
    const e = evaluador(
      hoja({
        B1: 10,
        B2: 20,
        B3: { formula: "SUM(B1:B2)" },
        C1: { formula: "B3-B1*2+(5)" },
      }),
    );
    expect(e.valorCelda("B3")).toBe(30);
    expect(e.valorCelda("C1")).toBe(15);
  });
  it("referencias circulares no se cuelgan", () => {
    const e = evaluador(
      hoja({ A1: { formula: "A2+1" }, A2: { formula: "A1+1" } }),
    );
    expect(Number.isFinite(e.valorCelda("A1"))).toBe(true);
  });
});
