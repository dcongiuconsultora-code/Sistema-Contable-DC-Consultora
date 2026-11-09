"use client";

import { useEffect, useState } from "react";
import type { Empresa, Repositorio } from "@/lib/datos/repositorio";
import { pesos } from "@/lib/formato";
import {
  type Categoria,
  categoriaQueCorresponde,
  esMonotributo,
} from "@/lib/monotributo/monotributo";

/** Monotributistas cerca o arriba del tope de su categoría (últimos 12 meses facturados). */
export function AlertasMonotributo({
  repo,
  empresas,
  onAbrir,
}: {
  repo: Repositorio;
  empresas: Empresa[];
  onAbrir: (e: Empresa) => void;
}) {
  const monos = empresas.filter((e) => esMonotributo(e.condicion_iva));
  const [tabla, setTabla] = useState<Categoria[] | null>(null);
  const [facturado, setFacturado] = useState<Record<string, number>>({});
  const ids = monos.map((e) => e.id).join(",");

  useEffect(() => {
    if (!ids) return;
    const d = new Date();
    const desde = new Date(d.getFullYear(), d.getMonth() - 11, 1);
    const iso = `${desde.getFullYear()}-${String(desde.getMonth() + 1).padStart(2, "0")}-01`;
    Promise.all([
      repo.parametro<Categoria[]>("monotributo_categorias"),
      repo.facturadoPorEmpresa(ids.split(","), iso),
    ]).then(
      ([t, f]) => {
        setTabla(t ?? []);
        setFacturado(f);
      },
      () => setTabla([]),
    );
  }, [repo, ids]);

  if (!monos.length) return null;
  const filas = monos
    .map((e) => {
      const total = facturado[e.id] ?? 0;
      const actual = tabla?.find((c) => c.letra === e.categoria_monotributo);
      const corresponde = tabla ? categoriaQueCorresponde(total, tabla) : null;
      const tope = actual?.tope ?? corresponde?.tope ?? 0;
      return { e, total, actual, corresponde, uso: tope ? total / tope : 0 };
    })
    .sort((a, b) => b.uso - a.uso);

  return (
    <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold">Monotributistas</h2>
      <p className="mt-1 text-sm text-stone-600">
        Lo facturado en los últimos 12 meses contra el tope de su categoría
        (según los comprobantes de ARCA importados).
      </p>
      {tabla !== null && tabla.length === 0 && (
        <p className="mt-2 text-sm text-amber-700">
          Falta cargar la tabla de categorías: abrí un monotributista y usá
          “Cargar tabla”.
        </p>
      )}
      <table className="mt-3 w-full text-sm">
        <tbody className="divide-y divide-stone-100">
          {filas.map(({ e, total, actual, corresponde, uso }) => (
            <tr key={e.id}>
              <td className="py-2 pr-3">
                <button
                  type="button"
                  onClick={() => onAbrir(e)}
                  className="text-left font-medium hover:text-marca hover:underline"
                >
                  {e.razon_social}
                </button>
                <div className="text-xs text-stone-500">
                  Categoría {actual?.letra ?? "sin cargar"}
                  {corresponde && corresponde.letra !== actual?.letra
                    ? ` · corresponde ${corresponde.letra}`
                    : ""}
                </div>
              </td>
              <td className="cifra py-2 pr-3">{pesos(total)}</td>
              <td className="w-40 py-2">
                <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className={`h-full ${uso > 1 ? "bg-red-600" : uso >= 0.8 ? "bg-amber-500" : "bg-emerald-600"}`}
                    style={{ width: `${Math.min(100, uso * 100)}%` }}
                  />
                </div>
                <div
                  className={`mt-0.5 text-right text-xs ${uso > 1 ? "text-red-700" : uso >= 0.8 ? "text-amber-700" : "text-stone-500"}`}
                >
                  {tabla?.length
                    ? uso > 1
                      ? "⚠ Pasó el tope"
                      : uso >= 0.8
                        ? `⚠ ${(uso * 100).toFixed(0)} % del tope`
                        : `${(uso * 100).toFixed(0)} % del tope`
                    : "—"}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
