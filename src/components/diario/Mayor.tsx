"use client";

import { useMemo, useState } from "react";
import type { Asiento } from "@/lib/contabilidad/diario";
import type { SaldosIniciales } from "@/lib/contabilidad/indicadores";
import { mayorDeCuenta } from "@/lib/contabilidad/sumas-saldos";
import { fechaCorta, pesos } from "@/lib/formato";
import { nombreCuenta, PLAN_MODELO } from "@/lib/plan/plan";

const IMPUTABLES = PLAN_MODELO.filter((c) => c.imputable);

async function descargar(
  m: ReturnType<typeof mayorDeCuenta>,
  empresa: string,
  desde: string,
  hasta: string,
) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Mayor");
  ws.columns = [
    { width: 12 },
    { width: 12 },
    { width: 50 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
  ];
  ws.addRow([
    `${empresa} · Mayor de ${m.codigo} ${nombreCuenta(m.codigo)}`,
  ]).font = {
    bold: true,
    size: 13,
  };
  ws.addRow([`Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`]);
  ws.addRow([]);
  ws.addRow(["Fecha", "Origen", "Descripción", "Debe", "Haber", "Saldo"]).font =
    {
      bold: true,
    };
  ws.addRow(["", "", "Saldo anterior", null, null, m.anterior]);
  for (const r of m.renglones)
    ws.addRow([
      fechaCorta(r.fecha),
      r.origen,
      r.descripcion,
      r.debe || null,
      r.haber || null,
      r.saldo,
    ]);
  ws.addRow(["", "", "Totales", m.debe, m.haber, m.saldo]).font = {
    bold: true,
  };
  for (const c of [4, 5, 6]) ws.getColumn(c).numFmt = "#,##0.00;[Red]-#,##0.00";
  const archivo = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([archivo]));
  const a = document.createElement("a");
  a.href = url;
  a.download = `Mayor ${m.codigo} ${empresa}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Libro mayor: los movimientos de una cuenta con su saldo acumulado. */
export function Mayor({
  cuenta,
  onCuenta,
  desde,
  hasta,
  asientos,
  iniciales,
  empresa,
}: {
  cuenta: string;
  onCuenta: (codigo: string) => void;
  desde: string;
  hasta: string;
  asientos: Asiento[];
  iniciales: SaldosIniciales;
  empresa: string;
}) {
  const [texto, setTexto] = useState(
    cuenta ? `${cuenta} ${nombreCuenta(cuenta)}` : "",
  );
  // Primero las cuentas que tienen movimientos o saldo.
  const conMovimiento = useMemo(() => {
    const usadas = new Set(Object.keys(iniciales.saldos));
    for (const a of asientos) for (const l of a.lineas) usadas.add(l.cuenta);
    return IMPUTABLES.filter((c) => usadas.has(c.codigo));
  }, [asientos, iniciales]);
  const m = useMemo(
    () =>
      cuenta
        ? mayorDeCuenta(
            asientos,
            iniciales,
            cuenta,
            desde || "1900-01-01",
            hasta,
          )
        : null,
    [asientos, iniciales, cuenta, desde, hasta],
  );

  function elegir(valor: string) {
    setTexto(valor);
    const codigo = valor.trim().split(/\s+/)[0];
    if (IMPUTABLES.some((c) => c.codigo === codigo)) onCuenta(codigo);
  }

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-semibold">Libro mayor</h1>
        <p className="mt-1 max-w-3xl text-stone-600">
          Elegí una cuenta para ver todos sus movimientos del período, con el
          saldo anterior y el saldo después de cada asiento.
        </p>
      </section>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-72 flex-1 text-sm">
          <span className="text-stone-600">Cuenta</span>
          <input
            id="mayor-cuenta"
            list="cuentas-mayor"
            value={texto}
            onChange={(e) => elegir(e.target.value)}
            placeholder="Escribí el código o el nombre"
            className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-1.5"
          />
          <datalist id="cuentas-mayor">
            {[
              ...conMovimiento,
              ...IMPUTABLES.filter((c) => !conMovimiento.includes(c)),
            ].map((c) => (
              <option key={c.codigo} value={`${c.codigo} ${c.nombre}`} />
            ))}
          </datalist>
        </label>
        {m && (
          <button
            type="button"
            onClick={() => descargar(m, empresa, desde, hasta)}
            className="rounded-md border border-marca px-3 py-1.5 text-sm font-medium text-marca hover:bg-marca-claro"
          >
            Descargar Excel
          </button>
        )}
      </div>
      {conMovimiento.length > 0 && !cuenta && (
        <div className="flex flex-wrap gap-1.5 text-sm">
          {conMovimiento.slice(0, 24).map((c) => (
            <button
              key={c.codigo}
              type="button"
              onClick={() => elegir(`${c.codigo} ${c.nombre}`)}
              className="rounded-full border border-stone-300 bg-white px-3 py-1 hover:border-marca hover:text-marca"
            >
              {c.nombre}
            </button>
          ))}
        </div>
      )}
      {m && (
        <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
          <div className="max-h-[40rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Descripción</th>
                  <th className="px-3 py-2 text-right">Debe</th>
                  <th className="px-3 py-2 text-right">Haber</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                <tr className="text-stone-500">
                  <td className="px-3 py-1.5" colSpan={4}>
                    Saldo anterior
                  </td>
                  <td className="cifra px-3 py-1.5">{pesos(m.anterior)}</td>
                </tr>
                {m.renglones.map((r, i) => (
                  <tr key={i}>
                    <td className="whitespace-nowrap px-3 py-1.5 tabular-nums">
                      {fechaCorta(r.fecha)}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="mr-1.5 rounded bg-stone-100 px-1.5 py-0.5 text-xs text-stone-600">
                        {r.origen}
                      </span>
                      {r.descripcion}
                    </td>
                    <td className="cifra px-3 py-1.5">
                      {r.debe ? pesos(r.debe) : ""}
                    </td>
                    <td className="cifra px-3 py-1.5">
                      {r.haber ? pesos(r.haber) : ""}
                    </td>
                    <td className="cifra px-3 py-1.5">{pesos(r.saldo)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-stone-50 font-semibold">
                <tr>
                  <td className="px-3 py-2" colSpan={2}>
                    Totales del período ({m.renglones.length} movimientos)
                  </td>
                  <td className="cifra px-3 py-2">{pesos(m.debe)}</td>
                  <td className="cifra px-3 py-2">{pesos(m.haber)}</td>
                  <td className="cifra px-3 py-2">{pesos(m.saldo)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="border-t border-stone-200 px-4 py-2 text-xs text-stone-500">
            Saldo positivo = deudor; negativo = acreedor.
          </p>
        </section>
      )}
    </div>
  );
}
