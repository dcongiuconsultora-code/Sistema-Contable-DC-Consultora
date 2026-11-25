import { describe, expect, it } from "vitest";
import type { PeriodoIva } from "@/lib/iva/liquidacion";
import { asientoIibb, asientoLiquidacionIva, encadenarIibb } from "./asientos";

const balancea = (lineas: { debe: number; haber: number }[]) =>
  Math.round(lineas.reduce((s, l) => s + l.debe - l.haber, 0) * 100) / 100;

describe("asientos automáticos de impuestos", () => {
  it("IVA con saldo a pagar", () => {
    const p = {
      periodo: "2026-10",
      manual: {
        saldoTecnicoAnterior: 100,
        saldoLibreDisponibilidadAnterior: 0,
        percepciones: 50,
        retenciones: 30,
      },
      liquidacion: {
        debitoFiscal: 1000,
        creditoFiscal: 600,
        saldoTecnico: 300,
        saldoTecnicoAFavor: 0,
        saldoAPagar: 220,
        saldoLibreDisponibilidad: 0,
      },
    } as unknown as PeriodoIva;
    const a = asientoLiquidacionIva(p)!;
    expect(a.fecha).toBe("2026-10-31");
    expect(balancea(a.lineas)).toBe(0);
    expect(a.lineas.find((l) => l.cuenta === "2.1.04.002")?.haber).toBe(220);
  });

  it("IVA con saldo técnico a favor", () => {
    const p = {
      periodo: "2026-11",
      manual: {
        saldoTecnicoAnterior: 0,
        saldoLibreDisponibilidadAnterior: 40,
        percepciones: 10,
        retenciones: 0,
      },
      liquidacion: {
        debitoFiscal: 100,
        creditoFiscal: 300,
        saldoTecnico: -200,
        saldoTecnicoAFavor: 200,
        saldoAPagar: 0,
        saldoLibreDisponibilidad: 50,
      },
    } as unknown as PeriodoIva;
    expect(balancea(asientoLiquidacionIva(p)!.lineas)).toBe(0);
  });

  it("IIBB: arrastra el saldo a favor y balancea", () => {
    const c = encadenarIibb({
      "2026-09": {
        determinado: 100,
        retenciones: 150,
        percepciones: 0,
        sircreb: 20,
      },
      "2026-10": {
        determinado: 500,
        retenciones: 0,
        percepciones: 30,
        sircreb: 0,
      },
    });
    expect(c.get("2026-09")).toMatchObject({ aPagar: 0, saldoAFavor: 70 });
    expect(c.get("2026-10")).toMatchObject({
      saldoAFavorAnterior: 70,
      aPagar: 400,
      arrastradoDe: "2026-09",
    });
    for (const p of c.values())
      expect(balancea(asientoIibb(p)!.lineas)).toBe(0);
  });
});
