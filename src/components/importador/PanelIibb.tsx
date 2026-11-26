"use client";

import type { Asiento } from "@/lib/contabilidad/diario";
import type { DatosIibb, PeriodoIibb } from "@/lib/impuestos/asientos";
import { asientoIibb } from "@/lib/impuestos/asientos";
import { fechaCorta, pesos } from "@/lib/formato";

/** Muestra el asiento que se genera solo, para que el estudio vea cómo queda en la contabilidad. */
export function AsientoPrevio({ asiento }: { asiento: Asiento | null }) {
  if (!asiento) return null;
  return (
    <details className="mt-4 rounded-lg border border-stone-200 p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Asiento automático en la contabilidad
      </summary>
      <table className="mt-2 w-full">
        <tbody>
          {asiento.lineas.map((l, i) => (
            <tr key={`${l.cuenta}-${i}`}>
              <td className={`py-0.5 ${l.haber ? "pl-8" : ""}`}>
                <span className="text-stone-400 tabular-nums">{l.cuenta}</span>{" "}
                {l.nombre}
              </td>
              <td className="cifra w-32 py-0.5">
                {l.debe ? pesos(l.debe) : ""}
              </td>
              <td className="cifra w-32 py-0.5">
                {l.haber ? pesos(l.haber) : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Detalle por jurisdicción de la DDJJ de Convenio Multilateral. */
function Jurisdicciones({ datos }: { datos: DatosIibb }) {
  const filas = datos.jurisdicciones ?? [];
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="py-1.5 pr-3">Jurisdicción</th>
            <th className="py-1.5 pr-3 text-right">Determinado</th>
            <th className="py-1.5 pr-3 text-right">Deducciones</th>
            <th className="py-1.5 pr-3 text-right">Suman</th>
            <th className="py-1.5 pr-3 text-right">A favor</th>
            <th className="py-1.5 text-right">A pagar</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {filas.map((j) => (
            <tr key={j.codigo}>
              <td className="py-1.5 pr-3">
                <span className="text-stone-400">{j.codigo}</span> {j.nombre}
              </td>
              <td className="cifra py-1.5 pr-3">{pesos(j.determinado)}</td>
              <td className="cifra py-1.5 pr-3">{pesos(j.restan)}</td>
              <td className="cifra py-1.5 pr-3">{pesos(j.suman)}</td>
              <td className="cifra py-1.5 pr-3">
                {pesos(j.aFavorContribuyente)}
              </td>
              <td className="cifra py-1.5">{pesos(j.aPagar)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="font-semibold">
          <tr className="border-t border-stone-300">
            <td className="py-1.5">Total</td>
            <td className="cifra py-1.5 pr-3">
              {pesos(filas.reduce((t, j) => t + j.determinado, 0))}
            </td>
            <td className="cifra py-1.5 pr-3">
              {pesos(datos.deduccionesDdjj ?? 0)}
            </td>
            <td className="cifra py-1.5 pr-3">
              {pesos(filas.reduce((t, j) => t + j.suman, 0))}
            </td>
            <td className="cifra py-1.5 pr-3">
              {pesos(datos.saldoAFavorDdjj ?? 0)}
            </td>
            <td className="cifra py-1.5">{pesos(datos.aPagarDdjj ?? 0)}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-xs text-stone-500">
        Las deducciones vienen juntas en la DDJJ: en el asiento se toma primero
        el saldo a favor anterior, después las percepciones y el SIRCREB de los
        archivos subidos, y el resto como retenciones.
      </p>
    </div>
  );
}

const CAMPOS: [keyof DatosIibb, string][] = [
  ["determinado", "Impuesto determinado (total de la DDJJ)"],
  ["retenciones", "Retenciones sufridas"],
  ["percepciones", "Percepciones sufridas"],
  ["sircreb", "SIRCREB (retenciones bancarias)"],
];

/**
 * DDJJ mensual de Ingresos Brutos: el estudio carga el impuesto determinado; las deducciones se
 * proponen desde Mis Retenciones y SIRCREB. El saldo a favor pasa solo al mes siguiente.
 */
export function PanelIibb({
  periodo,
  guardada,
  cadena,
  desdeArchivos,
  puedeEditar,
  onGuardar,
}: {
  periodo: string;
  guardada?: DatosIibb;
  /** El mes ya encadenado (solo si hay DDJJ cargada). */
  cadena?: PeriodoIibb;
  /** Saldo a favor que viene del mes anterior según la cadena (para el primer cálculo). */
  desdeArchivos: { retenciones: number; percepciones: number; sircreb: number };
  puedeEditar: boolean;
  onGuardar: (d: DatosIibb | null) => void;
}) {
  const datos: DatosIibb = guardada ?? {
    determinado: 0,
    ...desdeArchivos,
  };
  const bloqueado = !puedeEditar || Boolean(guardada?.presentada);
  const cambiar = (
    campo: keyof DatosIibb,
    valor: number | boolean | undefined,
  ) => {
    const d = { ...datos, [campo]: valor };
    if (valor === undefined) delete d[campo];
    onGuardar(d);
  };

  return (
    <div className="rounded-2xl border border-stone-200/80 bg-white p-5 text-sm shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">Ingresos Brutos del mes</h3>
          <p className="mt-1 max-w-2xl text-stone-500">
            Cargá el impuesto determinado de la DDJJ (CM03 / SIFERE o la de la
            provincia). Las retenciones, percepciones y SIRCREB se completan con
            Mis Retenciones y el archivo SIRCREB, y el saldo a favor pasa solo
            al mes siguiente. Al cargarla se genera el asiento.
          </p>
        </div>
        {guardada &&
          puedeEditar &&
          (!guardada.presentada || guardada.origen) && (
            <button
              type="button"
              onClick={() => {
                if (
                  confirm(
                    "¿Quitar la DDJJ de Ingresos Brutos de este mes y su asiento?",
                  )
                )
                  onGuardar(null);
              }}
              className="rounded-md px-2 py-1 text-stone-500 hover:bg-stone-100"
            >
              Borrar
            </button>
          )}
      </div>
      {datos.origen && (
        <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-emerald-900">
          ✓ Cargada desde la {datos.origen}
          {datos.fechaPresentacion
            ? `, presentada el ${fechaCorta(datos.fechaPresentacion)}`
            : ""}
          .
        </p>
      )}
      {datos.deduccionesDdjj !== undefined ? (
        <Jurisdicciones datos={datos} />
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CAMPOS.map(([campo, etiqueta]) => (
            <label key={campo} className="block">
              <span className="text-stone-700">{etiqueta}</span>
              <input
                id={`iibb-${campo}`}
                type="number"
                min={0}
                step="0.01"
                disabled={bloqueado}
                value={(datos[campo] as number) || ""}
                placeholder="0,00"
                onChange={(e) => cambiar(campo, Number(e.target.value) || 0)}
                className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-right tabular-nums focus:border-marca focus:outline-none disabled:bg-stone-50"
              />
              {campo !== "determinado" &&
                guardada &&
                desdeArchivos[campo as "retenciones"] !== 0 &&
                desdeArchivos[campo as "retenciones"] !== datos[campo] && (
                  <button
                    type="button"
                    disabled={bloqueado}
                    onClick={() =>
                      cambiar(campo, desdeArchivos[campo as "retenciones"])
                    }
                    className="mt-1 text-xs text-marca underline"
                  >
                    Usar lo de los archivos (
                    {pesos(desdeArchivos[campo as "retenciones"])})
                  </button>
                )}
            </label>
          ))}
        </div>
      )}
      {cadena && (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg bg-stone-50 px-3 py-2">
            <div className="text-xs text-stone-500">
              Saldo a favor anterior
              {cadena.arrastradoDe ? " (arrastrado)" : ""}
            </div>
            <div className="cifra font-medium">
              {pesos(cadena.saldoAFavorAnterior)}
            </div>
          </div>
          <div className="rounded-lg bg-marca px-3 py-2 text-white">
            <div className="text-xs opacity-80">Saldo a pagar</div>
            <div className="cifra text-lg font-bold">
              {pesos(cadena.aPagar)}
            </div>
          </div>
          <div className="rounded-lg bg-stone-50 px-3 py-2">
            <div className="text-xs text-stone-500">
              Saldo a favor (pasa al mes siguiente)
            </div>
            <div className="cifra font-medium">{pesos(cadena.saldoAFavor)}</div>
          </div>
        </div>
      )}
      {!guardada && puedeEditar && (
        <button
          type="button"
          onClick={() => onGuardar(datos)}
          className="mt-4 rounded-md bg-marca px-4 py-2 font-medium text-white hover:opacity-90"
        >
          Cargar la DDJJ de {periodo.slice(5)}/{periodo.slice(0, 4)}
        </button>
      )}
      {guardada && puedeEditar && (
        <label className="mt-4 flex items-center gap-2">
          <input
            type="checkbox"
            checked={Boolean(guardada.presentada)}
            onChange={(e) => cambiar("presentada", e.target.checked)}
          />
          Presentada (queda fija)
        </label>
      )}
      {cadena && <AsientoPrevio asiento={asientoIibb(cadena)} />}
    </div>
  );
}
