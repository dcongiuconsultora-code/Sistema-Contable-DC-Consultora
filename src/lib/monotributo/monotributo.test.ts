import { describe, expect, it } from "vitest";
import type { Comprobante } from "@/lib/arca/tipos";
import {
  categoriaQueCorresponde,
  categoriasDesdeTexto,
  proximaRecategorizacion,
  ultimos12Meses,
} from "./monotributo";

describe("monotributo", () => {
  const tabla = categoriasDesdeTexto(
    [
      "Categoría\tIngresos brutos\tServicios\tBienes",
      "A\t$ 8.000.000,00\t$ 30.000,00\t$ 29.000,00",
      "B\t$ 12.000.000,00\t$ 34.000,00\t$ 33.000,00",
      "C\t$ 17.000.000,00\t$ 40.000,00\t$ 38.000,00",
    ].join("\n"),
  );

  it("lee la tabla pegada desde ARCA", () => {
    expect(
      tabla.map((c) => [c.letra, c.tope, c.cuotaServicios, c.cuotaBienes]),
    ).toEqual([
      ["A", 8_000_000, 30_000, 29_000],
      ["B", 12_000_000, 34_000, 33_000],
      ["C", 17_000_000, 40_000, 38_000],
    ]);
  });

  it("suma los últimos 12 meses y elige la categoría", () => {
    const c = (fecha: string, total: number) =>
      ({ fecha, total }) as Comprobante;
    const r = ultimos12Meses(
      [
        c("2025-10-31", 5_000_000),
        c("2026-10-01", 4_000_000),
        c("2026-10-20", -500_000),
        c("2026-11-02", 9),
      ],
      [],
      "2026-10",
    );
    expect(r.totalFacturado).toBe(3_500_000); // octubre de 2025 queda afuera
    expect(categoriaQueCorresponde(9_000_000, tabla)?.letra).toBe("B");
    expect(categoriaQueCorresponde(20_000_000, tabla)).toBeNull();
  });

  it("calcula la próxima recategorización", () => {
    expect(proximaRecategorizacion("2026-11-09")).toEqual({
      cierre: "2026-12",
      presentarEn: "enero de 2027",
    });
    expect(proximaRecategorizacion("2026-03-01").presentarEn).toBe(
      "julio de 2026",
    );
    expect(proximaRecategorizacion("2027-01-15").cierre).toBe("2026-12");
  });
});

describe("tabla oficial de ARCA", () => {
  it("lee todas las columnas", async () => {
    const { readFileSync, writeFileSync } = await import("node:fs");
    const texto = readFileSync(
      "src/lib/monotributo/fixtures/tabla-arca.txt",
      "utf8",
    );
    const t = categoriasDesdeTexto(texto);
    if (process.env.GUARDAR_TABLA)
      writeFileSync(process.env.GUARDAR_TABLA, JSON.stringify(t));
    expect(t).toHaveLength(11);
    expect(t[0]).toEqual({
      letra: "A",
      tope: 12_009_410.45,
      superficie: "Hasta 30 m²",
      energia: "Hasta 3330 kWh",
      alquileres: 2_792_886.15,
      precioMaximo: 716_840.77,
      impuestoServicios: 5_585.77,
      impuestoBienes: 5_585.77,
      sipa: 18_246.86,
      obraSocial: 25_694.55,
      cuotaServicios: 49_527.18,
      cuotaBienes: 49_527.18,
    });
    expect(t[10]).toMatchObject({
      letra: "K",
      tope: 126_610_838.75,
      cuotaServicios: 1_614_446.04,
      cuotaBienes: 702_103.24,
    });
  });
});
