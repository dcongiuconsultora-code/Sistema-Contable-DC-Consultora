"use client";

import { Fragment, useState } from "react";
import type { Comprobante, Reparto } from "@/lib/arca/tipos";
import { cuitConGuiones, fechaCorta, pesos } from "@/lib/formato";
import {
  type ConfigUnidades,
  erroresReparto,
  nombreUnidad,
  unidadDeVenta,
} from "@/lib/unidades/unidades";

interface Props {
  unidades: ConfigUnidades;
  ventas: Comprobante[];
  compras: Comprobante[];
  onAsignarProveedor: (
    cuit: string,
    unidadId: string | null,
    reparto?: Reparto | null,
  ) => void;
  /** Elige la unidad de una factura puntual (proveedores que le venden a varias unidades). */
  onAsignarFactura?: (
    c: Comprobante,
    unidadId: string | null,
    reparto?: Reparto | null,
  ) => void;
}

const REPARTO = "__reparto";

/** Porcentaje de cada unidad para prorratear un proveedor o una factura. */
function EditorReparto({
  unidades,
  inicial,
  onGuardar,
  onCancelar,
}: {
  unidades: ConfigUnidades;
  inicial?: Reparto | null;
  onGuardar: (r: Reparto) => void;
  onCancelar: () => void;
}) {
  const [valores, setValores] = useState<Record<string, string>>(() => {
    if (inicial?.length)
      return Object.fromEntries(
        inicial.map((r) => [r.unidad, String(r.porcentaje)]),
      );
    // Por defecto, partes iguales.
    const parte = Math.round((100 / unidades.unidades.length) * 100) / 100;
    return Object.fromEntries(
      unidades.unidades.map((u) => [u.id, String(parte)]),
    );
  });
  const reparto: Reparto = unidades.unidades
    .map((u) => ({ unidad: u.id, porcentaje: Number(valores[u.id]) || 0 }))
    .filter((r) => r.porcentaje > 0);
  const total =
    Math.round(reparto.reduce((t, r) => t + r.porcentaje, 0) * 100) / 100;
  const errores =
    reparto.length < 2
      ? ["Elegí al menos dos unidades."]
      : erroresReparto(reparto);
  return (
    <div className="mt-2 rounded-lg border border-stone-200 bg-white p-2 text-xs">
      <div className="flex flex-wrap gap-2">
        {unidades.unidades.map((u) => (
          <label key={u.id} className="flex items-center gap-1">
            <span className="text-stone-600">{u.nombre}</span>
            <input
              aria-label={`Porcentaje de ${u.nombre}`}
              type="number"
              min={0}
              max={100}
              step="0.01"
              value={valores[u.id] ?? ""}
              onChange={(e) =>
                setValores({ ...valores, [u.id]: e.target.value })
              }
              className="w-16 rounded border border-stone-300 px-1 py-0.5 text-right"
            />
            %
          </label>
        ))}
      </div>
      <div
        className={`mt-1 ${errores.length ? "text-red-700" : "text-stone-500"}`}
      >
        {errores.length
          ? errores[0]
          : total < 100
            ? `Suma ${total} %: el ${Math.round((100 - total) * 100) / 100} % restante queda como compartido.`
            : "Suma 100 %."}
      </div>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          disabled={errores.length > 0}
          onClick={() => onGuardar(reparto)}
          className="rounded bg-marca px-2 py-0.5 font-medium text-white disabled:opacity-40"
        >
          Guardar prorrateo
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="text-stone-500 hover:underline"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** A qué unidad va cada proveedor, y qué puntos de venta todavía no tienen unidad. */
export function AsignacionUnidades({
  unidades,
  ventas,
  compras,
  onAsignarProveedor,
  onAsignarFactura,
}: Props) {
  const [abierto, setAbierto] = useState<string | null>(null);
  /** Qué prorrateo se está editando: "p:<cuit>" (proveedor) o "f:<clave>" (factura). */
  const [repartiendo, setRepartiendo] = useState<string | null>(null);
  const claveF = (c: Comprobante) =>
    `${c.tipoCodigo}-${c.puntoVenta}-${c.numeroDesde}-${c.cuitContraparte}`;
  const textoReparto = (r: Reparto) =>
    r
      .map((x) => `${nombreUnidad(x.unidad, unidades)} ${x.porcentaje} %`)
      .join(" · ");
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
  // Pendiente: sin unidad de proveedor y con alguna factura sin unidad propia.
  const pendiente = (cuit: string) =>
    !unidades.proveedores[cuit] &&
    !unidades.repartos?.[cuit] &&
    compras.some(
      (c) => c.cuitContraparte === cuit && !c.unidad && !c.reparto?.length,
    );
  const sinAsignar = lista.filter(([cuit]) => pendiente(cuit)).length;

  const puntosVenta = new Map<number, number>();
  for (const v of ventas)
    puntosVenta.set(v.puntoVenta, (puntosVenta.get(v.puntoVenta) ?? 0) + 1);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_2fr]">
      <section className="h-fit rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
        <h3 className="font-semibold">Ventas por punto de venta</h3>
        <p className="mb-3 text-sm text-stone-500">
          Los puntos de venta de cada unidad se cargan arriba.
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

      <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
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
                {lista.map(([cuit, p]) => {
                  const facturas = compras
                    .filter((c) => c.cuitContraparte === cuit)
                    .sort((a, b) => b.fecha.localeCompare(a.fecha));
                  const aMano = facturas.filter((c) => c.unidad).length;
                  return (
                    <Fragment key={cuit}>
                      <tr
                        className={
                          unidades.proveedores[cuit]
                            ? undefined
                            : "bg-amber-50/60"
                        }
                      >
                        <td className="px-4 py-2">
                          <div className="max-w-72 truncate font-medium">
                            {p.nombre || "—"}
                          </div>
                          <div className="text-xs text-stone-500">
                            {cuitConGuiones(cuit)}
                          </div>
                          {onAsignarFactura && (
                            <button
                              type="button"
                              onClick={() =>
                                setAbierto(abierto === cuit ? null : cuit)
                              }
                              className="mt-0.5 text-xs font-medium text-marca hover:underline"
                            >
                              {abierto === cuit
                                ? "Ocultar facturas"
                                : `Ver facturas${aMano ? ` (${aMano} con unidad propia)` : ""} · elegir unidad por factura`}
                            </button>
                          )}
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
                            value={
                              unidades.repartos?.[cuit]
                                ? REPARTO
                                : (unidades.proveedores[cuit] ?? "")
                            }
                            onChange={(e) => {
                              if (e.target.value === REPARTO)
                                return setRepartiendo(`p:${cuit}`);
                              setRepartiendo(null);
                              onAsignarProveedor(cuit, e.target.value || null);
                            }}
                            className="rounded-md border border-stone-300 bg-white px-2 py-1"
                          >
                            <option value="">Sin asignar</option>
                            {unidades.unidades.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.nombre}
                              </option>
                            ))}
                            {unidades.unidades.length > 1 && (
                              <option value={REPARTO}>
                                Repartir entre unidades (prorrateo)…
                              </option>
                            )}
                          </select>
                          {unidades.repartos?.[cuit] &&
                            repartiendo !== `p:${cuit}` && (
                              <button
                                type="button"
                                onClick={() => setRepartiendo(`p:${cuit}`)}
                                className="mt-1 block text-left text-xs text-marca hover:underline"
                              >
                                {textoReparto(unidades.repartos[cuit])} ·
                                cambiar
                              </button>
                            )}
                          {repartiendo === `p:${cuit}` && (
                            <EditorReparto
                              unidades={unidades}
                              inicial={unidades.repartos?.[cuit]}
                              onGuardar={(r) => {
                                onAsignarProveedor(cuit, r[0].unidad, r);
                                setRepartiendo(null);
                              }}
                              onCancelar={() => setRepartiendo(null)}
                            />
                          )}
                        </td>
                      </tr>

                      {abierto === cuit && (
                        <tr>
                          <td colSpan={3} className="bg-stone-50 px-4 py-2">
                            <p className="mb-2 text-xs text-stone-600">
                              Elegí la unidad de cada factura. Las que dejes en
                              “Como el proveedor” van a la unidad del proveedor
                              (o quedan sin unidad si el proveedor no tiene).
                            </p>
                            <table className="w-full text-xs">
                              <tbody className="divide-y divide-stone-200">
                                {facturas.map((c) => (
                                  <tr
                                    key={`${c.tipoCodigo}-${c.puntoVenta}-${c.numeroDesde}`}
                                  >
                                    <td className="py-1 pr-2">
                                      {fechaCorta(c.fecha)}
                                    </td>
                                    <td className="py-1 pr-2">
                                      {c.tipoNombre}{" "}
                                      {String(c.puntoVenta).padStart(5, "0")}-
                                      {String(c.numeroDesde).padStart(8, "0")}
                                    </td>
                                    <td className="cifra py-1 pr-2">
                                      {pesos(c.total)}
                                    </td>
                                    <td className="py-1">
                                      <select
                                        aria-label={`Unidad de la factura ${c.numeroDesde}`}
                                        value={
                                          c.reparto?.length
                                            ? REPARTO
                                            : (c.unidad ?? "")
                                        }
                                        onChange={(e) => {
                                          if (e.target.value === REPARTO)
                                            return setRepartiendo(
                                              `f:${claveF(c)}`,
                                            );
                                          setRepartiendo(null);
                                          onAsignarFactura?.(
                                            c,
                                            e.target.value || null,
                                          );
                                        }}
                                        className="rounded-md border border-stone-300 bg-white px-1.5 py-0.5"
                                      >
                                        <option value="">
                                          Como el proveedor
                                        </option>
                                        {unidades.unidades.map((u) => (
                                          <option key={u.id} value={u.id}>
                                            {u.nombre}
                                          </option>
                                        ))}
                                        {unidades.unidades.length > 1 && (
                                          <option value={REPARTO}>
                                            Repartir (prorrateo)…
                                          </option>
                                        )}
                                      </select>
                                      {c.reparto?.length &&
                                      repartiendo !== `f:${claveF(c)}` ? (
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setRepartiendo(`f:${claveF(c)}`)
                                          }
                                          className="ml-2 text-marca hover:underline"
                                        >
                                          {textoReparto(c.reparto)}
                                        </button>
                                      ) : null}
                                      {repartiendo === `f:${claveF(c)}` && (
                                        <EditorReparto
                                          unidades={unidades}
                                          inicial={
                                            c.reparto ??
                                            unidades.repartos?.[
                                              c.cuitContraparte
                                            ]
                                          }
                                          onGuardar={(r) => {
                                            onAsignarFactura?.(c, null, r);
                                            setRepartiendo(null);
                                          }}
                                          onCancelar={() =>
                                            setRepartiendo(null)
                                          }
                                        />
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
