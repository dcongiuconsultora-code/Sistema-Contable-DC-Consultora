import { describe, expect, it } from "vitest";
import {
  type OrdenTrabajo,
  atrasada,
  claveOrden,
  fechaEntrega,
  manoDeObra,
  nuevaOrden,
  proximoNumero,
  resumenPorMes,
  saldo,
  saldosPorCliente,
  sinIva,
} from "./ordenes";
import { excelOrdenes, leerPlanillaOrdenes } from "./planilla";

const orden = (o: Partial<OrdenTrabajo>): OrdenTrabajo => ({
  ...nuevaOrden([], "2026-03-01"),
  ...o,
});

describe("órdenes de trabajo", () => {
  it("calcula saldo, mano de obra, sin IVA y entrega", () => {
    const o = orden({
      fecha: "2026-03-10",
      total: 121000,
      materiales: 50000,
      conFactura: true,
      plazoDias: 15,
      pagos: [
        { fecha: "2026-03-10", importe: 60000, recibo: "R-1" },
        { fecha: "2026-03-20", importe: 1000, recibo: "" },
      ],
    });
    expect(saldo(o)).toBe(60000);
    expect(manoDeObra(o)).toBe(71000);
    expect(sinIva(o)).toBe(100000);
    expect(fechaEntrega(o)).toBe("2026-03-25");
    expect(atrasada(o, "2026-03-26")).toBe(true);
    expect(atrasada({ ...o, estado: "Terminado" }, "2026-03-26")).toBe(false);
    expect(saldo({ ...o, ivaAparte: 5000 })).toBe(65000);
  });

  it("numera los pedidos por año como la planilla", () => {
    const ordenes = [
      orden({ numero: "2610-065" }),
      orden({ numero: "2611-067" }),
      orden({ numero: "2512-140" }),
    ];
    expect(proximoNumero(ordenes, "2026-11-28")).toBe("2611-068");
    expect(proximoNumero(ordenes, "2027-01-04")).toBe("2701-001");
  });

  it("resume por mes y por cliente", () => {
    const ordenes = [
      orden({
        fecha: "2026-03-02",
        cliente: "Kiosco Uno",
        total: 1000,
        materiales: 400,
      }),
      orden({
        fecha: "2026-03-15",
        cliente: "kiosco uno",
        total: 500,
        pagos: [{ fecha: "2026-03-15", importe: 500, recibo: "" }],
      }),
      orden({ fecha: "2026-04-01", cliente: "Farmacia Dos", total: 2000 }),
    ];
    const meses = resumenPorMes(ordenes);
    expect(meses.map((m) => m.mes)).toEqual(["2026-04", "2026-03"]);
    expect(meses[1]).toMatchObject({
      cantidad: 2,
      total: 1500,
      materiales: 400,
      manoDeObra: 1100,
      cobrado: 500,
      saldo: 1000,
    });
    expect(saldosPorCliente(ordenes).map((s) => [s.cliente, s.saldo])).toEqual([
      ["Farmacia Dos", 2000],
      ["Kiosco Uno", 1000],
    ]);
  });
});

describe("planilla de seguimiento", () => {
  async function planilla() {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const cl = wb.addWorksheet("Clientes");
    cl.getRow(4).values = [
      "",
      "",
      "Cliente",
      "Domicilio",
      "Localidad",
      "Teléfono",
      "Correo electrónico",
    ].slice(1);
    cl.getRow(5).values = [
      1,
      "Kiosco Uno",
      "Calle Falsa 123",
      "Salta capital",
      3870000000,
      "kiosco@ejemplo.com",
    ];
    cl.getRow(6).values = [
      2,
      "Muebles Dos",
      "",
      "Salta capital",
      "Cuit: 30000000007",
      "",
    ];
    const tt = wb.addWorksheet("Tipo de Trabajos");
    tt.getCell("B4").value = "Tipo de trabajo";
    tt.getCell("B5").value = "Mostrador";
    tt.getCell("B6").value = "Vitrina vertical";
    const ws = wb.addWorksheet("Trabajos ");
    ws.getRow(1).values = [
      "",
      "",
      "Fecha",
      "Cliente",
      "Pedido Nº",
      "OT",
      "Tipo de Trabajo",
      "Información adicional",
      "Cantidad",
      "Total Facturado",
      "sin iva",
      "factura",
      "IVA",
      "materia",
      "mano de obra",
      "Estado",
      "Fecha1",
      "Pago 1",
      "recibo",
      "Fecha2",
      "Pago 2",
      "recibo2",
      "Fecha3",
      "Pago 3",
      "Recibo 3",
      "Fecha 4",
      "Pago 4",
      "Pago 5",
      "Saldo",
    ];
    const fila = (n: number, valores: Record<string, unknown>) => {
      for (const [col, v] of Object.entries(valores))
        ws.getCell(`${col}${n}`).value = v as never;
    };
    fila(2, {
      C: new Date(Date.UTC(2026, 2, 5)),
      D: "Kiosco Uno",
      E: "2603-001",
      F: 15,
      G: "Mostrador",
      H: "de 1,50",
      I: 1,
      J: 100000,
      M: 10000,
      N: 40000,
      O: { formula: "J2-N2", result: 60000 },
      P: "En Proceso",
      Q: new Date(Date.UTC(2026, 2, 5)),
      R: 50000,
      S: "R-10",
      AA: 20000,
      AB: 5000,
    });
    fila(3, {
      C: new Date(Date.UTC(2026, 2, 9)),
      D: "Muebles Dos",
      E: "2603-002",
      G: "Vitrina vertical",
      I: 2,
      J: 121000,
      K: { formula: "J3/1.21", result: 100000 },
      L: "F-0001",
      M: { formula: "J3-K3", result: 21000 },
      N: 30000,
      P: "Terminado",
      T: new Date(Date.UTC(2026, 2, 20)),
      U: 121000,
    });
    fila(4, { A: "2026- Abril" });
    return wb;
  }

  it("lee órdenes, pagos, clientes y tipos", async () => {
    const p = leerPlanillaOrdenes(await planilla());
    expect(p.tipos).toEqual(["Mostrador", "Vitrina vertical"]);
    expect(p.clientes).toEqual([
      {
        nombre: "Kiosco Uno",
        cuit: "",
        domicilio: "Calle Falsa 123",
        localidad: "Salta capital",
        telefono: "3870000000",
        email: "kiosco@ejemplo.com",
      },
      {
        nombre: "Muebles Dos",
        cuit: "30000000007",
        domicilio: "",
        localidad: "Salta capital",
        telefono: "",
        email: "",
      },
    ]);
    expect(p.ordenes).toHaveLength(2);
    const [a, b] = p.ordenes;
    expect(a).toMatchObject({
      numero: "2603-001",
      fecha: "2026-03-05",
      plazoDias: 15,
      estado: "En proceso",
      ivaAparte: 10000,
      conFactura: false,
      materiales: 40000,
    });
    // El pago 4 y el 5 no tienen fecha: toman la del último pago anterior.
    expect(a.pagos).toEqual([
      { fecha: "2026-03-05", importe: 50000, recibo: "R-10" },
      { fecha: "2026-03-05", importe: 20000, recibo: "" },
      { fecha: "2026-03-05", importe: 5000, recibo: "" },
    ]);
    expect(saldo(a)).toBe(35000);
    // IVA calculado con fórmula: ya está dentro del total.
    expect(b).toMatchObject({
      conFactura: true,
      factura: "F-0001",
      ivaAparte: 0,
    });
    expect(saldo(b)).toBe(0);
    expect(claveOrden(a)).not.toBe(claveOrden(b));
  });

  it("arma la planilla para descargar", async () => {
    const p = leerPlanillaOrdenes(await planilla());
    const blob = await excelOrdenes(p.ordenes, "Empresa de prueba", "Fábrica");
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    const ws = wb.getWorksheet("Trabajos")!;
    expect(ws.getCell("B2").value).toBe("2603-001");
    const titulos = (ws.getRow(1).values as unknown[]).filter(Boolean);
    expect(titulos.at(-1)).toBe("Saldo");
    expect(ws.getRow(2).getCell(titulos.length).value).toBe(35000);
  });
});
