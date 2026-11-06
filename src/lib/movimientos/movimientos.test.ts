import { describe, expect, it } from "vitest";
import type { MovimientoBancario } from "@/lib/bancos/tipos";
import { generarAsiento, totalesAsiento, validarMovimiento } from "./asiento";
import { conciliar } from "./conciliar";
import type { Movimiento } from "./tipos";

const HOY = new Date("2026-11-06T12:00:00Z");
let n = 0;
function mov(datos: Partial<Movimiento>): Movimiento {
  return {
    id: String(++n),
    tipo: "pago_proveedor",
    fecha: "2026-10-15",
    importe: 1000,
    medio: "banco_cc",
    contraparte: "Proveedor Uno SA",
    cuitContraparte: "",
    nota: "",
    estado: "enviado",
    ...datos,
  };
}
const resumen = (m: Movimiento) =>
  generarAsiento(m).map((l) => [l.cuenta, l.debe, l.haber]);

describe("Asientos de los movimientos del cliente", () => {
  it("pago a proveedor por banco", () => {
    expect(resumen(mov({ importe: 250000 }))).toEqual([
      ["2.1.01.001", 250000, 0],
      ["1.1.01.006", 0, 250000],
    ]);
  });

  it("cobro con retenciones: cancela la factura por el total", () => {
    const m = mov({
      tipo: "cobro",
      importe: 950000,
      contraparte: "Cliente Grande SAIC",
      retenciones: [
        { impuesto: "IVA", importe: 30000 },
        { impuesto: "IIBB", jurisdiccion: "Salta", importe: 20000 },
        { impuesto: "Ganancias", importe: 0 },
      ],
    });
    expect(resumen(m)).toEqual([
      ["1.1.01.006", 950000, 0],
      ["1.1.04.007", 30000, 0],
      ["1.1.04.014", 20000, 0],
      ["1.1.03.001", 0, 1000000],
    ]);
    expect(totalesAsiento(generarAsiento(m)).balancea).toBe(true);
  });

  it("sueldo, adelanto y aguinaldo van a sus cuentas", () => {
    expect(
      resumen(
        mov({ tipo: "sueldo", cuenta: "2.1.03.001", medio: "efectivo" }),
      )[0][0],
    ).toBe("2.1.03.001");
    expect(resumen(mov({ tipo: "sueldo", cuenta: "1.1.04.002" }))[0][0]).toBe(
      "1.1.04.002",
    );
  });

  it("honorarios y gastos: con factura van a Proveedores, sin factura al gasto", () => {
    expect(resumen(mov({ tipo: "honorarios" }))[0][0]).toBe("2.1.01.001");
    expect(resumen(mov({ tipo: "honorarios", conFactura: false }))[0][0]).toBe(
      "5.3.01.005",
    );
    expect(
      resumen(
        mov({ tipo: "gasto", cuenta: "5.3.01.009", conFactura: true }),
      )[0][0],
    ).toBe("2.1.01.001");
    expect(
      resumen(
        mov({ tipo: "gasto", cuenta: "5.3.01.009", conFactura: false }),
      )[0][0],
    ).toBe("5.3.01.009");
  });

  it("pago con cheque o tarjeta de crédito genera la deuda, no sale del banco", () => {
    expect(resumen(mov({ medio: "cheque" }))[1][0]).toBe("2.1.01.003");
    expect(
      resumen(
        mov({ medio: "tarjeta", tipo: "gasto", cuenta: "5.3.01.018" }),
      )[1][0],
    ).toBe("2.1.01.004");
  });

  it("aporte de un socio entra; retiro sale", () => {
    expect(resumen(mov({ tipo: "socios", cuenta: "3.1.01.003" }))).toEqual([
      ["1.1.01.006", 1000, 0],
      ["3.1.01.003", 0, 1000],
    ]);
    expect(resumen(mov({ tipo: "socios", cuenta: "1.1.04.024" }))[0]).toEqual([
      "1.1.04.024",
      1000,
      0,
    ]);
  });

  it("pago de impuestos", () => {
    expect(
      resumen(
        mov({ tipo: "impuesto", cuenta: "2.1.03.005", contraparte: "" }),
      )[0][0],
    ).toBe("2.1.03.005");
  });
});

describe("Validación", () => {
  it("pide lo que falta", () => {
    expect(
      validarMovimiento(mov({ importe: 0, contraparte: "" }), HOY),
    ).toEqual([
      "El importe tiene que ser mayor a cero.",
      "Falta a quién se le pagó.",
    ]);
    expect(
      validarMovimiento(mov({ tipo: "gasto", contraparte: "" }), HOY),
    ).toEqual(["Elegí el concepto."]);
    expect(validarMovimiento(mov({ fecha: "2026-12-01" }), HOY)).toEqual([
      "La fecha es posterior a hoy.",
    ]);
    expect(
      validarMovimiento(mov({ cuitContraparte: "30711111112" }), HOY),
    ).toEqual(["El CUIT/CUIL no es válido."]);
    expect(
      validarMovimiento(
        mov({
          tipo: "cobro",
          retenciones: [{ impuesto: "IIBB", importe: 10 }],
        }),
        HOY,
      ),
    ).toEqual(["Indicá la provincia de la retención de IIBB."]);
    expect(validarMovimiento(mov({}), HOY)).toEqual([]);
  });
});

describe("Cruce con el resumen bancario", () => {
  const banco = (
    fecha: string,
    importe: number,
    descripcion = "TRANSF",
  ): MovimientoBancario => ({
    fecha,
    descripcion,
    referencia: "",
    importe,
    saldo: null,
    pagina: 1,
  });

  it("une por importe, sentido y fecha cercana, sin usar dos veces el mismo", () => {
    const pago = mov({ fecha: "2026-10-15", importe: 87177.02 });
    const cobro = mov({ tipo: "cobro", fecha: "2026-10-16", importe: 5000 });
    const enEfectivo = mov({
      fecha: "2026-10-15",
      importe: 1700,
      medio: "efectivo",
    });
    const b = [
      banco("2026-10-14", -87177.02),
      banco("2026-10-17", -87177.02), // segundo débito igual: queda sin cruzar
      banco("2026-10-16", 5000),
      banco("2026-10-16", -5000), // mismo importe pero sale: no es el cobro
      banco("2026-10-15", -1700), // el cliente lo cargó en efectivo
      banco("2026-10-30", 5000), // demasiado lejos
    ];
    const r = conciliar(b, [pago, cobro, enEfectivo]);
    expect(r.size).toBe(2);
    expect(r.get(b[0])).toBe(pago);
    expect(r.get(b[2])).toBe(cobro);
  });

  it("no usa los observados", () => {
    expect(
      conciliar([banco("2026-10-15", -1000)], [mov({ estado: "observado" })])
        .size,
    ).toBe(0);
  });
});
