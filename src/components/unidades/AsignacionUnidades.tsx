"use client";

import type { Comprobante } from "@/lib/arca/tipos";
import { cuitConGuiones, pesos } from "@/lib/formato";
import {
  type ConfigUnidades,
  nombreUnidad,
  unidadDeVenta,
} from "@/lib/unidades/unidades";

interface Props {
  unidades: ConfigUnidades;
  ventas: Comprobante[];
  compras: Comprobante[];
  onAsignarProveedor: (cuit: string, unidadId: string | null) => void;
}

/** A qué unidad va cada proveedor, y qué puntos de venta todavía no tienen unidad. */
export function AsignacionUnidades({
  unidades,
  ventas,
  compras,
  onAsignarProveedor,
}: Props) {
  const proveedores = new Map<
    string,
    { nombre: string; total: number; cantidad: number }
  >();
  for (const c of compras) {
    if (c.cuitContraparte.length !== 11) continue;
    const p = proveedores.get(c.cuitContraparte) ?? {
      nombre: c.contraparte,
      total: 0,
      cantidad: 0,
    };
    p.total += c.total;
    p.cantidad++;
    if (!p.nombre) p.nombre = c.contraparte;
    proveedores.set(c.cuitContraparte, p);
  }
  const lista = [...proveedores.entries()].sort(
    (a, b) => b[1].total - a[1].total,
  );
  const sinAsignar = lista.filter(
    ([cuit]) => !unidades.proveedores[cuit],
  ).length;

  const puntosVenta = new Map<number, number>();
  for (const v of ventas)
    puntosVenta.set(v.puntoVenta, (puntosVenta.get(v.puntoVenta) ?? 0) + 1);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <section className="h-fit rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold">Ventas por punto de venta</h3>
        <p className="mb-3 text-sm text-stone-500">
          Se configuran en Empresas → Unidades.
        </p>
        {puntosVenta.size === 0 ? (
          <p className="text-sm text-stone-500">
            Todavía no hay ventas importadas.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100 text-sm">
            {[...puntosVenta.entries()]
              .sort((a, b) => a[0] - b[0])
              .map(([pv, cantidad]) => {
                const unidad = unidadDeVenta(
                  { puntoVenta: pv } as Comprobante,
                  unidades,
                );
                return (
                  <li
                    key={pv}
                    className="flex items-center justify-between gap-2 py-1.5"
                  >
                    <span className="tabular-nums">
                      Punto de venta {String(pv).padStart(5, "0")}{" "}
                      <span className="text-stone-500">({cantidad})</span>
                    </span>
                    <span
                      className={
                        unidad ? "font-medium" : "font-medium text-amber-700"
                      }
                    >
                      {unidad ? nombreUnidad(unidad, unidades) : "⚠ sin unidad"}
                    </span>
                  </li>
                );
              })}
          </ul>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-200 px-4 py-3">
          <h3 className="font-semibold">Proveedores por unidad</h3>
          <span
            className={`text-sm ${sinAsignar ? "text-amber-700" : "text-emerald-700"}`}
          >
            {sinAsignar ? `${sinAsignar} sin asignar` : "✓ Todos asignados"}
          </span>
        </div>
        {lista.length === 0 ? (
          <p className="p-6 text-sm text-stone-500">
            Todavía no hay compras importadas.
          </p>
        ) : (
          <div className="max-h-[36rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-4 py-2">Proveedor</th>
                  <th className="px-4 py-2 text-right">Compras</th>
                  <th className="px-4 py-2">Unidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {lista.map(([cuit, p]) => (
                  <tr
                    key={cuit}
                    className={
                      unidades.proveedores[cuit] ? undefined : "bg-amber-50/60"
                    }
                  >
                    <td className="px-4 py-2">
                      <div className="max-w-72 truncate font-medium">
                        {p.nombre || "—"}
                      </div>
                      <div className="text-xs text-stone-500">
                        {cuitConGuiones(cuit)}
                      </div>
                    </td>
                    <td className="cifra px-4 py-2">
                      {pesos(p.total)}
                      <div className="text-xs text-stone-500">
                        {p.cantidad} comprobantes
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <select
                        aria-label={`Unidad de ${p.nombre}`}
                        value={unidades.proveedores[cuit] ?? ""}
                        onChange={(e) =>
                          onAsignarProveedor(cuit, e.target.value || null)
                        }
                        className="rounded-md border border-stone-300 bg-white px-2 py-1"
                      >
                        <option value="">Sin asignar</option>
                        {unidades.unidades.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.nombre}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
