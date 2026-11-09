"use client";

import { Fragment, useMemo, useState } from "react";
import type { Asiento } from "@/lib/contabilidad/diario";
import type { SaldosIniciales } from "@/lib/contabilidad/indicadores";
import { cajaDiaria } from "@/lib/contabilidad/sumas-saldos";
import { fechaCorta, pesos } from "@/lib/formato";
import { nombreCuenta, PLAN_MODELO } from "@/lib/plan/plan";
import type { ConfigUnidades } from "@/lib/unidades/unidades";

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function primeroDelMes() {
  return `${hoy().slice(0, 8)}01`;
}

const CUENTAS_CAJA = PLAN_MODELO.filter(
  (c) => c.imputable && c.codigo.startsWith("1.1.01."),
);

/** Flujo de fondos diario: cuánta plata entró y salió cada día y cuánto quedó. */
export function CajaDiaria({
  asientos,
  iniciales,
  unidades,
}: {
  asientos: Asiento[];
  iniciales: SaldosIniciales;
  unidades: ConfigUnidades;
}) {
  const [desde, setDesde] = useState(primeroDelMes());
  const [hasta, setHasta] = useState(hoy());
  const [cuenta, setCuenta] = useState("");
  const [unidad, setUnidad] = useState<string>("todas");
  const [abierto, setAbierto] = useState<string | null>(null);

  const usadas = useMemo(() => {
    const s = new Set(Object.keys(iniciales.saldos));
    for (const a of asientos) for (const l of a.lineas) s.add(l.cuenta);
    return CUENTAS_CAJA.filter((c) => s.has(c.codigo));
  }, [asientos, iniciales]);

  const caja = useMemo(
    () =>
      cajaDiaria(
        asientos,
        iniciales,
        desde,
        hasta,
        cuenta ? [cuenta] : [],
        unidad === "todas"
          ? undefined
          : unidad === "compartido"
            ? null
            : unidad,
      ),
    [asientos, iniciales, desde, hasta, cuenta, unidad],
  );
  const maximo = Math.max(
    1,
    ...caja.dias.map((d) => Math.max(d.entradas, d.salidas)),
  );

  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-semibold">Caja y bancos día por día</h1>
        <p className="mt-1 max-w-3xl text-stone-600">
          Cuánta plata entró y salió cada día y con cuánto quedaste, sumando
          caja, bancos y billeteras (o la cuenta que elijas). Sale de los cobros
          y pagos cargados y del resumen del banco.
        </p>
      </section>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="text-stone-600">Desde</span>
          <input
            id="caja-desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="mt-1 block rounded-md border border-stone-300 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">Hasta</span>
          <input
            id="caja-hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="mt-1 block rounded-md border border-stone-300 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">Cuenta</span>
          <select
            id="caja-cuenta"
            value={cuenta}
            onChange={(e) => setCuenta(e.target.value)}
            className="mt-1 block rounded-md border border-stone-300 bg-white px-2 py-1.5"
          >
            <option value="">Caja y bancos (todo)</option>
            {(usadas.length ? usadas : CUENTAS_CAJA).map((c) => (
              <option key={c.codigo} value={c.codigo}>
                {c.nombre}
              </option>
            ))}
          </select>
        </label>
        {unidades.unidades.length > 0 && (
          <label className="block text-sm">
            <span className="text-stone-600">Unidad</span>
            <select
              id="caja-unidad"
              value={unidad}
              onChange={(e) => setUnidad(e.target.value)}
              className="mt-1 block rounded-md border border-stone-300 bg-white px-2 py-1.5"
            >
              <option value="todas">Toda la empresa</option>
              {unidades.unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
              <option value="compartido">Compartido</option>
            </select>
          </label>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {(
          [
            ["Saldo al empezar", caja.inicial, "text-stone-900"],
            ["Entró", caja.entradas, "text-emerald-700"],
            ["Salió", -caja.salidas, "text-red-700"],
            ["Saldo al terminar", caja.final, "text-marca"],
          ] as const
        ).map(([t, v, color]) => (
          <div
            key={t}
            className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
          >
            <div className="text-sm text-stone-500">{t}</div>
            <div className={`text-xl font-semibold tabular-nums ${color}`}>
              {pesos(v)}
            </div>
          </div>
        ))}
      </div>
      {unidad !== "todas" && (
        <p className="text-xs text-stone-500">
          Por unidad se muestran solo los movimientos del período: el saldo de
          inicio es de toda la empresa.
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        {caja.dias.length === 0 ? (
          <p className="p-6 text-sm text-stone-500">
            No hay movimientos de caja ni bancos en esas fechas.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-2">Día</th>
                <th className="hidden px-3 py-2 sm:table-cell" />
                <th className="px-3 py-2 text-right">Entró</th>
                <th className="px-3 py-2 text-right">Salió</th>
                <th className="px-3 py-2 text-right">Saldo</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {caja.dias.map((d) => (
                <Fragment key={d.fecha}>
                  <tr
                    className="cursor-pointer hover:bg-stone-50"
                    onClick={() =>
                      setAbierto(abierto === d.fecha ? null : d.fecha)
                    }
                  >
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      <span aria-hidden className="mr-1 text-stone-400">
                        {abierto === d.fecha ? "▾" : "▸"}
                      </span>
                      {fechaCorta(d.fecha)}
                    </td>
                    <td className="hidden w-1/3 px-3 py-2 sm:table-cell">
                      <div className="flex h-2 gap-0.5">
                        <div
                          className="rounded-sm bg-emerald-600"
                          style={{ width: `${(d.entradas / maximo) * 50}%` }}
                        />
                        <div
                          className="rounded-sm bg-red-600"
                          style={{ width: `${(d.salidas / maximo) * 50}%` }}
                        />
                      </div>
                    </td>
                    <td className="cifra px-3 py-2 text-emerald-700">
                      {d.entradas ? pesos(d.entradas) : ""}
                    </td>
                    <td className="cifra px-3 py-2 text-red-700">
                      {d.salidas ? pesos(d.salidas) : ""}
                    </td>
                    <td
                      className={`cifra px-3 py-2 font-medium ${d.saldo < 0 ? "text-red-700" : ""}`}
                    >
                      {pesos(d.saldo)}
                    </td>
                  </tr>
                  {abierto === d.fecha &&
                    d.movimientos.map((m, i) => (
                      <tr
                        key={i}
                        className="bg-stone-50/60 text-xs text-stone-600"
                      >
                        <td className="px-3 py-1 pl-8" colSpan={2}>
                          <span className="mr-1.5 rounded bg-white px-1.5 py-0.5">
                            {m.origen}
                          </span>
                          {m.descripcion} · {m.cuenta}
                        </td>
                        <td className="cifra px-3 py-1">
                          {m.importe > 0 ? pesos(m.importe) : ""}
                        </td>
                        <td className="cifra px-3 py-1">
                          {m.importe < 0 ? pesos(-m.importe) : ""}
                        </td>
                        <td />
                      </tr>
                    ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </section>
      {cuenta && (
        <p className="text-xs text-stone-500">
          Mostrando solo {nombreCuenta(cuenta)}.
        </p>
      )}
    </div>
  );
}
