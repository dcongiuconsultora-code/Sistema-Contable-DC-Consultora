import type { Cell, Worksheet } from "exceljs";
import type { Axi } from "./axi";

const NUMERO = "#,##0.00;[Red]-#,##0.00";
const MESES = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];

function nombreMes(mes: string) {
  const [a, m] = mes.split("-");
  return `${MESES[Number(m) - 1]}-${a.slice(2)}`;
}

function f(ws: Worksheet, celda: string, formula: string, formato = NUMERO) {
  const c = ws.getCell(celda);
  c.value = { formula } as Cell["value"];
  c.numFmt = formato;
}

function titulo(
  ws: Worksheet,
  texto: string,
  empresa: string,
  periodo: string,
) {
  ws.getCell("A1").value = texto;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.getCell("A2").value = `${empresa} · Período fiscal ${periodo}`;
  ws.getCell("A2").font = { color: { argb: "FF57534E" } };
}

function encabezado(ws: Worksheet, fila: number) {
  ws.getRow(fila).font = { bold: true };
  ws.getRow(fila).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFF4E8E5" },
  };
}

/** Papel de trabajo del ajuste por inflación impositivo, con fórmulas para poder revisarlo. */
export async function armarExcelAxi(
  axi: Axi,
  empresa: string,
): Promise<ArrayBuffer> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const periodo = axi.indiceCierre.mes.slice(0, 4);

  // IPC ---------------------------------------------------------------------------------------
  const ipc = wb.addWorksheet("IPC");
  ipc.columns = [{ width: 16 }, { width: 18 }];
  titulo(ipc, "IPC Nivel general (INDEC, serie FACPCE)", empresa, periodo);
  ipc.getCell("A4").value = "Período";
  ipc.getCell("B4").value = "IPC";
  encabezado(ipc, 4);
  const filasIpc = [axi.indiceInicio.mes, ...axi.meses];
  const filaIpc = new Map<string, number>();
  filasIpc.forEach((mes, i) => {
    const fila = 5 + i;
    filaIpc.set(mes, fila);
    ipc.getCell(`A${fila}`).value = nombreMes(mes);
    const valor =
      mes === axi.indiceInicio.mes
        ? axi.indiceInicio.valor
        : axi.dinamico.indices[i - 1];
    ipc.getCell(`B${fila}`).value = valor;
    ipc.getCell(`B${fila}`).numFmt = "#,##0.0000";
  });
  const filaCierreIpc = 5 + filasIpc.length - 1;
  // Si el índice del cierre todavía no salió, se usa el último publicado (y se avisa).
  ipc.getCell(`B${filaCierreIpc}`).value = axi.indiceCierre.valor;
  const filaCoef = filaCierreIpc + 2;
  ipc.getCell(`A${filaCoef}`).value = "Coeficiente de actualización";
  ipc.getCell(`A${filaCoef}`).font = { bold: true };
  f(ipc, `B${filaCoef}`, `ROUND(B${filaCierreIpc}/B5-1,4)`, "0.0000");
  if (axi.indiceCierre.estimado)
    ipc.getCell(`A${filaCoef + 2}`).value =
      `Atención: falta el índice del cierre; se usó el de ${nombreMes(axi.indiceCierre.mes)}.`;

  // Estático -----------------------------------------------------------------------------------
  const est = wb.addWorksheet("Ajuste Estático");
  est.columns = [{ width: 58 }, { width: 20 }, { width: 13 }];
  titulo(est, "Ajuste por inflación estático", empresa, periodo);
  let fila = 4;
  const bloques: Record<"activo" | "pasivo", [number, number]> = {
    activo: [0, 0],
    pasivo: [0, 0],
  };
  for (const lado of ["activo", "pasivo"] as const) {
    est.getCell(`A${fila}`).value =
      lado === "activo"
        ? "ACTIVO IMPOSITIVO AL INICIO"
        : "PASIVO IMPOSITIVO AL INICIO";
    est.getCell(`B${fila}`).value = "Importe";
    est.getCell(`C${fila}`).value = "Computable";
    encabezado(est, fila);
    fila++;
    const desde = fila;
    let grupo = "";
    for (const r of axi.estatico.renglones.filter((x) => x.lado === lado)) {
      if (r.grupo !== grupo) {
        grupo = r.grupo;
        est.getCell(`A${fila}`).value = grupo;
        est.getCell(`A${fila}`).font = { bold: true, italic: true };
        fila++;
      }
      est.getCell(`A${fila}`).value = `   ${r.nombre}`;
      est.getCell(`B${fila}`).value = r.importe;
      est.getCell(`B${fila}`).numFmt = NUMERO;
      est.getCell(`C${fila}`).value = r.computable ? "Sí" : "No";
      est.getCell(`C${fila}`).dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"Sí,No"'],
      };
      fila++;
    }
    bloques[lado] = [desde, fila - 1];
    fila++;
  }
  const [a0, a1] = bloques.activo;
  const [p0, p1] = bloques.pasivo;
  const totales: [string, string][] = [
    ["Total activo impositivo", `SUM(B${a0}:B${a1})`],
    ["Total pasivo impositivo", `SUM(B${p0}:B${p1})`],
    [
      "Activo impositivo computable",
      `SUMIF(C${a0}:C${a1},"<>No",B${a0}:B${a1})`,
    ],
    [
      "Pasivo impositivo computable",
      `SUMIF(C${p0}:C${p1},"<>No",B${p0}:B${p1})`,
    ],
  ];
  const filaTotal: number[] = [];
  for (const [texto, formula] of totales) {
    est.getCell(`A${fila}`).value = texto;
    est.getCell(`A${fila}`).font = { bold: true };
    f(est, `B${fila}`, formula);
    filaTotal.push(fila);
    fila++;
  }
  fila++;
  const filaCapital = fila;
  est.getCell(`A${fila}`).value =
    "Capital expuesto a la inflación (activo − pasivo computable)";
  f(est, `B${fila}`, `B${filaTotal[2]}-B${filaTotal[3]}`);
  fila++;
  est.getCell(`A${fila}`).value = "Coeficiente de actualización";
  f(est, `B${fila}`, `IPC!B${filaCoef}`, "0.0000");
  const filaCoefEst = fila;
  fila++;
  const filaAjusteEst = fila;
  est.getCell(`A${fila}`).value = "AJUSTE ESTÁTICO (ganancia + / pérdida −)";
  est.getCell(`A${fila}`).font = { bold: true };
  f(est, `B${fila}`, `-ROUND(B${filaCapital}*B${filaCoefEst},2)`);
  est.getCell(`B${fila}`).font = { bold: true };

  // Dinámico -----------------------------------------------------------------------------------
  const din = wb.addWorksheet("Ajuste Dinámico");
  const n = axi.meses.length;
  const col = (i: number) => String.fromCharCode(66 + i); // B, C, …
  const colTotal = col(n);
  din.columns = [
    { width: 58 },
    ...axi.meses.map(() => ({ width: 14 })),
    { width: 16 },
  ];
  titulo(din, "Ajuste por inflación dinámico", empresa, periodo);
  din.getCell("A4").value = "Concepto";
  axi.meses.forEach((m, i) => {
    din.getCell(`${col(i)}4`).value = nombreMes(m);
  });
  din.getCell(`${colTotal}4`).value = "Total";
  encabezado(din, 4);
  fila = 5;
  const filasSigno: Record<1 | -1, [number, number]> = {
    1: [0, 0],
    [-1]: [0, 0],
  };
  for (const signo of [1, -1] as const) {
    const desde = fila;
    for (const r of axi.dinamico.renglones.filter((x) => x.signo === signo)) {
      din.getCell(`A${fila}`).value = r.nombre;
      r.meses.forEach((v, i) => {
        din.getCell(`${col(i)}${fila}`).value = v || null;
        din.getCell(`${col(i)}${fila}`).numFmt = NUMERO;
      });
      f(din, `${colTotal}${fila}`, `SUM(B${fila}:${col(n - 1)}${fila})`);
      fila++;
    }
    filasSigno[signo] = [desde, fila - 1];
    din.getCell(`A${fila}`).value =
      signo === 1 ? "AJUSTE DINÁMICO POSITIVO" : "AJUSTE DINÁMICO NEGATIVO";
    din.getCell(`A${fila}`).font = { bold: true };
    for (let i = 0; i <= n; i++)
      f(din, `${col(i)}${fila}`, `SUM(${col(i)}${desde}:${col(i)}${fila - 1})`);
    fila += 2;
  }
  const filaPos = filasSigno[1][1] + 1;
  const filaNeg = filasSigno[-1][1] + 1;
  const filaNeto = fila;
  din.getCell(`A${fila}`).value = "Importe neto de movimientos";
  for (let i = 0; i <= n; i++)
    f(din, `${col(i)}${fila}`, `${col(i)}${filaPos}-${col(i)}${filaNeg}`);
  fila++;
  const filaIndMes = fila;
  din.getCell(`A${fila}`).value = "IPC del mes del movimiento";
  axi.meses.forEach((m, i) =>
    f(din, `${col(i)}${fila}`, `IPC!B${filaIpc.get(m)}`, "#,##0.0000"),
  );
  fila++;
  const filaIndCierre = fila;
  din.getCell(`A${fila}`).value = "IPC del cierre";
  axi.meses.forEach((_, i) =>
    f(din, `${col(i)}${fila}`, `IPC!B${filaCierreIpc}`, "#,##0.0000"),
  );
  fila++;
  const filaVar = fila;
  din.getCell(`A${fila}`).value = "Variación del IPC";
  axi.meses.forEach((_, i) =>
    f(
      din,
      `${col(i)}${fila}`,
      `ROUND(${col(i)}${filaIndCierre}/${col(i)}${filaIndMes}-1,4)`,
      "0.0000",
    ),
  );
  fila++;
  const filaAjusteDin = fila;
  din.getCell(`A${fila}`).value = "AJUSTE DINÁMICO (ganancia + / pérdida −)";
  din.getCell(`A${fila}`).font = { bold: true };
  axi.meses.forEach((_, i) =>
    f(
      din,
      `${col(i)}${fila}`,
      `ROUND(${col(i)}${filaVar}*${col(i)}${filaNeto},2)`,
    ),
  );
  f(din, `${colTotal}${fila}`, `SUM(B${fila}:${col(n - 1)}${fila})`);
  din.getCell(`${colTotal}${fila}`).font = { bold: true };

  // Resumen ------------------------------------------------------------------------------------
  const res = wb.addWorksheet("Resumen");
  res.columns = [{ width: 50 }, { width: 20 }];
  titulo(res, "Resumen del ajuste por inflación impositivo", empresa, periodo);
  res.getCell("A4").value = "Ajuste estático";
  f(res, "B4", `'Ajuste Estático'!B${filaAjusteEst}`);
  res.getCell("A5").value = "Ajuste dinámico";
  f(res, "B5", `'Ajuste Dinámico'!${colTotal}${filaAjusteDin}`);
  res.getCell("A6").value = "AJUSTE POR INFLACIÓN IMPOSITIVO";
  res.getCell("A6").font = { bold: true };
  f(res, "B6", "B4+B5");
  res.getCell("B6").font = { bold: true };
  f(res, "B7", 'IF(B6=0,"",IF(B6>0,"Ganancia","Pérdida"))', "@");
  res.getCell("A9").value =
    `En el período fiscal ${periodo}, el 100 % del ajuste se computa en el mismo ejercicio.`;
  if (axi.variacion36 !== null) {
    res.getCell("A10").value =
      "Variación del IPC en los 36 meses anteriores al cierre";
    res.getCell("B10").value = axi.variacion36;
    res.getCell("B10").numFmt = "0.00%";
    res.getCell("A11").value =
      axi.variacion36 > 1
        ? "Supera el 100 %: corresponde aplicar el ajuste (art. 106 LIG)."
        : "No supera el 100 %: revisar si corresponde aplicar el ajuste (art. 106 LIG).";
  }

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
