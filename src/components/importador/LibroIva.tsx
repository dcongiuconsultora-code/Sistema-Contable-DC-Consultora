"use client";

import { Fragment, useState } from "react";
import { queHacer } from "@/lib/arca/advertencias";
import type { Comprobante } from "@/lib/arca/tipos";
import { claveTasa, totalesLibro } from "@/lib/iva/liquidacion";
import { cuitConGuiones, fechaCorta, pesos, tasaTexto } from "@/lib/formato";

interface Props {
  titulo: string;
  comprobantes: Comprobante[];
  /** Sin columnas de IVA (monotributistas: solo facturas y totales). */
  simple?: boolean;
  /** Botón por comprobante: registrar su cobro o su pago. */
  accion?: { texto: string; onClick: (c: Comprobante) => void };
}

function BotonAccion({
  c,
  accion,
}: {
  c: Comprobante;
  accion: Props["accion"];
}) {
  if (!accion || c.total <= 0) return null;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        accion.onClick(c);
      }}
      className="whitespace-nowrap rounded-md border border-marca px-2 py-0.5 text-xs font-medium text-marca hover:bg-marca-claro"
    >
      {accion.texto}
    </button>
  );
}

function numeroComprobante(c: Comprobante) {
  const pv = String(c.puntoVenta).padStart(5, "0");
  const n = String(c.numeroDesde).padStart(8, "0");
  return `${pv}-${n}`;
}

function ListaSimple({ titulo, comprobantes, accion }: Props) {
  const total = comprobantes.reduce((s, c) => s + c.total, 0);
  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <h3 className="border-b border-stone-200 px-4 py-3 font-semibold">
        {titulo}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Comprobante</th>
              <th className="px-3 py-2">Cliente / proveedor</th>
              <th className="px-3 py-2 text-right">Importe</th>
              {accion && <th />}
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {comprobantes.map((c) => (
              <tr key={c.fila}>
                <td className="whitespace-nowrap px-3 py-2">
                  {fechaCorta(c.fecha)}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  <div>{c.tipoNombre}</div>
                  <div className="text-xs text-stone-500">
                    {numeroComprobante(c)}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="max-w-72 truncate">
                    {c.contraparte ||
                      (c.cuitContraparte ? "—" : "Consumidor final")}
                  </div>
                  <div className="text-xs text-stone-500">
                    {cuitConGuiones(c.cuitContraparte)}
                  </div>
                </td>
                <td className="cifra px-3 py-2 font-medium">
                  {pesos(c.total)}
                </td>
                {accion && (
                  <td className="px-3 py-2 text-right">
                    <BotonAccion c={c} accion={accion} />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-200 bg-stone-50 font-semibold">
            <tr>
              <td className="px-3 py-2" colSpan={3}>
                Total ({comprobantes.length} comprobantes)
              </td>
              <td className="cifra px-3 py-2">{pesos(total)}</td>
              {accion && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** Renglón desplegado con los motivos para revisar un comprobante. */
function DetalleRevisar({ c, columnas }: { c: Comprobante; columnas: number }) {
  return (
    <tr className="bg-amber-50/60">
      <td colSpan={columnas} className="px-4 py-2 text-xs">
        {c.advertencias.map((a) => (
          <div key={a} className="mb-1">
            <div className="font-medium text-amber-800">⚠ {a}</div>
            <div className="text-stone-700">Qué hacer: {queHacer(a)}</div>
          </div>
        ))}
      </td>
    </tr>
  );
}

export function LibroIva({ titulo, comprobantes, simple, accion }: Props) {
  const [abiertos, setAbiertos] = useState<Set<number>>(new Set());
  const [soloRevisar, setSoloRevisar] = useState(false);
  const paraRevisar = comprobantes.filter((c) => c.advertencias.length).length;
  const alternar = (fila: number) => {
    const n = new Set(abiertos);
    if (n.has(fila)) n.delete(fila);
    else n.add(fila);
    setAbiertos(n);
  };
  const visibles = soloRevisar
    ? comprobantes.filter((c) => c.advertencias.length)
    : comprobantes;
  if (simple && comprobantes.length)
    return (
      <ListaSimple
        titulo={titulo}
        comprobantes={comprobantes}
        accion={accion}
      />
    );
  const barraRevisar = paraRevisar > 0 && (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
      <span>
        ⚠ {paraRevisar} {paraRevisar === 1 ? "comprobante" : "comprobantes"}{" "}
        para revisar: tocá la fila para ver el motivo y qué hacer.
      </span>
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          checked={soloRevisar}
          onChange={(e) => setSoloRevisar(e.target.checked)}
        />
        Ver solo esos
      </label>
    </div>
  );
  const totales = totalesLibro(comprobantes);
  const tasas = [...totales.porTasa.keys()].sort((a, b) =>
    b === "s/d" ? -1 : a === "s/d" ? 1 : Number(b) - Number(a),
  );

  if (comprobantes.length === 0) {
    return (
      <p className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-500">
        No hay comprobantes en este período.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <h3 className="border-b border-stone-200 px-4 py-3 font-semibold">
        {titulo}
      </h3>
      {barraRevisar}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Comprobante</th>
              <th className="px-3 py-2">Contraparte</th>
              {tasas.map((t) => (
                <th key={t} className="px-3 py-2 text-right" colSpan={2}>
                  {tasaTexto(t)}
                </th>
              ))}
              <th className="px-3 py-2 text-right">No grav./Exento</th>
              <th className="px-3 py-2 text-right">Otros trib.</th>
              <th className="px-3 py-2 text-right">Total</th>
              {accion && <th />}
            </tr>
            <tr className="text-[10px]">
              <th colSpan={3} />
              {tasas.map((t) => [
                <th key={`${t}n`} className="px-3 pb-2 text-right font-normal">
                  Neto
                </th>,
                <th key={`${t}i`} className="px-3 pb-2 text-right font-normal">
                  IVA
                </th>,
              ])}
              <th colSpan={accion ? 4 : 3} />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {visibles.map((c) => {
              const porTasa = new Map(
                c.alicuotas.map((a) => [claveTasa(a.tasa), a]),
              );
              const revisar = c.advertencias.length > 0;
              return (
                <Fragment key={c.fila}>
                  <tr
                    className={
                      revisar
                        ? "cursor-pointer bg-amber-50 hover:bg-amber-100"
                        : undefined
                    }
                    onClick={revisar ? () => alternar(c.fila) : undefined}
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {fechaCorta(c.fecha)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <div>{c.tipoNombre}</div>
                      <div className="text-xs text-stone-500">
                        {numeroComprobante(c)}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="max-w-56 truncate">
                        {c.contraparte ||
                          (c.cuitContraparte ? "—" : "Consumidor final")}
                      </div>
                      <div className="text-xs text-stone-500">
                        {cuitConGuiones(c.cuitContraparte)}
                        {revisar && (
                          <span className="ml-2 font-medium text-amber-700 underline">
                            ⚠ revisar {abiertos.has(c.fila) ? "▴" : "▾"}
                          </span>
                        )}
                      </div>
                    </td>
                    {tasas.map((t) => [
                      <td key={`${t}n`} className="cifra px-3 py-2">
                        {porTasa.has(t) ? pesos(porTasa.get(t)!.neto) : ""}
                      </td>,
                      <td key={`${t}i`} className="cifra px-3 py-2">
                        {porTasa.has(t) ? pesos(porTasa.get(t)!.iva) : ""}
                      </td>,
                    ])}
                    <td className="cifra px-3 py-2">
                      {c.noGravado + c.exento
                        ? pesos(c.noGravado + c.exento)
                        : ""}
                    </td>
                    <td className="cifra px-3 py-2">
                      {c.otrosTributos ? pesos(c.otrosTributos) : ""}
                    </td>
                    <td className="cifra px-3 py-2 font-medium">
                      {pesos(c.total)}
                    </td>
                    {accion && (
                      <td className="px-3 py-2 text-right">
                        <BotonAccion c={c} accion={accion} />
                      </td>
                    )}
                  </tr>
                  {revisar && abiertos.has(c.fila) && (
                    <DetalleRevisar
                      c={c}
                      columnas={6 + tasas.length * 2 + (accion ? 1 : 0)}
                    />
                  )}
                </Fragment>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-stone-200 bg-stone-50 font-semibold">
            <tr>
              <td className="px-3 py-2" colSpan={3}>
                Totales ({totales.cantidad})
              </td>
              {tasas.map((t) => [
                <td key={`${t}n`} className="cifra px-3 py-2">
                  {pesos(totales.porTasa.get(t)!.neto)}
                </td>,
                <td key={`${t}i`} className="cifra px-3 py-2">
                  {pesos(totales.porTasa.get(t)!.iva)}
                </td>,
              ])}
              <td className="cifra px-3 py-2">
                {pesos(totales.noGravado + totales.exento)}
              </td>
              <td className="cifra px-3 py-2">
                {pesos(totales.otrosTributos)}
              </td>
              <td className="cifra px-3 py-2">{pesos(totales.total)}</td>
              {accion && <td />}
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
