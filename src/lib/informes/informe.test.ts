import { describe, expect, it } from "vitest";
import type { Comprobante } from "@/lib/arca/tipos";
import {
  excelInforme,
  filasResumen,
  type InformeMensual,
  nombreArchivo,
  pdfInforme,
} from "./informe";

const informe: InformeMensual = {
  empresa: "Empresa de Prueba S.A.",
  cuit: "30123456789",
  periodo: "2026-10",
  generado: "2026-11-26",
  resumen: {
    ventas: 1000000,
    ventasMesAnterior: 800000,
    compras: 600000,
    gastos: 150000,
    resultado: 250000,
    margen: 0.25,
    cajaYBancos: 500000,
    teDeben: 300000,
    debes: 200000,
  },
  indicadores: [
    {
      nombre: "Rentabilidad",
      valor: "25 %",
      estado: "bien",
      lectura: "De cada $100 te quedan $25.",
      formula: "",
    },
    {
      nombre: "Liquidez corriente",
      valor: "0,8",
      estado: "critico",
      lectura: "No alcanza.",
      formula: "",
    },
  ],
  meses: [
    { periodo: "2026-09", ventas: 800000, compras: 500000, resultado: 100000 },
    { periodo: "2026-10", ventas: 1000000, compras: 600000, resultado: 250000 },
  ],
  vencimientos: [
    {
      fecha: "2026-12-18",
      impuesto: "IVA",
      detalle: "DDJJ y pago de noviembre",
    },
  ],
  pendientes: ["2 facturas sin cobrar hace más de 60 días"],
  ventas: [
    {
      fecha: "2026-10-05",
      tipoNombre: "Factura A",
      puntoVenta: 1,
      numeroDesde: 12,
      cuitContraparte: "20111111112",
      contraparte: "Cliente",
      netoGravado: 100,
      noGravado: 0,
      exento: 0,
      iva: 21,
      otrosTributos: 0,
      total: 121,
    } as Comprobante,
  ],
};

describe("informe mensual", () => {
  it("resumen con la variación de ventas", () => {
    const f = filasResumen(informe);
    expect(f[0][2]).toBe("+25 % vs. mes anterior");
    expect(f[3][0]).toBe("Ganancia del mes");
  });

  it("arma el Excel con sus hojas", async () => {
    const blob = await excelInforme(informe);
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Resumen",
      "Mes a mes",
      "Ventas del mes",
    ]);
    expect(wb.getWorksheet("Resumen")!.getCell("B4").value).toBe(
      "Informe de Octubre 2026",
    );
  });

  it("arma el PDF", async () => {
    const blob = await pdfInforme(informe);
    const texto = new TextDecoder("latin1").decode(await blob.arrayBuffer());
    expect(texto.startsWith("%PDF")).toBe(true);
    expect(blob.size).toBeGreaterThan(3000);
  });

  it("nombre del archivo sin caracteres raros", () => {
    expect(nombreArchivo(informe, "pdf")).toBe(
      "Informe_Empresa_de_Prueba_S_A_2026-10.pdf",
    );
  });
});
