"use client";

import { useMemo, useState } from "react";
import type { Asiento } from "@/lib/contabilidad/diario";
import type { EstadosContables } from "@/lib/contabilidad/estados";
import { finDeEjercicio } from "@/lib/contabilidad/cierre";
import type { SaldosIniciales } from "@/lib/contabilidad/indicadores";
import { fechaCorta, pesos } from "@/lib/formato";
import { nombreCuenta } from "@/lib/plan/plan";

function TablaAsiento({ a, abierto }: { a: Asiento; abierto?: boolean }) {
  const debe = a.lineas.reduce((s, l) => s + l.debe, 0);
  const haber = a.lineas.reduce((s, l) => s + l.haber, 0);
  return (
    <details
      open={abierto}
      className="rounded-xl border border-stone-200 bg-white p-4 text-sm shadow-sm"
    >
      <summary className="cursor-pointer font-semibold">
        {a.descripcion}{" "}
        <span className="font-normal text-stone-500">
          · {fechaCorta(a.fecha)} · {a.lineas.length} cuentas
        </span>
      </summary>
      <table className="mt-3 w-full">
        <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
          <tr>
            <th className="py-1">Cuenta</th>
            <th className="w-36 py-1 text-right">Debe</th>
            <th className="w-36 py-1 text-right">Haber</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-stone-100">
          {a.lineas.map((l, i) => (
            <tr key={`${l.cuenta}-${i}`}>
              <td className={`py-1 ${l.haber ? "pl-8" : ""}`}>
                <span className="text-stone-400 tabular-nums">{l.cuenta}</span>{" "}
                {l.nombre}
              </td>
              <td className="cifra py-1">{l.debe ? pesos(l.debe) : ""}</td>
              <td className="cifra py-1">{l.haber ? pesos(l.haber) : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="font-semibold">
          <tr className="border-t border-stone-300">
            <td className="py-1">Totales</td>
            <td className="cifra py-1">{pesos(debe)}</td>
            <td className="cifra py-1">{pesos(haber)}</td>
          </tr>
        </tfoot>
      </table>
    </details>
  );
}

/**
 * Cierre del ejercicio: muestra los asientos de ajuste, la refundición de resultados y el
 * asiento de cierre, y deja abrir el ejercicio siguiente con los saldos de cierre.
 */
export function CierreEjercicio({
  e,
  onIniciales,
  puedeCerrar,
}: {
  e: EstadosContables;
  onIniciales?: (s: SaldosIniciales) => void;
  puedeCerrar: boolean;
}) {
  const f = useMemo(() => finDeEjercicio(e), [e]);
  const [listo, setListo] = useState<string | null>(null);
  const anual = e.cierre >= anioDespues(e.cierreAnterior);
  // Cuentas que cierran con saldo al revés (por ejemplo, retenciones descontadas en la DDJJ que
  // nunca se registraron al cobrar): conviene revisarlas antes de cerrar.
  const alReves = Object.entries(f.siguiente.saldos).filter(([, v]) => v < 0);

  return (
    <div className="space-y-4">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-stone-500">Resultado del ejercicio</div>
          <div
            className={`cifra text-xl font-semibold ${f.resultado < 0 ? "text-red-700" : "text-emerald-700"}`}
          >
            {pesos(f.resultado)}
          </div>
          <div className="text-xs text-stone-500">
            {f.resultado < 0 ? "Pérdida" : "Ganancia"}
            {e.enMonedaHomogenea ? " · en moneda de cierre" : " · histórico"}
          </div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-stone-500">Período</div>
          <div className="font-semibold">
            {fechaCorta(e.inicio)} al {fechaCorta(e.cierre)}
          </div>
          <div className="text-xs text-stone-500">
            {anual ? "Ejercicio completo" : "Cierre intermedio (no se cierra)"}
          </div>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-stone-500">Control</div>
          <div
            className={`font-semibold ${e.diferencia === 0 ? "text-emerald-700" : "text-amber-700"}`}
          >
            {e.diferencia === 0
              ? "✓ El balance cierra"
              : `Diferencia ${pesos(e.diferencia)}`}
          </div>
        </div>
      </section>

      {alReves.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <h3 className="font-semibold">
            ⚠ Para revisar: cuentas con saldo al revés
          </h3>
          <p className="mt-1">
            Suele pasar cuando en la DDJJ se descuentan retenciones o
            percepciones que no se registraron al cobrar o en el banco. Revisá
            el mayor de cada una antes de cerrar.
          </p>
          <ul className="mt-2 list-disc pl-5">
            {alReves.map(([c, v]) => (
              <li key={c}>
                <span className="tabular-nums text-stone-500">{c}</span>{" "}
                {nombreCuenta(c)}: <span className="cifra">{pesos(v)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-stone-600">
        Orden de los asientos al {fechaCorta(e.cierre)}: primero los ajustes
        (inflación RT 6 e inventario final), después la refundición de las
        cuentas de resultado contra “Resultado del ejercicio” y por último el
        cierre de las cuentas patrimoniales. Con estos saldos queda armado el
        balance.
      </p>
      {f.ajustes.map((a, i) => (
        <TablaAsiento key={`aj-${i}`} a={a} />
      ))}
      {f.refundicion && <TablaAsiento a={f.refundicion} abierto />}
      {f.cierre && <TablaAsiento a={f.cierre} />}

      {onIniciales && (
        <section className="rounded-xl border border-marca/30 bg-marca-claro p-5 text-sm">
          <h3 className="font-semibold">
            Cerrar el ejercicio y abrir el siguiente
          </h3>
          <p className="mt-1 max-w-3xl text-stone-700">
            Los saldos del cierre pasan a ser los saldos de inicio del ejercicio
            que empieza el día siguiente (el resultado queda en Resultados no
            asignados) y se arma solo el asiento de apertura. Antes, descargá el
            balance en Excel desde “Balance y estados”.
          </p>
          {listo ? (
            <p className="mt-3 font-medium text-emerald-800">✓ {listo}</p>
          ) : (
            <button
              type="button"
              disabled={!puedeCerrar || !anual || e.diferencia !== 0}
              onClick={() => {
                if (
                  !confirm(
                    `¿Cerrar el ejercicio al ${fechaCorta(e.cierre)}? Los saldos de inicio pasan a ser los del cierre.`,
                  )
                )
                  return;
                onIniciales(f.siguiente);
                setListo(
                  `Ejercicio cerrado. El nuevo empieza el día siguiente al ${fechaCorta(e.cierre)} con ${Object.keys(f.siguiente.saldos).length} cuentas.`,
                );
              }}
              className="mt-3 rounded-md bg-marca px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-40"
            >
              Cerrar el ejercicio y abrir el siguiente
            </button>
          )}
          {!anual && (
            <p className="mt-2 text-xs text-stone-600">
              Es un balance intermedio: se puede ver y descargar, pero para
              cerrar el ejercicio la fecha tiene que ser la de cierre anual.
            </p>
          )}
          {anual && e.diferencia !== 0 && (
            <p className="mt-2 text-xs text-amber-800">
              Para cerrar, el balance tiene que cuadrar.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function anioDespues(fecha: string) {
  const d = new Date(`${fecha}T12:00:00Z`);
  return new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth() + 1, 0))
    .toISOString()
    .slice(0, 10);
}
