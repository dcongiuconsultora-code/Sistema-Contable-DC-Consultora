import { describe, expect, it } from "vitest";
import type { Comprobante } from "@/lib/arca/tipos";
import { flujoDeCaja, resultados } from "@/lib/contabilidad/indicadores";
import type { Asiento } from "@/lib/contabilidad/diario";
import { erroresReparto, pesoEnUnidad, repartoDeCompra } from "./unidades";

const l = (cuenta: string, debe: number, haber: number) => ({
  cuenta,
  nombre: "",
  debe,
  haber,
});
const compra: Asiento = {
  fecha: "2026-03-10",
  origen: "ARCA",
  descripcion: "factura compartida",
  lineas: [l("5.1.01.001", 1000, 0), l("1.1.01.006", 0, 1000)],
  reparto: [
    { unidad: "mini", porcentaje: 60 },
    { unidad: "drug", porcentaje: 30 },
  ],
};

describe("prorrateo entre unidades", () => {
  it("cada unidad toma su parte y lo que falta queda compartido", () => {
    expect(pesoEnUnidad(compra, "mini")).toBe(0.6);
    expect(pesoEnUnidad(compra, "drug")).toBe(0.3);
    expect(pesoEnUnidad(compra, null)).toBeCloseTo(0.1);
    expect(pesoEnUnidad(compra, undefined)).toBe(1);
    expect(
      resultados([compra], "2026-01-01", "2026-12-31", "mini").costos,
    ).toBe(600);
    expect(
      resultados([compra], "2026-01-01", "2026-12-31", "drug").costos,
    ).toBe(300);
    expect(resultados([compra], "2026-01-01", "2026-12-31").costos).toBe(1000);
    expect(
      flujoDeCaja([compra], "2026-01-01", "2026-12-31", "mini").salidas,
    ).toBe(600);
  });

  it("la factura manda sobre el proveedor, y una unidad elegida a mano anula el prorrateo", () => {
    const cfg = {
      unidades: [],
      proveedores: { "30711111111": "mini" },
      repartos: { "30711111111": compra.reparto! },
    };
    const c = { cuitContraparte: "30711111111" } as Comprobante;
    expect(repartoDeCompra(c, cfg)).toEqual(compra.reparto);
    expect(repartoDeCompra({ ...c, unidad: "drug" }, cfg)).toBeNull();
    expect(
      repartoDeCompra(
        { ...c, reparto: [{ unidad: "drug", porcentaje: 100 }] },
        cfg,
      ),
    ).toEqual([{ unidad: "drug", porcentaje: 100 }]);
  });

  it("controla los porcentajes", () => {
    expect(
      erroresReparto([
        { unidad: "a", porcentaje: 70 },
        { unidad: "b", porcentaje: 40 },
      ])[0],
    ).toContain("110");
    expect(
      erroresReparto([
        { unidad: "a", porcentaje: 50 },
        { unidad: "b", porcentaje: 50 },
      ]),
    ).toEqual([]);
  });
});
