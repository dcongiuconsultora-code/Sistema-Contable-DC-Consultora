"use client";

import { useMemo, useState } from "react";
import type { DdjjGanancias } from "@/lib/ddjj/leer-ddjj";
import { fechaCorta, pesos } from "@/lib/formato";
import type { Indices } from "@/lib/inflacion/indices";
import { calcularQuebrantos } from "@/lib/impuestos/quebrantos";

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
const mesTexto = (m: string) =>
  `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/** Quebrantos de Ganancias para compensar en los períodos siguientes (actualizados por IPC). */
export function PanelQuebrantos({
  ganancias,
  manuales,
  indices,
  puedeEditar,
  onManual,
}: {
  ganancias: Record<string, DdjjGanancias>;
  manuales: Record<string, number>;
  indices: Indices;
  puedeEditar: boolean;
  onManual: (cierre: string, importe: number | null) => void;
}) {
  const q = useMemo(
    () => calcularQuebrantos(ganancias, manuales, indices),
    [ganancias, manuales, indices],
  );
  const [cierre, setCierre] = useState("");
  const [importe, setImporte] = useState("");
  const hay = q.lista.length > 0;
  const estimado = q.ipcHasta && q.ipcHasta < q.aCierre.slice(0, 7);

  return (
    <section className="mb-4 rounded-2xl border border-stone-200/80 bg-white p-5 text-sm shadow-sm">
      <h3 className="font-semibold">Quebrantos de Ganancias para compensar</h3>
      <p className="mt-1 max-w-3xl text-stone-600">
        Salen de las DDJJ de Ganancias cargadas (y de los que cargues de años
        anteriores). Se compensan con las ganancias de los cinco períodos
        siguientes, empezando por el más viejo, y se actualizan por IPC hasta el
        cierre del período a liquidar (art. 25 de la ley).
      </p>
      {hay ? (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full">
              <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="py-1.5 pr-3">Se generó</th>
                  <th className="py-1.5 pr-3 text-right">Quebranto</th>
                  <th className="py-1.5 pr-3 text-right">Ya compensado</th>
                  <th className="py-1.5 pr-3 text-right">Queda (histórico)</th>
                  <th className="py-1.5 pr-3 text-right">Coef. IPC</th>
                  <th className="py-1.5 pr-3 text-right">
                    Queda actualizado al {fechaCorta(q.aCierre)}
                  </th>
                  <th className="py-1.5 pr-3">Se puede usar hasta</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {q.lista.map((x) => (
                  <tr
                    key={x.origen}
                    className={x.vencido ? "text-stone-400 line-through" : ""}
                  >
                    <td className="py-1.5 pr-3">
                      {fechaCorta(x.origen)}
                      {x.manual && (
                        <span className="ml-1 text-xs text-stone-500">
                          (cargado a mano)
                        </span>
                      )}
                    </td>
                    <td className="cifra py-1.5 pr-3">{pesos(x.original)}</td>
                    <td className="cifra py-1.5 pr-3">{pesos(x.compensado)}</td>
                    <td className="cifra py-1.5 pr-3">{pesos(x.saldo)}</td>
                    <td className="cifra py-1.5 pr-3">
                      {x.coeficiente.toLocaleString("es-AR", {
                        minimumFractionDigits: 4,
                      })}
                    </td>
                    <td className="cifra py-1.5 pr-3 font-medium">
                      {pesos(x.saldoActualizado)}
                    </td>
                    <td className="py-1.5 pr-3">
                      período {x.venceEnPeriodo}
                      {x.vencido && " (vencido)"}
                    </td>
                    <td className="py-1.5 text-right">
                      {x.manual && puedeEditar && (
                        <button
                          type="button"
                          onClick={() => onManual(x.origen, null)}
                          className="text-xs text-stone-500 underline"
                        >
                          Quitar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-semibold">
                <tr className="border-t border-stone-300">
                  <td className="py-1.5" colSpan={5}>
                    Disponible para el período que cierra el{" "}
                    {fechaCorta(q.aCierre)}
                  </td>
                  <td className="cifra py-1.5 pr-3">
                    {pesos(q.totalActualizado)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
          {estimado && (
            <p className="mt-2 text-xs text-amber-800">
              Todavía no está el IPC del cierre: se actualizó con el último
              cargado ({mesTexto(q.ipcHasta!)}). Se completa solo cuando subas
              los índices nuevos.
            </p>
          )}
        </>
      ) : (
        <p className="mt-3 text-stone-500">No hay quebrantos cargados.</p>
      )}
      {puedeEditar && (
        <details className="mt-3">
          <summary className="cursor-pointer font-medium text-marca">
            Cargar un quebranto de años anteriores
          </summary>
          <div className="mt-2 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-stone-600">
                Cierre del período en que se generó
              </span>
              <input
                id="quebranto-cierre"
                type="date"
                value={cierre}
                onChange={(e) => setCierre(e.target.value)}
                className="mt-1 block rounded-md border border-stone-300 px-2 py-1.5"
              />
            </label>
            <label className="block">
              <span className="text-stone-600">
                Quebranto que queda (valor de origen)
              </span>
              <input
                id="quebranto-importe"
                type="number"
                min={0}
                step="0.01"
                value={importe}
                onChange={(e) => setImporte(e.target.value)}
                className="mt-1 block w-48 rounded-md border border-stone-300 px-2 py-1.5 text-right"
              />
            </label>
            <button
              type="button"
              disabled={!cierre || !(Number(importe) > 0)}
              onClick={() => {
                onManual(cierre, Number(importe));
                setCierre("");
                setImporte("");
              }}
              className="rounded-md bg-marca px-4 py-2 font-medium text-white disabled:opacity-40"
            >
              Agregar
            </button>
          </div>
        </details>
      )}
    </section>
  );
}
