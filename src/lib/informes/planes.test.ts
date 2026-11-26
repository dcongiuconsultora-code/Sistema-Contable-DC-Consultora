import { describe, expect, it } from "vitest";
import type { PlanPago } from "@/lib/vencimientos/vencimientos";
import { cuadroPlanes, excelPlanes, pdfPlanes } from "./planes";
import {
  excelMonotributo,
  pdfMonotributo,
  situacionMonotributo,
  type InformeMonotributo,
} from "./monotributo";

const plan = (extra: Partial<PlanPago>): PlanPago => ({
  organismo: "ARCA",
  numero: "W1",
  descripcion: "Mis Facilidades",
  cuotas: 6,
  primeraCuota: "2026-10",
  importeCuota: 1000,
  diaVencimiento: 16,
  cuotasPagadas: [1],
  estado: "vigente",
  ...extra,
});

describe("cuadro de planes de pago", () => {
  const planes = [
    plan({}),
    plan({
      organismo: "Rentas Jujuy",
      numero: "FAC-9",
      cuotas: 3,
      primeraCuota: "2026-12",
      importeCuota: 500,
      cuotasPagadas: [],
    }),
    plan({ numero: "W9", estado: "caducado" }),
  ];
  const c = cuadroPlanes(planes, "2026-11-26");

  it("solo los vigentes, con hasta cuándo y lo que falta", () => {
    expect(
      c.planes.map((p) => [p.nombre, p.pagadas, p.vencidas, p.ultima, p.saldo]),
    ).toEqual([
      ["ARCA W1", 1, 1, "2027-03", 5000],
      ["Rentas Jujuy FAC-9", 0, 0, "2027-02", 1500],
    ]);
    expect(c.planes[0].proxima).toMatchObject({
      numero: 3,
      fecha: "2026-12-16",
    });
  });

  it("mes a mes, con la cuota vencida marcada y totales por año", () => {
    expect(c.meses.map((m) => [m.mes, m.total, m.vencido])).toEqual([
      ["2026-11", 1000, true],
      ["2026-12", 1500, false],
      ["2027-01", 1500, false],
      ["2027-02", 1500, false],
      ["2027-03", 1000, false],
    ]);
    expect(c.porAnio).toEqual([
      { anio: "2026", total: 2500 },
      { anio: "2027", total: 4000 },
    ]);
    expect(c.total).toBe(6500);
  });

  it("arma el PDF y el Excel", async () => {
    const d = {
      empresa: "Prueba SA",
      cuit: "30123456789",
      generado: "2026-11-26",
      cuadro: c,
    };
    expect((await pdfPlanes(d)).size).toBeGreaterThan(3000);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await (await excelPlanes(d)).arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Resumen",
      "Cuotas por mes",
    ]);
    expect(wb.getWorksheet("Cuotas por mes")!.getRow(1).values).toContain(
      "Rentas Jujuy FAC-9",
    );
  });
});

describe("informe de monotributo", () => {
  const i: InformeMonotributo = {
    empresa: "Prueba",
    cuit: "27123456789",
    generado: "2026-11-26",
    actividad: "servicios",
    categoria: "B",
    tope: 10000000,
    cuotaMensual: 40000,
    corresponde: "C",
    cuotaCorresponde: 50000,
    meses: Array.from({ length: 12 }, (_, k) => ({
      mes: `2026-${String(k + 1).padStart(2, "0")}`,
      facturado: 1000000,
      comprado: 200000,
    })),
    totalFacturado: 12000000,
    totalComprado: 2400000,
    recategorizacion: { cierre: "2026-12", presentarEn: "enero de 2027" },
    vencimientos: [],
  };
  it("explica la situación", () => {
    const t = situacionMonotributo(i);
    expect(t[0]).toContain("superaste en $ 2.000.000,00");
    expect(t[1]).toContain("categoría C, con una cuota de $ 50.000,00");
    expect(t[2]).toContain("enero de 2027");
  });
  it("arma el PDF y el Excel", async () => {
    expect((await pdfMonotributo(i)).size).toBeGreaterThan(3000);
    expect((await excelMonotributo(i)).size).toBeGreaterThan(3000);
  });
});
