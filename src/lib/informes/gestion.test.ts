import { describe, expect, it } from "vitest";
import { calcularEstados } from "@/lib/contabilidad/estados";
import type { Asiento } from "@/lib/contabilidad/diario";
import { excelResultados, pdfBalance, pdfResultados } from "./gestion";

const l = (cuenta: string, debe: number, haber: number) => ({
  cuenta,
  nombre: "",
  debe,
  haber,
});
const asientos: Asiento[] = [
  {
    fecha: "2026-03-10",
    origen: "Manual",
    descripcion: "venta",
    lineas: [l("1.1.01.001", 500000, 0), l("4.1.01.001", 0, 500000)],
  },
  {
    fecha: "2026-04-10",
    origen: "Manual",
    descripcion: "gasto",
    lineas: [l("5.3.01.007", 100000, 0), l("1.1.01.001", 0, 100000)],
  },
  {
    fecha: "2026-05-10",
    origen: "Manual",
    descripcion: "préstamo",
    lineas: [l("1.1.01.006", 300000, 0), l("2.1.02.002", 0, 300000)],
  },
];

describe("informes para presentar", () => {
  it("balance en PDF", async () => {
    const e = calcularEstados({
      asientos,
      iniciales: {
        fecha: "2025-12-31",
        saldos: { "1.1.01.001": 1000000, "3.1.01.001": 1000000 },
      },
      cierre: "2026-11-27",
    });
    const b = await pdfBalance({
      empresa: "Prueba SA",
      cuit: "30123456789",
      generado: "2026-11-27",
      e,
      intermedio: true,
    });
    expect(b.size).toBeGreaterThan(3000);
  });
  it("resultados mes a mes en PDF y Excel", async () => {
    const d = {
      empresa: "Prueba SA",
      cuit: "30123456789",
      desde: "2026-01-01",
      hasta: "2026-03-31",
      generado: "2026-11-27",
      meses: ["2026-01", "2026-02", "2026-03"],
      filas: [
        {
          nombre: "Ventas netas",
          valores: [100, 200, 300],
          total: 600,
          esTotal: false,
        },
        {
          nombre: "Resultado",
          valores: [10, -20, 30],
          total: 20,
          esTotal: true,
        },
      ],
      indicadores: [{ nombre: "Liquidez", valores: ["1,2", "1,3", "1,4"] }],
    };
    expect((await pdfResultados(d)).size).toBeGreaterThan(3000);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await (await excelResultados(d)).arrayBuffer());
    expect(wb.getWorksheet("Resultados")!.getRow(10).getCell(6).value).toBe(20);
  });
});
