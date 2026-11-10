import { describe, expect, it } from "vitest";
import { leerPlanDePago } from "./leer-plan";

// Textos con la misma forma que los PDF reales, con datos inventados.
const ARCA = [
  "CUIT: 20111111112 Nombre y Apellido: PEREZ, JUAN",
  "Fh. de Consolidación: 06/06/2026 Número de Plan: W000001",
  "Cuota N° Capital($) Interés Financiero($) Interés Resarcitorio($) Total($) Fecha Vencimiento",
  "1 41787,8 8.739,06 - 50.526,86 16/07/2026",
  "8.739,06 463,16 50.990,02 26/07/2026",
  "2 42936,95 7.589,91 - 50.526,86 16/08/2026",
  "7.589,91 463,16 50.990,02 26/08/2026",
  "Totales 317.784,07 35.903,95 0,00 353.688,02 1° Vencimiento",
  "35.903,95 3.242,12 356.930,14 2° Vencimiento",
];

const JUJUY = [
  "PLAN DE FACILIDAD DE PAGO F - 221",
  "FAC - 1 - WEB - 2026 - 9999 03/11/26",
  "CUIT / CUIL 27111111110 NOMBRE PEREZ ANA",
  "Concepto Ingresos Brutos",
  "Pago (RG 1767/26), como también que los datos consignados",
  "A - 1- 11111 2025/12 022900,00 6633,39 29533,39",
  "A - 1- 11111 2026/08 026100,00 1794,38 27894,38",
  "CUOTA Nro VENCIMIENTO IMPORTE",
  "1 08/11/2026 $ 31979,12",
  "2 15/12/2026 $ 31979,12",
  "3 15/01/2027 $ 31979,12",
];

describe("lectura de planes de pago en PDF", () => {
  it("Mis Facilidades de ARCA, con primer y segundo vencimiento", () => {
    const p = leerPlanDePago(ARCA)!;
    expect(p).toMatchObject({
      organismo: "ARCA",
      numero: "W000001",
      cuit: "20111111112",
      descripcion: "Consolidado el 06/06/2026",
    });
    expect(p.cuotas).toEqual([
      {
        numero: 1,
        importe: 50526.86,
        fecha: "2026-07-16",
        importe2: 50990.02,
        fecha2: "2026-07-26",
      },
      {
        numero: 2,
        importe: 50526.86,
        fecha: "2026-08-16",
        importe2: 50990.02,
        fecha2: "2026-08-26",
      },
    ]);
  });

  it("plan de Rentas Jujuy", () => {
    const p = leerPlanDePago(JUJUY)!;
    expect(p).toMatchObject({
      organismo: "Rentas Jujuy",
      numero: "FAC-1-WEB-2026-9999",
      cuit: "27111111110",
      descripcion: "Ingresos Brutos 2025/12 a 2026/08",
    });
    expect(p.cuotas.map((c) => [c.numero, c.fecha, c.importe])).toEqual([
      [1, "2026-11-08", 31979.12],
      [2, "2026-12-15", 31979.12],
      [3, "2027-01-15", 31979.12],
    ]);
  });

  it("otro PDF no es un plan", () => {
    expect(
      leerPlanDePago(["Resumen de cuenta", "Saldo anterior 100,00"]),
    ).toBeNull();
  });
});
