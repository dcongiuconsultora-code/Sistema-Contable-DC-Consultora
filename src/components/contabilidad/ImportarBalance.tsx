"use client";

import { useMemo, useState } from "react";
import {
  asientoApertura,
  type BalanceLeido,
  leerBalanceCerrado,
  type RenglonBalance,
  saldosDeApertura,
  totalesApertura,
} from "@/lib/contabilidad/apertura";
import type { SaldosIniciales } from "@/lib/contabilidad/indicadores";
import type { Repositorio } from "@/lib/datos/repositorio";
import { fechaCorta, pesos } from "@/lib/formato";
import { nombreCuenta, PLAN_MODELO } from "@/lib/plan/plan";

const IMPUTABLES = PLAN_MODELO.filter((c) => c.imputable);
const clave = (r: RenglonBalance) => `${r.origen}|${r.concepto}`;

/**
 * Importa el balance cerrado del ejercicio anterior (modelo RT 54 o sumas y saldos): vincula cada
 * renglón con una cuenta del plan, controla que cierre y lo guarda como saldos de inicio.
 */
export function ImportarBalance({
  repo,
  empresaId,
  iniciales,
  onIniciales,
}: {
  repo?: Repositorio;
  empresaId: string;
  iniciales: SaldosIniciales;
  onIniciales: (s: SaldosIniciales) => void;
}) {
  const [leido, setLeido] = useState<BalanceLeido | null>(null);
  const [renglones, setRenglones] = useState<RenglonBalance[]>([]);
  const [fecha, setFecha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);

  async function leer(archivo: File) {
    setError(null);
    setListo(null);
    setLeyendo(true);
    try {
      const { leerHojasXlsx } = await import("@/lib/arca/leer-archivo");
      const b = leerBalanceCerrado(
        await leerHojasXlsx(await archivo.arrayBuffer()),
      );
      if (!b || !b.renglones.length)
        throw new Error(
          "No reconocí el balance. Tiene que ser el modelo de estados contables (RT 54) o un Excel de sumas y saldos con columnas Cuenta y Saldo (o Deudor y Acreedor).",
        );
      // Lo que se vinculó a mano en el balance anterior se recuerda.
      const anterior = repo
        ? await repo.ultimoCierre(empresaId).catch(() => null)
        : null;
      const recordado = anterior?.mapeoApertura ?? {};
      setRenglones(
        b.renglones.map((r) => ({
          ...r,
          cuenta: recordado[clave(r)] ?? r.cuenta,
        })),
      );
      setLeido(b);
      setFecha(b.fechaCierre ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLeyendo(false);
    }
  }

  const totales = totalesApertura(renglones);
  const sinCuenta = renglones.filter((r) => !r.cuenta).length;
  const nuevos = useMemo(
    () => (fecha ? saldosDeApertura(renglones, fecha) : null),
    [renglones, fecha],
  );
  const asiento = nuevos ? asientoApertura(nuevos) : null;
  const puedeGuardar = Boolean(fecha) && !sinCuenta && totales.diferencia === 0;

  async function guardar() {
    if (!nuevos) return;
    if (
      Object.keys(iniciales.saldos).length &&
      !confirm(
        "Ya hay saldos de inicio cargados. ¿Reemplazarlos por los del balance importado?",
      )
    )
      return;
    onIniciales(nuevos);
    if (repo) {
      const mapeoApertura = Object.fromEntries(
        renglones.filter((r) => r.cuenta).map((r) => [clave(r), r.cuenta!]),
      );
      const previo =
        (await repo.cierre(empresaId, fecha).catch(() => null)) ?? {};
      await repo
        .guardarCierre(empresaId, fecha, { ...previo, mapeoApertura })
        .catch(() => {});
    }
    setListo(
      `Listo: se cargaron ${Object.keys(nuevos.saldos).length} cuentas como saldos de inicio al ${fechaCorta(fecha)}. El ejercicio nuevo empieza el ${fechaCorta(asiento?.fecha ?? fecha)}.`,
    );
    setLeido(null);
  }

  return (
    <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">Importar el balance cerrado</h3>
          <p className="mt-1 max-w-2xl text-sm text-stone-600">
            Subí el balance del ejercicio anterior (el Excel de estados
            contables con el modelo RT 54, o un Excel de sumas y saldos). Se
            toman los saldos de cada cuenta, se arma el asiento de apertura y el
            ejercicio nuevo arranca desde ahí.
          </p>
        </div>
        <label className="cursor-pointer rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:opacity-90">
          {leyendo ? "Leyendo…" : "Subir balance (Excel)"}
          <input
            id="balance-cerrado"
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) leer(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {listo && (
        <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-900">
          ✓ {listo}
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {leido && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-4 text-sm">
            <div>
              <div className="text-stone-500">Balance leído</div>
              <div className="font-medium">
                {leido.formato}
                {leido.empresa && ` · ${leido.empresa}`}
              </div>
            </div>
            <label className="block">
              <span className="text-stone-500">Fecha de cierre</span>
              <input
                id="balance-cerrado-fecha"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="mt-1 block rounded-md border border-stone-300 px-2 py-1"
              />
            </label>
            {leido.totalActivo !== null && (
              <div>
                <div className="text-stone-500">
                  Total del activo según el balance
                </div>
                <div className="font-medium tabular-nums">
                  {pesos(leido.totalActivo)}
                </div>
              </div>
            )}
          </div>

          <datalist id="cuentas-apertura">
            {IMPUTABLES.map((c) => (
              <option key={c.codigo} value={`${c.codigo} ${c.nombre}`} />
            ))}
          </datalist>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="py-1.5 pr-3">Del balance</th>
                  <th className="py-1.5 pr-3 text-right">Deudor</th>
                  <th className="py-1.5 pr-3 text-right">Acreedor</th>
                  <th className="py-1.5">Cuenta del plan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {renglones.map((r, i) => (
                  <tr
                    key={`${clave(r)}-${i}`}
                    className={r.cuenta ? undefined : "bg-amber-50"}
                  >
                    <td className="py-1.5 pr-3">
                      <div>{r.concepto}</div>
                      <div className="text-xs text-stone-400">{r.origen}</div>
                    </td>
                    <td className="cifra py-1.5 pr-3">
                      {r.lado === "deudor" ? pesos(r.importe) : ""}
                    </td>
                    <td className="cifra py-1.5 pr-3">
                      {r.lado === "acreedor" ? pesos(r.importe) : ""}
                    </td>
                    <td className="py-1.5">
                      <input
                        aria-label={`Cuenta para ${r.concepto}`}
                        list="cuentas-apertura"
                        defaultValue={
                          r.cuenta
                            ? `${r.cuenta} ${nombreCuenta(r.cuenta)}`
                            : ""
                        }
                        placeholder="Elegí la cuenta"
                        onChange={(e) => {
                          const codigo = e.target.value.trim().split(/\s+/)[0];
                          const valida = IMPUTABLES.some(
                            (c) => c.codigo === codigo,
                          );
                          setRenglones(
                            renglones.map((x, j) =>
                              j === i
                                ? { ...x, cuenta: valida ? codigo : null }
                                : x,
                            ),
                          );
                        }}
                        className={`w-full min-w-64 rounded-md border px-2 py-1 ${r.cuenta ? "border-stone-300" : "border-amber-400"}`}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="font-semibold">
                <tr className="border-t border-stone-300">
                  <td className="py-1.5">Totales</td>
                  <td className="cifra py-1.5 pr-3">{pesos(totales.deudor)}</td>
                  <td className="cifra py-1.5 pr-3">
                    {pesos(totales.acreedor)}
                  </td>
                  <td
                    className={`py-1.5 text-sm ${totales.diferencia === 0 ? "text-emerald-700" : "text-red-700"}`}
                  >
                    {totales.diferencia === 0
                      ? "✓ El balance cierra"
                      : `No cierra: diferencia ${pesos(totales.diferencia)}`}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {sinCuenta > 0 && (
            <p className="text-sm text-amber-700">
              Falta elegir la cuenta en {sinCuenta}{" "}
              {sinCuenta === 1 ? "renglón" : "renglones"} (marcados en
              amarillo).
            </p>
          )}

          {asiento && (
            <details className="rounded-lg border border-stone-200 p-3 text-sm">
              <summary className="cursor-pointer font-medium">
                Asiento de apertura del {fechaCorta(asiento.fecha)}
              </summary>
              <table className="mt-2 w-full">
                <tbody>
                  {asiento.lineas.map((l) => (
                    <tr key={l.cuenta}>
                      <td className={`py-0.5 ${l.haber ? "pl-8" : ""}`}>
                        <span className="text-stone-400 tabular-nums">
                          {l.cuenta}
                        </span>{" "}
                        {l.nombre}
                      </td>
                      <td className="cifra w-36 py-0.5">
                        {l.debe ? pesos(l.debe) : ""}
                      </td>
                      <td className="cifra w-36 py-0.5">
                        {l.haber ? pesos(l.haber) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={guardar}
              disabled={!puedeGuardar}
              className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Usar como saldos de inicio
            </button>
            <button
              type="button"
              onClick={() => setLeido(null)}
              className="rounded-md px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
