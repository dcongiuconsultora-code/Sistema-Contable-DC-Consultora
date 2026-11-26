// Cuadro resumen de los planes de pago de un cliente: cuánto paga cada mes y hasta cuándo.
import { cuitConGuiones, fechaCorta, nombrePeriodo } from "@/lib/formato";
import { cuotasDelPlan, type PlanPago } from "@/lib/vencimientos/vencimientos";
import { $, MARCA_RGB, nuevoExcel, nuevoPdf } from "./pdf-base";

export interface ResumenPlan {
  nombre: string;
  organismo: string;
  numero: string;
  descripcion: string;
  cuotas: number;
  pagadas: number;
  pendientes: number;
  /** Cuotas impagas con la fecha ya pasada. */
  vencidas: number;
  importeCuota: number;
  /** Mes de la primera y la última cuota (AAAA-MM). */
  primera: string;
  ultima: string;
  /** Lo que falta pagar (cuotas impagas). */
  saldo: number;
  proxima: { numero: number; fecha: string; importe: number } | null;
}

export interface CuadroPlanes {
  planes: ResumenPlan[];
  /** Una fila por mes con cuotas impagas: lo de cada plan y el total. */
  meses: { mes: string; importes: number[]; total: number; vencido: boolean }[];
  porAnio: { anio: string; total: number }[];
  total: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function cuadroPlanes(planes: PlanPago[], hoy: string): CuadroPlanes {
  const vigentes = planes.filter((p) => p.estado === "vigente");
  const porMes = new Map<string, number[]>();
  const mesesVencidos = new Set<string>();
  const resumen = vigentes.map((p, i): ResumenPlan => {
    const cuotas = cuotasDelPlan(p);
    const impagas = cuotas.filter((c) => !c.pagada);
    for (const c of impagas) {
      const fila = porMes.get(c.mes) ?? vigentes.map(() => 0);
      fila[i] = r2(fila[i] + c.importe);
      porMes.set(c.mes, fila);
      if (c.fecha < hoy) mesesVencidos.add(c.mes);
    }
    const proxima = impagas.find((c) => c.fecha >= hoy) ?? null;
    return {
      nombre: `${p.organismo}${p.numero ? ` ${p.numero}` : ""}`,
      organismo: p.organismo,
      numero: p.numero,
      descripcion: p.descripcion,
      cuotas: cuotas.length,
      pagadas: cuotas.length - impagas.length,
      pendientes: impagas.length,
      vencidas: impagas.filter((c) => c.fecha < hoy).length,
      importeCuota: proxima?.importe ?? impagas[0]?.importe ?? p.importeCuota,
      primera: cuotas[0]?.mes ?? p.primeraCuota,
      ultima: cuotas.at(-1)?.mes ?? p.primeraCuota,
      saldo: r2(impagas.reduce((t, c) => t + c.importe, 0)),
      proxima: proxima
        ? {
            numero: proxima.numero,
            fecha: proxima.fecha,
            importe: proxima.importe,
          }
        : null,
    };
  });
  const meses = [...porMes.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mes, importes]) => ({
      mes,
      importes,
      total: r2(importes.reduce((t, v) => t + v, 0)),
      vencido: mesesVencidos.has(mes),
    }));
  const anios = new Map<string, number>();
  for (const m of meses)
    anios.set(
      m.mes.slice(0, 4),
      r2((anios.get(m.mes.slice(0, 4)) ?? 0) + m.total),
    );
  return {
    planes: resumen,
    meses,
    porAnio: [...anios.entries()].map(([anio, total]) => ({ anio, total })),
    total: r2(meses.reduce((t, m) => t + m.total, 0)),
  };
}

const mesLindo = (m: string) => {
  const n = nombrePeriodo(m);
  return n.charAt(0).toUpperCase() + n.slice(1);
};
const mesCorto = (m: string) => `${mesLindo(m).slice(0, 3)} ${m.slice(2, 4)}`;

export interface DatosCuadro {
  empresa: string;
  cuit: string;
  generado: string;
  cuadro: CuadroPlanes;
}

export async function pdfPlanes(d: DatosCuadro, logo?: string): Promise<Blob> {
  const c = d.cuadro;
  const p = await nuevoPdf({
    titulo: "Planes de pago",
    subtitulo: `${d.empresa} · CUIT ${cuitConGuiones(d.cuit)}`,
    logo,
    apaisado: c.planes.length > 3,
  });
  const ultima = c.planes
    .map((x) => x.ultima)
    .sort()
    .at(-1);
  const proximoMes = c.meses.find((m) => !m.vencido);
  p.tarjetas([
    ["Planes vigentes", String(c.planes.length)],
    ["Falta pagar en total", $(c.total)],
    [
      "Próximo mes",
      proximoMes ? $(proximoMes.total) : "—",
      proximoMes ? mesLindo(proximoMes.mes) : undefined,
    ],
    ["Último pago", ultima ? mesLindo(ultima) : "—"],
  ]);
  p.titulo("Cada plan");
  p.tabla(
    {
      head: [
        ["Plan", "Cuotas", "Pagadas", "Cuota", "Desde", "Hasta", "Falta pagar"],
      ],
      didParseCell: (cell) => {
        if (
          cell.section === "body" &&
          cell.column.index === 2 &&
          c.planes[cell.row.index]?.vencidas
        )
          cell.cell.styles.textColor = [208, 59, 59];
      },
      body: c.planes.map((x) => [
        `${x.nombre}${x.descripcion ? `\n${x.descripcion}` : ""}`,
        String(x.cuotas),
        `${x.pagadas}${x.vencidas ? `\n${x.vencidas} vencida${x.vencidas > 1 ? "s" : ""}` : ""}`,
        $(x.importeCuota),
        mesLindo(x.primera),
        mesLindo(x.ultima),
        $(x.saldo),
      ]),
      foot: [["Total", "", "", "", "", "", $(c.total)]],
      columnStyles: {
        1: { cellWidth: 15 },
        2: { cellWidth: 20 },
        3: { cellWidth: 26 },
        4: { cellWidth: 22 },
        5: { cellWidth: 22 },
        6: { cellWidth: 28 },
      },
    },
    [1, 3, 6],
  );
  if (c.meses.length) {
    p.titulo("Cuánto se paga cada mes", "cuotas que faltan pagar");
    p.barras(
      c.meses
        .slice(0, 24)
        .map((m) => ({ etiqueta: mesCorto(m.mes), valores: [m.total] })),
      [{ nombre: "Total del mes", color: MARCA_RGB }],
    );
    const nombres = c.planes.map((x) => x.nombre);
    p.tabla(
      {
        head: [["Mes", ...nombres, "Total del mes"]],
        body: c.meses.map((m) => [
          `${mesLindo(m.mes)}${m.vencido ? " (vencida)" : ""}`,
          ...m.importes.map((v) => (v ? $(v) : "")),
          $(m.total),
        ]),
        foot: [["Total", ...c.planes.map((x) => $(x.saldo)), $(c.total)]],
        styles: {
          fontSize: nombres.length > 4 ? 7.5 : 9,
          cellPadding: 1.8,
          textColor: [41, 37, 36],
        },
        didParseCell: (cell) => {
          if (cell.section === "body" && c.meses[cell.row.index]?.vencido)
            cell.cell.styles.textColor = [208, 59, 59];
          if (cell.column.index === nombres.length + 1)
            cell.cell.styles.fontStyle = "bold";
        },
      },
      nombres.map((_, i) => i + 1).concat(nombres.length + 1),
    );
    if (c.porAnio.length > 1) {
      p.titulo("Por año");
      p.tabla(
        {
          head: [["Año", "Total a pagar"]],
          body: c.porAnio.map((a) => [a.anio, $(a.total)]),
          tableWidth: 90,
        },
        [1],
      );
    }
  }
  return p.terminar(
    d.generado,
    "Importes de las cuotas según los planes cargados; pueden variar por intereses.",
  );
}

export async function excelPlanes(
  d: DatosCuadro,
  logo?: ArrayBuffer,
): Promise<Blob> {
  const c = d.cuadro;
  const x = await nuevoExcel(
    "Planes de pago",
    `${d.empresa} · CUIT ${cuitConGuiones(d.cuit)} · al ${fechaCorta(d.generado)}`,
    logo,
  );
  const ws = x.wb.addWorksheet("Resumen", {
    views: [{ showGridLines: false }],
  });
  ws.columns = [
    { width: 4 },
    { width: 34 },
    { width: 10 },
    { width: 10 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
  ];
  x.portada(ws);
  ws.getRow(8).values = [
    "",
    "Plan",
    "Cuotas",
    "Pagadas",
    "Cuota",
    "Desde",
    "Hasta",
    "Falta pagar",
  ];
  x.encabezado(ws, 8);
  let f = 8;
  for (const p of c.planes) {
    f++;
    ws.getRow(f).values = [
      "",
      `${p.nombre}${p.descripcion ? ` · ${p.descripcion}` : ""}`,
      p.cuotas,
      p.pagadas,
      p.importeCuota,
      mesLindo(p.primera),
      mesLindo(p.ultima),
      p.saldo,
    ];
    ws.getCell(`E${f}`).numFmt = x.NUM;
    ws.getCell(`H${f}`).numFmt = x.NUM;
  }
  f++;
  ws.getRow(f).values = [
    "",
    "Total",
    "",
    "",
    "",
    "",
    "",
    { formula: `SUM(H9:H${f - 1})` },
  ];
  ws.getRow(f).font = { bold: true };
  ws.getCell(`H${f}`).numFmt = x.NUM;
  if (c.porAnio.length) {
    f += 2;
    ws.getRow(f).values = ["", "Año", "", "", "", "", "", "Total a pagar"];
    x.encabezado(ws, f);
    for (const a of c.porAnio) {
      f++;
      ws.getRow(f).values = ["", a.anio, "", "", "", "", "", a.total];
      ws.getCell(`H${f}`).numFmt = x.NUM;
    }
  }

  const g = x.wb.addWorksheet("Cuotas por mes");
  g.columns = [
    { header: "Mes", width: 20 },
    ...c.planes.map((p) => ({
      header: p.nombre,
      width: 20,
      style: { numFmt: x.NUM },
    })),
    { header: "Total del mes", width: 18, style: { numFmt: x.NUM } },
  ];
  x.encabezado(g, 1);
  for (const m of c.meses) {
    const fila = g.addRow([
      `${mesLindo(m.mes)}${m.vencido ? " (vencida)" : ""}`,
      ...m.importes.map((v) => v || null),
      m.total,
    ]);
    if (m.vencido) fila.font = { color: { argb: "FFD03B3B" } };
  }
  const n = c.meses.length + 1;
  const letra = (i: number) => String.fromCharCode(66 + i);
  const tot = g.addRow([
    "Total",
    ...c.planes.map((_, i) => ({
      formula: `SUM(${letra(i)}2:${letra(i)}${n})`,
    })),
    {
      formula: `SUM(${letra(c.planes.length)}2:${letra(c.planes.length)}${n})`,
    },
  ]);
  tot.font = { bold: true };
  g.views = [{ state: "frozen", ySplit: 1, xSplit: 1 }];
  return x.blob();
}
