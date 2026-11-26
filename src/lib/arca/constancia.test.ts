import { describe, expect, it } from "vitest";
import { leerConstancia } from "./constancia";

// Datos inventados, con la misma estructura que las constancias reales.
const INSCRIPCION = `AGENCIA DE RECAUDACION Y CONTROL ADUANERO
CONSTANCIA DE INSCRIPCION
PEREZ JUAN CARLOS CUIT: 20-12345678-6
IMPUESTOS/REGIMENES NACIONALES REGISTRADOS Y FECHA DE ALTA
GANANCIAS PERSONAS FISICAS - ACTIVO 04-2018
IVA 04-2018
IMPTO.S/BIENES PERSONALES 04-2018
REG. TRAB. AUTONOMO Categoria T2 Cat I Ingresos hasta $20.000 02-2019
****************************************************
Contribuyente no amparado en los beneficios promocionales INDUSTRIALES.
639-GANANCIAS SIMPLIFICADA LEY 27.799 (Periodo: 2025, Fecha de adhesión: 11-06-2026)
ACTIVIDADES NACIONALES REGISTRADAS Y FECHA DE ALTA
Actividad principal: 562010 (F-883) SERVICIOS DE PREPARACIÓN DE COMIDAS PARA EMPRESAS Y EVENTOS Mes de inicio: 11/2013
Secundaria(s): 107500 (F-883) ELABORACIÓN DE COMIDAS PREPARADAS PARA REVENTA Mes de inicio: 02/2021
702092 (F-883) SERVICIOS DE ASESORAMIENTO, DIRECCIÓN Y GESTIÓN EMPRESARIAL REALIZADOS POR INTEGRANTES DE CUERPOS DE DIRECCIÓN EN SOCIEDADES Mes de inicio: 01/2026
EXCEPTO LAS ANÓNIMAS
Mes de cierre ejercicio comercial: 12
DOMICILIO FISCAL - ARCA
BELGRANO 123 - NO DETERMINADO : CENTRO
SAN SALVADOR DE JUJUY
4600-JUJUY
Vigencia de la presente constancia: 26-11-2026 a 26-12-2026 Hora 12:41:38 Verificador 1`;

const MONOTRIBUTO = `CONSTANCIA DE INSCRIPCION
GOMEZ ANA CUIT: 27-23456789-1
IMPUESTOS/REGIMENES NACIONALES REGISTRADOS Y FECHA DE ALTA
MONOTRIBUTO Categoria: B Actividad: LOCACIONES DE SERVICIOS 03-2024
****************************************************
ACTIVIDADES NACIONALES REGISTRADAS Y FECHA DE ALTA
Actividad principal: 960990 (F-883) SERVICIOS PERSONALES N.C.P. Mes de inicio: 03/2024
DOMICILIO FISCAL - ARCA
SAN MARTIN 456
SALTA
4400-SALTA`;

const CUIL = `Constancia de CUIL/CUIT
Emitida el: 03/09/2025 a las 10:32 hs
Fecha de alta: 09/03/2007
Titular
PRUEBA MARIA
Documento
DU 12345678
CUIL/CUIT
27-12345678-0`;

const l = (t: string) => t.split("\n");

describe("constancia de inscripción de ARCA", () => {
  it("responsable inscripto: impuestos, actividades, cierre y domicilio", () => {
    const c = leerConstancia(l(INSCRIPCION))!;
    expect(c).toMatchObject({
      tipo: "inscripcion",
      cuit: "20123456786",
      nombre: "PEREZ JUAN CARLOS",
      condicionIva: "Responsable inscripto",
      mesCierre: 12,
      inicioActividades: "2013-11-01",
      domicilio: {
        calle: "Belgrano 123 · Centro",
        localidad: "San Salvador de Jujuy",
        provincia: "Jujuy",
        codigoPostal: "4600",
      },
    });
    expect(c.impuestosSistema.sort()).toEqual([
      "bienesPersonales",
      "gananciasPH",
      "iva",
    ]);
    expect(c.datos.impuestos.map((i) => i.alta)).toEqual([
      "2018-04",
      "2018-04",
      "2018-04",
      "2019-02",
    ]);
    expect(
      c.datos.actividades.map((a) => [a.codigo, a.inicio, a.principal]),
    ).toEqual([
      ["562010", "2013-11", true],
      ["107500", "2021-02", false],
      ["702092", "2026-01", false],
    ]);
    expect(c.datos.actividades[2].descripcion).toMatch(/Excepto las Anónimas$/);
    expect(c.actividad).toBe(
      "Servicios de Preparación de Comidas para Empresas y Eventos (562010)",
    );
    expect(c.datos.otros[0]).toMatch(/^639-GANANCIAS SIMPLIFICADA/);
    expect(c.datos.fechaConstancia).toBe("2026-11-26");
  });

  it("monotributo con categoría", () => {
    const c = leerConstancia(l(MONOTRIBUTO))!;
    expect(c).toMatchObject({
      condicionIva: "Monotributo",
      categoriaMonotributo: "B",
      impuestosSistema: ["monotributo"],
      domicilio: {
        calle: "San Martin 456",
        localidad: "Salta",
        codigoPostal: "4400",
      },
    });
  });

  it("constancia de CUIL", () => {
    expect(leerConstancia(l(CUIL))).toMatchObject({
      tipo: "cuil",
      cuit: "27123456780",
      nombre: "PRUEBA MARIA",
      datos: { dni: "12345678", fechaConstancia: "2025-09-03" },
    });
  });

  it("otro PDF", () => {
    expect(leerConstancia(["Resumen de cuenta"])).toBeNull();
  });
});
