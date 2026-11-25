import { describe, expect, it } from "vitest";
import {
  asientoGanancias,
  asientoIibb,
  encadenarIibb,
} from "@/lib/impuestos/asientos";
import { encadenarIva } from "@/lib/iva/liquidacion";
import { importe, leerDdjj } from "./leer-ddjj";

// Datos inventados, con la misma estructura que los PDF de ARCA y Rentas.
const IVA_A_FAVOR = `CUIT Denominación
30-12345678-9 EMPRESA DE PRUEBA S. A. S.
Período Secuencia
202610 Original
IMPUESTO AL VALOR AGREGADO
Fecha de Presentación Nro. de Transacción
20/11/2026 1111111111
Código de identificación de presentación (MD5)
F.2051 V. 100 abc
Determinación del impuesto
Total del débito fiscal del período $ 1.000.000,00
Total del crédito fiscal del período $ 3.000.000,00
Saldo técnico a favor del contribuyente del período anterior $ 500.000,00
Saldo técnico a favor del contribuyente $ 2.500.000,00
Determinación de la posición mensual
Saldo técnico a favor de ARCA $ 0,00
Saldo técnico a favor del contribuyente $ 2.500.000,00
Saldo a favor de libre disponibilidad del período anterior neto de usos $ 0,00
Total de retenciones, percepciones y pagos a cuenta neto de restituciones $ 100.000,50
Saldo de libre disponibilidad a favor del contribuyente del período $ 100.000,50`;

const IVA_A_PAGAR = `CUIT Denominación
30-12345678-9 EMPRESA DE PRUEBA S. A. S.
Período Secuencia
202611 Original
IMPUESTO AL VALOR AGREGADO
F.2051 V. 100 abc
Total del débito fiscal del período $ 4.000.000,00
Total del crédito fiscal del período $ 1.000.000,00
Saldo técnico a favor del contribuyente del período anterior $ 2.500.000,00
Saldo técnico a favor de ARCA $ 500.000,00
Determinación de la posición mensual
Saldo técnico a favor de ARCA $ 500.000,00
Saldo a favor de libre disponibilidad del período anterior neto de usos $ 100.000,50
Total de retenciones, percepciones y pagos a cuenta neto de restituciones $ 20.000,00
Saldo de impuesto a favor de ARCA $ 379.999,50`;

const LIBRO = `CUIT: 30-12345678-9
Apellido y Nombre: EMPRESA DE PRUEBA S. A. S.
Fecha de Presentación: 16/11/2026 Hora: 11:16:44
LIBRO DE IVA DIGITAL Nro. de Transacción: 1
F. 2083 Versión: 300 Periodo: 202610 Secuencia: Original
Operaciones de Venta $ 1000000.00 $ 50.00 $ 210000.00
Notas de Crédito de Venta $ 100000.00 $ 0.00 $ 21000.00
Operaciones de Compra $ 500000.00 $ 0.00 $ 105000.00
Notas de Crédito de Compra $ 0.00 $ 0.00 $ 0.00`;

const JUJUY = `DIRECCION PROVINCIAL DE RENTAS
PROVINCIA DE JUJUY
Del Titular Declaración Jurada Mensual - Form. F-232
Apellido y Nombre o Razón Social
Periodo 2026 - 09 / 0
Vencimiento 19/10/2026
EMPRESA DE PRUEBA S.A.S.
Secuencia ORIGINAL
CUIT 30-12345678/9 Sistema Control SIR
1 - I.NoGrav. 0,00 2 - B. Exenta $ 0,00 3 - B. Sujeta a Imp. $ 1.000.000,00 4 - I. Determinado $ 30.000,00
Percepciones $ 1.000,00
Retenciones $ 2.000,00
Recaudación Bancaria $ 3.000,00
Saldo Anterior $ 4.000,00
7 - Intereses $ 0,00
Pago a Cuenta $ 500,00
Crédito Fiscal $ 0,00`;

const GANANCIAS = `Mes de Cierre Período C.U.I.T.
12 2025 30-12345678-9
IMPUESTO A LAS Carácter Ejercicio Fiscal
GANANCIAS Apellido y Nombre o Razón Social Versión Establecimiento
F. 713 EMPRESA DE PRUEBA S.A.S. 2500008 0
Result.del Ejerc.(contable) 1.000.000,00 0,00 Quebrantos computables 0,00 0,00
Resultado impositivo 1.200.000,00 0,00 Resultado atrib.a los socios 0,00 0,00
Alícuota % 25,00 Alícuota para Juegos de Azar 41,50 %
Total Impuesto Liberado (F.A y F.E.) 0,00 Total Impuesto Determinado 300.000,00
Imp. determinado Fuente Extranjera 0,00 Saldo a Cancelar 300.000,00
Subtotal Fuente Extranjera 0,00 Saldo a Ingresar 200.000,00
Saldo a favor per.ant.antic.cancel.en Retenciones y/o Percepciones 30.000,00
Pagos a Cta.que no generan saldo a favor 0,00 ingresos extraordinarios 0,00
Saldo previo al cómputo Credeb 300.000,00 Saldo a favor periodo anterior 10.000,00
Saldo.x anticipos cancelados Credeb 0,00 Saldo a favor 0,00 200.000,00`;

const CM03 = `Impuesto sobre los Ingresos Brutos
Convenio Multilateral
Presentación y Pago
CM03 202390
CUIT: 30-12345678-9 Contribuyente: EMPRESA DE PRUEBA S. A. S. Sede: 917
Anticipo: 202512 Secuencia: Original Tipo: Resto
Datos Presentación AFIP: DDJJ presentada el 13/01/2026 - 11:50:10 ante ARCA, Nº de Transacción 1
Jurisdicción Valores Restan Valores Suman A favor Fisco A Pagar
903 CATAMARCA $50.000,00 $0,00 $0,00 $0,00 $50.000,00 $50.000,00
904 CORDOBA $0,00 $0,00 $0,00 $0,00 $0,00 $0,00
917 SALTA $300.000,00 $100.000,00 $1.000,00 $0,00 $201.000,00 $201.000,00
924 TUCUMAN $60.000,00 $400.000,00 $0,00 $340.000,00 $0,00 $0,00
Totales $410.000,00 $500.000,00 $1.000,00 $340.000,00 $251.000,00 $251.000,00
Determinación del anticipo - Tucumán
903 CATAMARCA $50.000,00 $0,00 $0,00 $0,00 $50.000,00 $50.000,00`;

const SALTA = `F903 - ONLINE
ACTIVIDADES ECONÓMICAS
APELLIDO Y NOMBRE O RAZÓN SOCIAL Original X Rectificativa
PRUEBA PERSONA FISICA
C.U.I.T. Nº CONV. MULTILATERAL PERIODO
27-12345678-9 NO 7/2026
TOTAL IMPUESTOS POR APLICACION ALICUOTA O MINIMO (EL MAYOR) 400000.00
MENOS RETENCIONES SEGUN ANEXO 10000.00
MENOS PERCEPCIONES SEGUN ANEXO
20000.00
MENOS SALDO SEGUN DD.JJ. MES 7 AÑO 2026 100000.00
A FAVOR CONTRIBUYENTE 0.00 A FAVOR D.G.R. 270000.00
SALDO A FAVOR DGR 270000.00
IMPORTE A DEPOSITAR 275000.00
en www.dgrsalta.gov.ar`;

const F2711 = `Período Nombre y apellido / Razón Fecha de Presentación
2025 social 27/07/2026
PRUEBA PERSONA
HUMANA
Código de identificación de
Establecimiento CUIT
DECLARACIÓN JURADA 0 27-12345678-9
SIMPLIFICADA
GANANCIAS PERSONAS HUMANAS
F.2711 V. 100
1era $ 0,00 $ 0,00 $ 0,00 $ 0,00 $ 0,00 $ 0,00
2da acciones - $ 0,00 - $ 0,00 - $ 0,00
3ra $ 5.000.000,00 $ 0,00 $ 1.000.000,00 $ 0,00 $ 4.000.000,00 $ 0,00
4ta $ 0,00 $ 0,00 $ 0,00 $ 0,00 $ -100.000,00 $ 0,00
Impuesto determinado total $ 800.000,00
Pagos a cuenta computables en el impuesto a las ganancias $ 300.000,00`;

const lineas = (t: string) => t.split("\n");
const cuadra = (l: { debe: number; haber: number }[]) =>
  Math.round(l.reduce((s, x) => s + x.debe - x.haber, 0) * 100) / 100;

describe("lectura de DDJJ", () => {
  it("importes en los dos formatos", () => {
    expect(importe("$ 2.221.868,02")).toBe(2221868.02);
    expect(importe("-$ 18.686,59")).toBe(-18686.59);
    expect(importe("$ 10442717.37")).toBe(10442717.37);
  });

  it("IVA con saldo a favor y con saldo a pagar", () => {
    const a = leerDdjj(lineas(IVA_A_FAVOR));
    expect(a).toMatchObject({
      tipo: "iva",
      cuit: "30123456789",
      periodo: "2026-10",
      ddjj: {
        saldoTecnicoAFavor: 2500000,
        saldoLibreDisponibilidad: 100000.5,
        saldoAPagar: 0,
        fechaPresentacion: "2026-11-20",
      },
    });
    const b = leerDdjj(lineas(IVA_A_PAGAR));
    expect(b).toMatchObject({
      periodo: "2026-11",
      ddjj: {
        saldoTecnicoAFavor: 0,
        saldoAPagar: 379999.5,
        saldoLibreDisponibilidadAnterior: 100000.5,
      },
    });
    // En la cadena, lo presentado manda sobre lo calculado.
    if (a?.tipo !== "iva" || b?.tipo !== "iva") throw new Error();
    const c = encadenarIva(
      ["2026-10", "2026-11"],
      () => ({ ventas: [], compras: [], desdeArchivos: null }),
      {
        "2026-10": { manual: {}, ddjj: a.ddjj },
        "2026-11": { manual: {}, ddjj: b.ddjj },
      },
    );
    expect(c.get("2026-11")?.liquidacion.saldoAPagar).toBe(379999.5);
    expect(c.get("2026-11")?.presentada).toBe(true);
  });

  it("Libro IVA Digital neto de notas de crédito", () => {
    expect(leerDdjj(lineas(LIBRO))).toMatchObject({
      tipo: "libro-iva",
      periodo: "2026-10",
      libro: {
        ventasNeto: 900000,
        debitoFiscal: 189000,
        comprasNeto: 500000,
        creditoFiscal: 105000,
      },
    });
  });

  it("IIBB Jujuy F-232 y su asiento", () => {
    const r = leerDdjj(lineas(JUJUY));
    expect(r).toMatchObject({
      tipo: "iibb",
      periodo: "2026-09",
      cuit: "30123456789",
      nombre: "EMPRESA DE PRUEBA S.A.S.",
      datos: {
        determinado: 30000,
        percepciones: 1000,
        retenciones: 2000,
        sircreb: 3000,
        saldoAFavorAnterior: 4000,
        otrosPagos: 500,
      },
    });
    if (r?.tipo !== "iibb") throw new Error();
    const p = encadenarIibb({ "2026-09": r.datos }).get("2026-09")!;
    expect(p.aPagar).toBe(19500);
    expect(cuadra(asientoIibb(p)!.lineas)).toBe(0);
  });

  it("Ganancias sociedades F.713 y su asiento", () => {
    const r = leerDdjj(lineas(GANANCIAS));
    expect(r).toMatchObject({
      tipo: "ganancias-pj",
      ddjj: {
        cierre: "2025-12-31",
        impuestoDeterminado: 300000,
        saldoAIngresar: 200000,
        retencionesYPercepciones: 30000,
        saldoAFavorAnterior: 10000,
        anticipos: 60000,
      },
    });
    if (r?.tipo !== "ganancias-pj") throw new Error();
    expect(cuadra(asientoGanancias(r.ddjj)!.lineas)).toBe(0);
  });

  it("Convenio Multilateral CM03: por jurisdicción y asiento", () => {
    const r = leerDdjj(lineas(CM03));
    expect(r).toMatchObject({
      tipo: "iibb",
      periodo: "2025-12",
      cuit: "30123456789",
      jurisdiccion: "Convenio Multilateral",
      datos: {
        determinado: 411000,
        deduccionesDdjj: 500000,
        aPagarDdjj: 251000,
        saldoAFavorDdjj: 340000,
        fechaPresentacion: "2026-01-13",
      },
    });
    if (r?.tipo !== "iibb") throw new Error();
    expect(r.datos.jurisdicciones?.map((j) => j.nombre)).toEqual([
      "CATAMARCA",
      "SALTA",
      "TUCUMAN",
    ]);
    // Con un saldo a favor anterior de 300.000 y 50.000 de percepciones en los archivos.
    const c = encadenarIibb({
      "2025-11": {
        determinado: 0,
        retenciones: 300000,
        percepciones: 0,
        sircreb: 0,
        saldoAFavorAnterior: 0,
      },
      "2025-12": { ...r.datos, percepciones: 50000 },
    });
    const p = c.get("2025-12")!;
    expect(p.saldoAFavorAnterior).toBe(300000);
    expect(p.deducciones).toMatchObject({
      percepciones: 50000,
      retenciones: 150000,
    });
    expect(p).toMatchObject({ aPagar: 251000, saldoAFavor: 340000 });
    const a = asientoIibb(p)!;
    expect(cuadra(a.lineas)).toBe(0);
    expect(a.lineas.find((l) => l.cuenta === "5.2.01.006")?.debe).toBe(411000);
  });

  it("Salta F903 con accesorios", () => {
    const r = leerDdjj(lineas(SALTA));
    expect(r).toMatchObject({
      tipo: "iibb",
      periodo: "2026-07",
      cuit: "27123456789",
      nombre: "PRUEBA PERSONA FISICA",
      jurisdiccion: "Salta",
      datos: {
        determinado: 405000,
        retenciones: 10000,
        percepciones: 20000,
        saldoAFavorAnterior: 100000,
        aPagarDdjj: 275000,
        saldoAFavorDdjj: 0,
      },
    });
    if (r?.tipo !== "iibb") throw new Error();
    const p = encadenarIibb({ "2026-07": r.datos }).get("2026-07")!;
    expect(cuadra(asientoIibb(p)!.lineas)).toBe(0);
  });

  it("Ganancias personas humanas F.2711", () => {
    const r = leerDdjj(lineas(F2711));
    expect(r).toMatchObject({
      tipo: "ganancias-pj",
      cuit: "27123456789",
      nombre: "PRUEBA PERSONA HUMANA",
      ddjj: {
        cierre: "2025-12-31",
        formulario: "F.2711",
        resultadoImpositivo: 3900000,
        impuestoDeterminado: 800000,
        anticipos: 300000,
        saldoAIngresar: 500000,
        fechaPresentacion: "2026-07-27",
      },
    });
    if (r?.tipo !== "ganancias-pj") throw new Error();
    expect(
      r.ddjj.categorias?.find((c) => c.categoria === "3ra")?.resultado,
    ).toBe(4000000);
    const a = asientoGanancias(r.ddjj)!;
    expect(cuadra(a.lineas)).toBe(0);
    expect(a.lineas[0].cuenta).toBe("1.1.04.024");
  });

  it("un PDF que no es DDJJ", () => {
    expect(leerDdjj(["Resumen de cuenta", "Saldo $ 100,00"])).toBeNull();
  });
});
