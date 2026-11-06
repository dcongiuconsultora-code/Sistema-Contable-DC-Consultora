"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  agruparPorConcepto,
  type Clasificacion,
  clasificarMovimiento,
} from "@/lib/bancos/clasificar";
import { cuentaDelMovimiento } from "@/lib/movimientos/asiento";
import { conciliar } from "@/lib/movimientos/conciliar";
import { type Movimiento, TIPOS } from "@/lib/movimientos/tipos";
import { nombreCuenta } from "@/lib/plan/plan";
import { esResumenMacro, importarResumenMacro } from "@/lib/bancos/macro";
import type { MovimientoBancario, ResumenBancario } from "@/lib/bancos/tipos";
import { cuitConGuiones, fechaCorta, pesos } from "@/lib/formato";
import { leerPdf } from "@/lib/pdf/abrir";

interface Props {
  /** Resumen cargado desde afuera (por ejemplo, el de ejemplo). */
  archivoExterno?: File | null;
  /** Cobros y pagos que cargó el cliente: se cruzan con los movimientos del banco. */
  movimientosCliente?: Movimiento[];
}

type Filtro = "todos" | "revisar" | "automaticos";

async function leerResumen(archivo: File): Promise<ResumenBancario> {
  if (!archivo.name.toLowerCase().endsWith(".pdf"))
    throw new Error("Subí el resumen en PDF tal como lo descargás del banco.");
  const lineas = await leerPdf(archivo);
  if (esResumenMacro(lineas)) return importarResumenMacro(lineas);
  throw new Error(
    "Por ahora se leen resúmenes de Banco Macro. Galicia y BBVA Francés se agregan con un resumen de ejemplo de cada uno.",
  );
}

export function Bancos({ archivoExterno, movimientosCliente = [] }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [resumen, setResumen] = useState<ResumenBancario | null>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [cuentaElegida, setCuentaElegida] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>("revisar");

  async function procesar(archivo: File) {
    setCargando(true);
    setError(null);
    setNombre(archivo.name);
    try {
      const r = await leerResumen(archivo);
      setResumen(r);
      // Por defecto, la cuenta con más movimientos.
      setCuentaElegida(
        [...r.cuentas].sort(
          (a, b) => b.movimientos.length - a.movimientos.length,
        )[0]?.numero ?? null,
      );
    } catch (e) {
      setResumen(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (archivoExterno) procesar(archivoExterno);
  }, [archivoExterno]);

  const cuenta =
    resumen?.cuentas.find((c) => c.numero === cuentaElegida) ?? null;
  const todos = useMemo(
    () => resumen?.cuentas.flatMap((c) => c.movimientos) ?? [],
    [resumen],
  );
  // Lo que el cliente ya cargó manda sobre las reglas: dice a quién se pagó o quién pagó.
  const clasificar = useMemo(() => {
    const cruces = conciliar(todos, movimientosCliente);
    return (m: MovimientoBancario): Clasificacion => {
      const delCliente = cruces.get(m);
      if (!delCliente) return clasificarMovimiento(m);
      const cuentaContable = cuentaDelMovimiento(delCliente);
      return {
        concepto: `${TIPOS.find((t) => t.id === delCliente.tipo)?.nombre} (cargado por el cliente)`,
        cuenta: cuentaContable,
        nombreCuenta: nombreCuenta(cuentaContable),
        automatica: true,
        cuitContraparte: delCliente.cuitContraparte || undefined,
        nota: delCliente.contraparte || undefined,
      };
    };
  }, [todos, movimientosCliente]);
  const grupos = useMemo(
    () => agruparPorConcepto(todos, clasificar),
    [todos, clasificar],
  );
  const automaticos = todos.filter((m) => clasificar(m).automatica).length;

  const movimientos: [
    MovimientoBancario,
    ReturnType<typeof clasificarMovimiento>,
  ][] = (cuenta?.movimientos ?? [])
    .map(
      (m) =>
        [m, clasificar(m)] as [
          MovimientoBancario,
          ReturnType<typeof clasificarMovimiento>,
        ],
    )
    .filter(
      ([, c]) =>
        filtro === "todos" ||
        (filtro === "revisar" ? !c.automatica : c.automatica),
    );

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Resumen de cuenta bancaria</h2>
            <p className="text-sm text-stone-500">
              PDF del banco. Por ahora: Banco Macro (todas las cuentas del
              resumen).
            </p>
          </div>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {cargando
              ? "Leyendo…"
              : nombre
                ? "Cambiar resumen"
                : "Subir resumen"}
          </button>
          <input
            ref={input}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={(e) => {
              const archivo = e.target.files?.[0];
              if (archivo) procesar(archivo);
              e.target.value = "";
            }}
          />
        </div>
        {nombre && !error && (
          <p className="mt-2 text-sm text-stone-500">{nombre}</p>
        )}
        {error && (
          <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
      </section>

      {resumen && (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-stone-500">
                Titular
              </div>
              <div className="mt-1 font-semibold">{resumen.titular}</div>
              <div className="text-sm text-stone-500">
                CUIT {cuitConGuiones(resumen.cuit)} · {resumen.banco}
                {resumen.desde && resumen.hasta && (
                  <>
                    {" "}
                    · {fechaCorta(resumen.desde)} al {fechaCorta(resumen.hasta)}
                  </>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-stone-500">
                Control de saldos
              </div>
              {resumen.controles.length === 0 ? (
                <div className="mt-1 font-semibold text-emerald-700">
                  ✓ Cierra al centavo
                </div>
              ) : (
                <div className="mt-1 font-semibold text-red-700">
                  {resumen.controles.length} diferencias
                </div>
              )}
              <div className="text-sm text-stone-500">
                {todos.length} movimientos en {resumen.cuentas.length} cuentas
              </div>
            </div>
            <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-stone-500">
                Clasificados solos
              </div>
              <div className="mt-1 font-semibold">
                {automaticos} de {todos.length} (
                {todos.length
                  ? Math.round((automaticos / todos.length) * 100)
                  : 0}
                %)
              </div>
              <div className="text-sm text-stone-500">
                {todos.length - automaticos} para revisar
              </div>
            </div>
          </section>

          {resumen.controles.length > 0 && (
            <details className="rounded-md bg-red-50 p-3 text-sm text-red-800">
              <summary className="cursor-pointer">Ver diferencias</summary>
              <ul className="mt-2 list-disc pl-5">
                {resumen.controles.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </details>
          )}

          <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
            <h3 className="border-b border-stone-200 px-4 py-3 font-semibold">
              Cuentas
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-4 py-2">Cuenta</th>
                    <th className="px-4 py-2 text-right">Saldo inicial</th>
                    <th className="px-4 py-2 text-right">Créditos</th>
                    <th className="px-4 py-2 text-right">Débitos</th>
                    <th className="px-4 py-2 text-right">Saldo final</th>
                    <th className="px-4 py-2 text-right">Imp. déb./créd.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {resumen.cuentas.map((c) => {
                    const cred = c.movimientos.reduce(
                      (s, m) => s + Math.max(0, m.importe),
                      0,
                    );
                    const deb = c.movimientos.reduce(
                      (s, m) => s + Math.max(0, -m.importe),
                      0,
                    );
                    return (
                      <tr key={c.numero}>
                        <td className="px-4 py-2">
                          <div className="font-medium">{c.tipo}</div>
                          <div className="text-xs text-stone-500">
                            {c.numero} · {c.movimientos.length} movimientos
                          </div>
                        </td>
                        <td className="cifra px-4 py-2">
                          {pesos(c.saldoInicial ?? 0)}
                        </td>
                        <td className="cifra px-4 py-2">{pesos(cred)}</td>
                        <td className="cifra px-4 py-2">{pesos(deb)}</td>
                        <td className="cifra px-4 py-2 font-medium">
                          {pesos(c.saldoFinal ?? 0)}
                        </td>
                        <td className="cifra px-4 py-2">
                          {pesos(c.impuestoDebitosCreditos ?? 0)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
            <h3 className="border-b border-stone-200 px-4 py-3 font-semibold">
              Resumen por concepto (todas las cuentas)
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                  <tr>
                    <th className="px-4 py-2">Concepto</th>
                    <th className="px-4 py-2">Cuenta contable</th>
                    <th className="px-4 py-2 text-right">Cant.</th>
                    <th className="px-4 py-2 text-right">Débitos</th>
                    <th className="px-4 py-2 text-right">Créditos</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {grupos.map((g) => (
                    <tr key={g.concepto}>
                      <td className="px-4 py-2">
                        <span className="font-medium">{g.concepto}</span>
                        {!g.automatica && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                            revisar
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-stone-600">
                        {g.cuenta
                          ? `${g.cuenta} · ${g.nombreCuenta}`
                          : "A definir"}
                      </td>
                      <td className="cifra px-4 py-2">{g.cantidad}</td>
                      <td className="cifra px-4 py-2">
                        {g.debitos ? pesos(g.debitos) : ""}
                      </td>
                      <td className="cifra px-4 py-2">
                        {g.creditos ? pesos(g.creditos) : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
              <h3 className="font-semibold">Movimientos</h3>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <select
                  value={cuentaElegida ?? ""}
                  onChange={(e) => setCuentaElegida(e.target.value)}
                  className="rounded-md border border-stone-300 bg-white px-2 py-1"
                >
                  {resumen.cuentas.map((c) => (
                    <option key={c.numero} value={c.numero}>
                      {c.tipo} · {c.numero}
                    </option>
                  ))}
                </select>
                <div className="flex gap-1 rounded-lg bg-stone-200/70 p-1">
                  {(
                    [
                      ["revisar", "Para revisar"],
                      ["automaticos", "Automáticos"],
                      ["todos", "Todos"],
                    ] as [Filtro, string][]
                  ).map(([id, texto]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFiltro(id)}
                      className={`rounded-md px-2.5 py-1 font-medium ${filtro === id ? "bg-white text-marca shadow-sm" : "text-stone-600"}`}
                    >
                      {texto}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {movimientos.length === 0 ? (
              <p className="p-6 text-sm text-stone-500">
                No hay movimientos con este filtro.
              </p>
            ) : (
              <div className="max-h-[36rem] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                    <tr>
                      <th className="px-3 py-2">Fecha</th>
                      <th className="px-3 py-2">Descripción del banco</th>
                      <th className="px-3 py-2">Clasificación</th>
                      <th className="px-3 py-2 text-right">Importe</th>
                      <th className="px-3 py-2 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {movimientos.map(([m, c], i) => (
                      <tr
                        key={i}
                        className={c.automatica ? undefined : "bg-amber-50/60"}
                      >
                        <td className="px-3 py-2 whitespace-nowrap">
                          {fechaCorta(m.fecha)}
                        </td>
                        <td className="px-3 py-2">
                          <div
                            className="max-w-80 truncate"
                            title={m.descripcion}
                          >
                            {m.descripcion}
                          </div>
                          {m.referencia && (
                            <div className="text-xs text-stone-500">
                              Ref. {m.referencia}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="font-medium">{c.concepto}</div>
                          <div
                            className="text-xs text-stone-500"
                            title={c.nota}
                          >
                            {c.cuenta
                              ? `${c.cuenta} · ${c.nombreCuenta}`
                              : "Cuenta a definir"}
                            {c.cuitContraparte && (
                              <> · CUIT {cuitConGuiones(c.cuitContraparte)}</>
                            )}
                          </div>
                          {c.nota && !c.automatica && (
                            <div className="text-xs text-amber-800">
                              {c.nota}
                            </div>
                          )}
                          {c.nota &&
                            c.concepto.endsWith("(cargado por el cliente)") && (
                              <div className="text-xs text-emerald-700">
                                ✓ {c.nota}
                              </div>
                            )}
                        </td>
                        <td
                          className={`cifra px-3 py-2 font-medium ${m.importe < 0 ? "text-red-700" : "text-emerald-700"}`}
                        >
                          {pesos(m.importe)}
                        </td>
                        <td className="cifra px-3 py-2 text-stone-500">
                          {m.saldo !== null ? pesos(m.saldo) : ""}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
