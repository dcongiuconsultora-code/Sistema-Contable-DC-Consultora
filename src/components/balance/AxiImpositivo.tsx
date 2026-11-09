"use client";

import { useMemo, useState } from "react";
import type { Asiento } from "@/lib/contabilidad/diario";
import type { SaldosIniciales } from "@/lib/contabilidad/indicadores";
import { pesos } from "@/lib/formato";
import { type CorreccionesAxi, calcularAxi } from "@/lib/impuestos/axi";
import type { Indices } from "@/lib/inflacion/indices";

function numero(texto: string) {
  const limpio = texto.replace(/\./g, "").replace(",", ".").trim();
  if (!limpio) return 0;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

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

function Importe({
  id,
  valor,
  automatico,
  onCambio,
}: {
  id: string;
  valor: number;
  automatico: number;
  onCambio: (v: number | undefined) => void;
}) {
  const [texto, setTexto] = useState<string | null>(null);
  const corregido = valor !== automatico;
  return (
    <input
      id={id}
      inputMode="decimal"
      value={texto ?? (valor ? valor.toLocaleString("es-AR") : "")}
      onFocus={() => setTexto(valor ? String(valor).replace(".", ",") : "")}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        const n = numero(texto ?? "");
        setTexto(null);
        if (n === null) return;
        onCambio(n === automatico ? undefined : n);
      }}
      title={corregido ? `El sistema calculó ${pesos(automatico)}` : undefined}
      placeholder="0"
      className={`w-full min-w-24 rounded border px-1.5 py-0.5 text-right tabular-nums ${corregido ? "border-amber-400 bg-amber-50" : "border-stone-200"}`}
    />
  );
}

/** Papel de trabajo del ajuste por inflación impositivo (Ganancias). */
export function AxiImpositivo({
  asientos,
  iniciales,
  cierre,
  indices,
  correcciones,
  onCorrecciones,
  empresa,
}: {
  asientos: Asiento[];
  iniciales: SaldosIniciales;
  cierre: string;
  indices: Indices;
  correcciones: CorreccionesAxi;
  onCorrecciones: (c: CorreccionesAxi) => void;
  empresa: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const axi = useMemo(
    () => calcularAxi({ asientos, iniciales, cierre, indices, correcciones }),
    [asientos, iniciales, cierre, indices, correcciones],
  );

  async function descargar() {
    setError(null);
    try {
      const { armarExcelAxi } = await import("@/lib/impuestos/exportar-axi");
      const archivo = await armarExcelAxi(axi, empresa);
      const url = URL.createObjectURL(
        new Blob([archivo], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `AXI impositivo ${empresa} ${cierre}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const cambiarImporte = (clave: string, v: number | undefined) => {
    const importes = { ...correcciones.importes };
    if (v === undefined) delete importes[clave];
    else importes[clave] = v;
    onCorrecciones({ ...correcciones, importes });
  };
  const cambiarMes = (
    clave: string,
    i: number,
    v: number | undefined,
    autos: number[],
  ) => {
    const actual = correcciones.dinamico?.[clave] ?? [...autos];
    const nuevo = [...actual];
    nuevo[i] = v ?? autos[i];
    const dinamico = { ...correcciones.dinamico, [clave]: nuevo };
    if (nuevo.every((x, j) => x === autos[j])) delete dinamico[clave];
    onCorrecciones({ ...correcciones, dinamico });
  };

  const e = axi.estatico;
  return (
    <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">
            Ajuste por inflación impositivo (Ganancias)
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-stone-600">
            Igual que tu planilla: ajuste estático sobre el activo y pasivo
            impositivo al inicio y ajuste dinámico por los movimientos del
            ejercicio, con el IPC. Los importes salen del sistema; si el valor
            impositivo es otro, corregilo (queda marcado en amarillo).
          </p>
        </div>
        <button
          type="button"
          onClick={descargar}
          className="rounded-md border border-marca px-3 py-1.5 text-sm font-medium text-marca hover:bg-marca-claro"
        >
          Descargar papel de trabajo (Excel)
        </button>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-lg bg-stone-50 p-3">
          <div className="text-stone-500">Coeficiente</div>
          <div className="text-lg font-semibold tabular-nums">
            {(axi.coeficiente * 100).toLocaleString("es-AR", {
              maximumFractionDigits: 2,
            })}{" "}
            %
          </div>
        </div>
        <div className="rounded-lg bg-stone-50 p-3">
          <div className="text-stone-500">Ajuste estático</div>
          <div className="text-lg font-semibold tabular-nums">
            {pesos(e.ajuste)}
          </div>
        </div>
        <div className="rounded-lg bg-stone-50 p-3">
          <div className="text-stone-500">Ajuste dinámico</div>
          <div className="text-lg font-semibold tabular-nums">
            {pesos(axi.dinamico.ajuste)}
          </div>
        </div>
        <div className="rounded-lg bg-marca-claro p-3">
          <div className="text-stone-600">
            Total ({axi.total >= 0 ? "ganancia" : "pérdida"})
          </div>
          <div className="text-lg font-semibold tabular-nums text-marca">
            {pesos(axi.total)}
          </div>
        </div>
      </div>
      {axi.variacion36 !== null && (
        <p className="text-xs text-stone-500">
          Variación del IPC en los 36 meses anteriores al cierre:{" "}
          {(axi.variacion36 * 100).toLocaleString("es-AR", {
            maximumFractionDigits: 1,
          })}{" "}
          %
          {axi.variacion36 > 1
            ? " (supera el 100 %: corresponde aplicar el ajuste)."
            : " (no supera el 100 %: revisar si corresponde)."}
          {axi.indiceCierre.estimado &&
            " Falta el IPC del mes de cierre: se usó el último publicado."}
        </p>
      )}

      <details>
        <summary className="cursor-pointer font-medium">
          Ajuste estático: activo y pasivo al inicio
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="py-1.5">Concepto</th>
                <th className="py-1.5 text-right">Importe</th>
                <th className="py-1.5 text-center">Computable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {e.renglones.map((r, i) => (
                <tr key={r.clave}>
                  <td className="py-1">
                    {(i === 0 || e.renglones[i - 1].lado !== r.lado) && (
                      <div className="pt-2 text-xs font-semibold uppercase text-marca">
                        {r.lado === "activo" ? "Activo" : "Pasivo"}
                      </div>
                    )}
                    {r.nombre}
                  </td>
                  <td className="w-40 py-1">
                    <Importe
                      id={`axi-${r.clave}`}
                      valor={r.importe}
                      automatico={r.automatico}
                      onCambio={(v) => cambiarImporte(r.clave, v)}
                    />
                  </td>
                  <td className="py-1 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${r.nombre} computable`}
                      checked={r.computable}
                      onChange={(ev) =>
                        onCorrecciones({
                          ...correcciones,
                          computables: {
                            ...correcciones.computables,
                            [r.clave]: ev.target.checked,
                          },
                        })
                      }
                    />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="font-semibold">
              <tr className="border-t border-stone-300">
                <td className="py-1.5">
                  Activo computable − pasivo computable
                </td>
                <td className="cifra py-1.5">{pesos(e.capitalExpuesto)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </details>

      <details>
        <summary className="cursor-pointer font-medium">
          Ajuste dinámico: movimientos del ejercicio
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="min-w-64 py-1.5">Concepto</th>
                {axi.meses.map((m) => (
                  <th key={m} className="px-1 py-1.5 text-right">
                    {MESES[Number(m.slice(5)) - 1]} {m.slice(2, 4)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {axi.dinamico.renglones.map((r) => (
                <tr key={r.clave}>
                  <td className="py-1 pr-2">
                    <span
                      className={
                        r.signo > 0 ? "text-stone-800" : "text-stone-500"
                      }
                    >
                      {r.signo > 0 ? "(+) " : "(−) "}
                      {r.nombre}
                    </span>
                  </td>
                  {r.meses.map((v, i) => (
                    <td key={axi.meses[i]} className="px-1 py-1">
                      <Importe
                        id={`axi-${r.clave}-${i}`}
                        valor={v}
                        automatico={r.automaticos[i]}
                        onCambio={(n) =>
                          cambiarMes(r.clave, i, n, r.automaticos)
                        }
                      />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-1">Ajuste del mes</td>
                {axi.dinamico.ajustes.map((v, i) => (
                  <td key={axi.meses[i]} className="cifra px-1 py-1">
                    {v ? pesos(v) : "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </details>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  );
}
