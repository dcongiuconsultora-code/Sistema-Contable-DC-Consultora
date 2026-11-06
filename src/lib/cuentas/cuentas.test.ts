import { describe, expect, it } from "vitest";
import type { Comprobante } from "@/lib/arca/tipos";
import {
  conciliarResumen,
  sugerenciaDesdeBanco,
} from "@/lib/bancos/conciliacion";
import type { ResumenBancario } from "@/lib/bancos/tipos";
import type { Movimiento } from "@/lib/movimientos/tipos";
import { cuentasCorrientes, normalizarNombre } from "./cuenta-corriente";

function comp(
  fecha: string,
  numero: number,
  total: number,
  cuit = "30711111111",
  contraparte = "Cliente Grande SAIC",
): Comprobante {
  return {
    fila: numero,
    fecha,
    periodo: fecha.slice(0, 7),
    tipoCodigo: total < 0 ? 3 : 1,
    tipoNombre: total < 0 ? "Nota de Crédito A" : "Factura A",
    letra: "A",
    clase: total < 0 ? "nota_credito" : "factura",
    puntoVenta: 2,
    numeroDesde: numero,
    numeroHasta: numero,
    cae: "",
    cuitContraparte: cuit,
    contraparte,
    moneda: "ARS",
    tipoCambio: 1,
    alicuotas: [],
    netoGravado: 0,
    noGravado: 0,
    exento: 0,
    otrosTributos: 0,
    iva: 0,
    total,
    computaIva: true,
    advertencias: [],
  };
}
let n = 0;
function mov(datos: Partial<Movimiento>): Movimiento {
  return {
    id: String(++n),
    tipo: "cobro",
    fecha: "2026-10-20",
    importe: 0,
    medio: "banco_cc",
    contraparte: "Cliente Grande SAIC",
    cuitContraparte: "",
    nota: "",
    estado: "aprobado",
    ...datos,
  };
}

describe("Cuenta corriente de clientes", () => {
  const facturas = [
    comp("2026-07-01", 1, 300000),
    comp("2026-09-10", 2, 500000),
    comp("2026-09-15", 3, -50000),
    comp("2026-10-01", 4, 121000, "", "Consumidor final"),
    comp("2026-10-05", 5, 200000, "30722222222", "Otro Cliente SRL"),
  ];
  const movimientos = [
    // Sin CUIT: se asigna por nombre aunque esté escrito distinto.
    mov({
      contraparte: "cliente grande s.a.i.c.",
      importe: 380000,
      retenciones: [{ impuesto: "IVA", importe: 20000 }],
    }),
    mov({
      contraparte: "Otro Cliente SRL",
      cuitContraparte: "30722222222",
      importe: 50000,
      estado: "enviado",
    }),
    mov({
      contraparte: "Otro Cliente SRL",
      cuitContraparte: "30722222222",
      importe: 999,
      estado: "observado",
    }),
    mov({
      tipo: "pago_proveedor",
      contraparte: "Cliente Grande SAIC",
      importe: 1,
    }),
  ];
  const cuentas = cuentasCorrientes(
    "cliente",
    facturas,
    movimientos,
    "2026-10-31",
  );
  const grande = cuentas.find((c) => c.cuit === "30711111111")!;
  const otro = cuentas.find((c) => c.cuit === "30722222222")!;

  it("suma facturas, resta notas de crédito, cobros y retenciones", () => {
    expect(cuentas).toHaveLength(2); // el consumidor final no tiene cuenta corriente
    expect(
      grande.items.map((i) => [i.descripcion, i.cargo, i.abono, i.saldo]),
    ).toEqual([
      ["Factura A 00002-00000001", 300000, 0, 300000],
      ["Factura A 00002-00000002", 500000, 0, 800000],
      ["Nota de Crédito A 00002-00000003", 0, 50000, 750000],
      ["Cobro", 0, 380000, 370000],
      ["Retención IVA", 0, 20000, 350000],
    ]);
    expect(grande.saldo).toBe(350000);
  });

  it("los pagos cancelan primero lo más viejo y se calcula la antigüedad", () => {
    expect(grande.pendientes).toEqual([
      {
        fecha: "2026-09-10",
        descripcion: "Factura A 00002-00000002",
        total: 500000,
        pendiente: 350000,
        dias: 51,
      },
    ]);
    expect(grande.antiguedad).toEqual({
      hasta30: 0,
      hasta60: 350000,
      hasta90: 0,
      mas90: 0,
    });
  });

  it("incluye lo enviado sin aprobar (marcado) y no lo observado", () => {
    expect(otro.saldo).toBe(150000);
    expect(otro.items.find((i) => i.descripcion === "Cobro")?.sinAprobar).toBe(
      true,
    );
  });

  it("normaliza nombres", () => {
    expect(normalizarNombre("Distribuidora Ríos S.R.L.")).toBe(
      normalizarNombre("DISTRIBUIDORA RIOS SRL"),
    );
  });
});

describe("Cuenta corriente de proveedores", () => {
  it("toma pagos, honorarios y gastos con factura; no los gastos sin factura", () => {
    const cuentas = cuentasCorrientes(
      "proveedor",
      [comp("2026-10-01", 10, 100000, "30733333334", "Estudio Jurídico")],
      [
        mov({
          tipo: "honorarios",
          contraparte: "Estudio Jurídico",
          importe: 60000,
        }),
        mov({
          tipo: "gasto",
          conFactura: false,
          contraparte: "Estudio Jurídico",
          importe: 5000,
          cuenta: "5.3.01.027",
        }),
      ],
      "2026-10-31",
    );
    expect(cuentas[0].saldo).toBe(40000);
  });
});

describe("Conciliación del resumen bancario", () => {
  const banco = (fecha: string, importe: number, descripcion: string) => ({
    fecha,
    descripcion,
    referencia: "",
    importe,
    saldo: null,
    pagina: 1,
  });
  const resumen: ResumenBancario = {
    banco: "Banco Macro",
    titular: "",
    cuit: "",
    desde: "2026-10-01",
    hasta: "2026-10-31",
    controles: [],
    cuentas: [
      {
        banco: "Banco Macro",
        tipo: "CC",
        numero: "3-152-1",
        moneda: "ARS",
        saldoInicial: 0,
        saldoFinal: 0,
        impuestoDebitosCreditos: 0,
        movimientos: [
          banco(
            "2026-10-20",
            380000,
            "TRANSF CLIENTE GRANDE 30711111111 VAR VARIOS",
          ),
          banco("2026-10-20", -2280, "N/D DBCR 25413 S/CR TASA GRAL"),
          banco(
            "2026-10-22",
            15000,
            "TRANSF PEREZ JUAN 20111111112 VAR VARIOS",
          ),
          banco(
            "2026-10-23",
            200000,
            "TRANSF OTRO CLIENTE 30722222222 VAR VARIOS",
          ),
          banco("2026-10-24", -31567.04, "INNOA SRL"),
          banco("2026-10-25", -50000, "PAGO DE CHEQUE DE CAMARA"),
          banco("2026-10-26", -98765.43, "AFIP"),
        ],
      },
    ],
  };
  const movs = [
    mov({ importe: 380000 }),
    mov({
      tipo: "pago_proveedor",
      fecha: "2026-10-28",
      importe: 99000,
      medio: "cheque",
    }), // no pasa por el banco
    mov({ tipo: "pago_proveedor", fecha: "2026-10-30", importe: 45000 }), // por banco, todavía no debitado
    mov({ tipo: "pago_proveedor", fecha: "2026-11-20", importe: 45000 }), // fuera del período
  ];
  const r = conciliarResumen(resumen, movs, {
    clientes: new Map([["30722222222", "Otro Cliente SRL"]]),
    proveedores: new Map([["30744444445", "Innoa S.R.L."]]),
  });

  it("separa conciliados, sugeridos, automáticos y sin registrar", () => {
    expect(r.filas.map((f) => f.estado)).toEqual([
      "conciliado",
      "automatico",
      "automatico",
      "sugerido",
      "sugerido",
      "automatico",
      "sin_registrar",
    ]);
    expect(r.totales.sin_registrar).toEqual({ cantidad: 1, importe: 98765.43 });
  });

  it("propone el cobro o pago con el cliente o proveedor que reconoce", () => {
    expect(r.filas[3].sugerencia).toMatchObject({
      tipo: "cobro",
      contraparte: "Otro Cliente SRL",
      cuitContraparte: "30722222222",
      importe: 200000,
      medio: "banco_cc",
    });
    expect(r.filas[4].sugerencia).toMatchObject({
      tipo: "pago_proveedor",
      contraparte: "Innoa S.R.L.",
      cuitContraparte: "30744444445",
      importe: 31567.04,
    });
  });

  it("lista lo registrado por banco que no aparece en el resumen", () => {
    expect(r.pendientesEnBanco.map((m) => m.importe)).toEqual([45000]);
  });

  it("sugiere CUIT y nombre a partir de la descripción del banco", () => {
    expect(
      sugerenciaDesdeBanco(
        banco("2026-10-22", 15000, "TRANSF PEREZ JUAN 20111111112 VAR VARIOS"),
      ),
    ).toEqual({ cuit: "20111111112", nombre: "PEREZ JUAN" });
    expect(
      sugerenciaDesdeBanco(
        banco("2026-10-22", 1, "ING TRANSF:LUCIANO AGUSTIN CRUZ-20427064957"),
      ),
    ).toEqual({ cuit: "20427064957", nombre: "LUCIANO AGUSTIN CRUZ" });
    expect(
      sugerenciaDesdeBanco(
        banco("2026-10-22", 1, "TEF DATANET PR DISTRI ORAN SRL 30712345678"),
      ),
    ).toEqual({ cuit: "30712345678", nombre: "DISTRI ORAN SRL" });
  });
});

describe("Sugerencias por nombre", () => {
  it("reconoce al cliente por nombre cuando el banco corta el CUIT", () => {
    const resumen: ResumenBancario = {
      banco: "Banco Macro",
      titular: "",
      cuit: "",
      desde: "2026-10-01",
      hasta: "2026-10-31",
      controles: [],
      cuentas: [
        {
          banco: "Banco Macro",
          tipo: "CC",
          numero: "3-152-1",
          moneda: "ARS",
          saldoInicial: 0,
          saldoFinal: 0,
          impuestoDebitosCreditos: 0,
          movimientos: [
            {
              fecha: "2026-10-23",
              descripcion: "TEF DATANET PR OTRO CLIENTE SRL 30722222",
              referencia: "9",
              importe: 5000,
              saldo: null,
              pagina: 1,
            },
          ],
        },
      ],
    };
    const r = conciliarResumen(resumen, [], {
      clientes: new Map([["30722222222", "Otro Cliente S.R.L."]]),
      proveedores: new Map(),
    });
    expect(r.filas[0].estado).toBe("sugerido");
    expect(r.filas[0].sugerencia).toMatchObject({
      tipo: "cobro",
      cuitContraparte: "30722222222",
      contraparte: "Otro Cliente S.R.L.",
    });
  });
});
