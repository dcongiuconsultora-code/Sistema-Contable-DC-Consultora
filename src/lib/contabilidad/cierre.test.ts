import { describe, expect, it } from "vitest";
import { calcularEstados } from "./estados";
import { finDeEjercicio } from "./cierre";
import type { Asiento } from "./diario";

const l = (cuenta: string, debe: number, haber: number) => ({
  cuenta,
  nombre: "",
  debe,
  haber,
});
const suma = (a: Asiento | null) =>
  Math.round(
    (a?.lineas ?? []).reduce((s, x) => s + x.debe - x.haber, 0) * 100,
  ) / 100;

describe("fin de ejercicio", () => {
  it("refundición, cierre y saldos del ejercicio siguiente", () => {
    const iniciales = {
      fecha: "2025-12-31",
      saldos: { "1.1.01.001": 1000, "3.1.01.001": 1000 },
    };
    const asientos: Asiento[] = [
      {
        fecha: "2026-03-10",
        origen: "Manual",
        descripcion: "venta",
        lineas: [l("1.1.01.001", 500, 0), l("4.1.01.001", 0, 500)],
      },
      {
        fecha: "2026-04-10",
        origen: "Manual",
        descripcion: "gasto",
        lineas: [l("5.2.01.006", 100, 0), l("1.1.01.001", 0, 100)],
      },
    ];
    const e = calcularEstados({ asientos, iniciales, cierre: "2026-12-31" });
    const f = finDeEjercicio(e);
    expect(f.resultado).toBe(400);
    expect(suma(f.refundicion)).toBe(0);
    expect(suma(f.cierre)).toBe(0);
    expect(
      f.refundicion?.lineas.find((x) => x.cuenta === "3.2.02.002")?.haber,
    ).toBe(400);
    expect(f.siguiente).toEqual({
      fecha: "2026-12-31",
      saldos: { "1.1.01.001": 1400, "3.1.01.001": 1000, "3.2.02.001": 400 },
    });
  });
});
