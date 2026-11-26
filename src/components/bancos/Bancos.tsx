"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  agruparPorConcepto,
  type Clasificacion,
  clasificarMovimiento,
} from "@/lib/bancos/clasificar";
import { type Conocidos, conciliarResumen } from "@/lib/bancos/conciliacion";
import { cuentaDelMovimiento } from "@/lib/movimientos/asiento";
import { type Movimiento, TIPOS } from "@/lib/movimientos/tipos";
import { ConciliacionBancaria } from "./ConciliacionBancaria";
import { nombreCuenta } from "@/lib/plan/plan";
import { esResumenMacro, importarResumenMacro } from "@/lib/bancos/macro";
import type { MovimientoBancario, ResumenBancario } from "@/lib/bancos/tipos";
import type { Comprobante } from "@/lib/arca/tipos";
import {
  cobertura,
  consolidar,
  filtrar,
  mismoResumen,
  type ResumenCargado,
} from "@/lib/bancos/resumenes";
import { cuitConGuiones, fechaCorta, pesos } from "@/lib/formato";
import { leerPdf } from "@/lib/pdf/abrir";

interface Props {
  /** Resumen cargado desde afuera (por ejemplo, el de ejemplo). */
  archivoExterno?: File | null;
  /** Cobros y pagos que cargó el cliente: se cruzan con los movimientos del banco. */
  movimientosCliente?: Movimiento[];
  /** Clientes y proveedores conocidos, para sugerir a quién corresponde cada movimiento. */
  conocidos?: Conocidos;
  /** Facturas cargadas: un débito o crédito del mismo importe se propone como su pago o cobro. */
  facturas?: { ventas: Comprobante[]; compras: Comprobante[] };
  /** Registra cobros o pagos creados desde la conciliación. */
  onRegistrar?: (movimientos: Movimiento[]) => void;
  /** Todos los resúmenes subidos (varios bancos y meses). */
  resumenes?: ResumenCargado[];
  onAgregar?: (
    nuevos: { resumen: ResumenBancario; nombre: string }[],
  ) => Promise<void> | void;
  onQuitar?: (r: ResumenCargado) => Promise<void> | void;
}

async function leerResumen(archivo: File): Promise<ResumenBancario> {
  if (!archivo.name.toLowerCase().endsWith(".pdf"))
    throw new Error("Subí el resumen en PDF tal como lo descargás del banco.");
  const lineas = await leerPdf(archivo);
  if (esResumenMacro(lineas)) return importarResumenMacro(lineas);
  throw new Error(
    "Por ahora se leen resúmenes de Banco Macro. Galicia y BBVA Francés se agregan con un resumen de ejemplo de cada uno.",
  );
}

const MESES_CORTOS = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
];
const mesCorto = (m: string) =>
  `${MESES_CORTOS[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`;

export function Bancos({
  archivoExterno,
  movimientosCliente = [],
  conocidos,
  facturas,
  onRegistrar = () => {},
  resumenes = [],
  onAgregar = () => {},
  onQuitar = () => {},
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [avisos, setAvisos] = useState<{ texto: string; error?: boolean }[]>(
    [],
  );
  const [cargando, setCargando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [mes, setMes] = useState<string>("");
  const [cuenta, setCuenta] = useState<string>("");

  async function procesar(archivos: File[]) {
    setCargando(true);
    const leidos: { resumen: ResumenBancario; nombre: string }[] = [];
    const mensajes: { texto: string; error?: boolean }[] = [];
    for (const archivo of archivos) {
      try {
        const r = await leerResumen(archivo);
        const repetido = [
          ...resumenes.map((x) => x.resumen),
          ...leidos.map((x) => x.resumen),
        ].some((x) => mismoResumen(x, r));
        leidos.push({ resumen: r, nombre: archivo.name });
        mensajes.push({
          texto: `✓ ${archivo.name}: ${r.banco}${r.desde && r.hasta ? `, del ${fechaCorta(r.desde)} al ${fechaCorta(r.hasta)}` : ""} · ${r.cuentas.reduce((t, c) => t + c.movimientos.length, 0)} movimientos${repetido ? " (ya estaba: se reemplazó)" : ""}${r.controles.length ? ` · ⚠ ${r.controles.length} diferencias de saldos` : ""}`,
        });
      } catch (e) {
        mensajes.push({
          texto: `✗ ${archivo.name}: ${e instanceof Error ? e.message : String(e)}`,
          error: true,
        });
      }
    }
    if (leidos.length) await onAgregar(leidos);
    setAvisos(mensajes);
    setCargando(false);
  }

  useEffect(() => {
    if (archivoExterno) procesar([archivoExterno]);
    // Solo cuando llega un archivo nuevo desde afuera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivoExterno]);

  const consolidado = useMemo(() => consolidar(resumenes), [resumenes]);
  const cober = useMemo(() => cobertura(resumenes), [resumenes]);
  const resumen = useMemo(
    () =>
      consolidado
        ? filtrar(consolidado, { mes: mes || null, cuenta: cuenta || null })
        : null,
    [consolidado, mes, cuenta],
  );

  const todos = useMemo(
    () => resumen?.cuentas.flatMap((c) => c.movimientos) ?? [],
    [resumen],
  );
  const conciliacion = useMemo(
    () =>
      resumen
        ? conciliarResumen(resumen, movimientosCliente, conocidos, facturas)
        : null,
    [resumen, movimientosCliente, conocidos, facturas],
  );
  // Para el resumen por concepto: lo que cargó el cliente (o lo sugerido) manda sobre las reglas.
  const clasificar = useMemo(() => {
    const porMovimiento = new Map(
      conciliacion?.filas.map((f) => [f.movimiento, f]),
    );
    return (m: MovimientoBancario): Clasificacion => {
      const fila = porMovimiento.get(m);
      const deCliente = fila?.delCliente ?? fila?.sugerencia;
      if (!fila || !deCliente) return clasificarMovimiento(m);
      const cuentaContable = cuentaDelMovimiento(deCliente);
      return {
        concepto: `${TIPOS.find((t) => t.id === deCliente.tipo)?.nombre}${fila.delCliente ? " (cargado por el cliente)" : " (sugerido)"}`,
        cuenta: cuentaContable,
        nombreCuenta: nombreCuenta(cuentaContable),
        automatica: Boolean(fila.delCliente),
        cuitContraparte: deCliente.cuitContraparte || undefined,
        nota: deCliente.contraparte || undefined,
      };
    };
  }, [conciliacion]);
  const grupos = useMemo(
    () => agruparPorConcepto(todos, clasificar),
    [todos, clasificar],
  );
  const automaticos = conciliacion
    ? conciliacion.totales.conciliado.cantidad +
      conciliacion.totales.automatico.cantidad
    : 0;

  return (
    <div className="space-y-6">
      <section
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          const f = [...e.dataTransfer.files].filter((x) =>
            /\.pdf$/i.test(x.name),
          );
          if (f.length) procesar(f);
        }}
        className={`rounded-2xl border bg-white p-5 shadow-sm ${arrastrando ? "border-marca bg-marca-claro" : "border-stone-200/80"}`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold">Resúmenes bancarios</h2>
            <p className="max-w-2xl text-sm text-stone-500">
              Subí los resúmenes en PDF de todos los bancos y de todos los meses
              (podés elegir varios juntos o arrastrarlos acá). Se juntan solos
              por cuenta; si subís dos veces el mismo, se reemplaza. Por ahora
              se leen los de Banco Macro.
            </p>
          </div>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="rounded-xl bg-marca px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            {cargando ? "Leyendo…" : "Subir resúmenes (PDF)"}
          </button>
          <input
            ref={input}
            id="subir-resumenes"
            type="file"
            accept=".pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              const archivos = [...(e.target.files ?? [])];
              e.target.value = "";
              if (archivos.length) procesar(archivos);
            }}
          />
        </div>
        {avisos.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {avisos.map((a) => (
              <li
                key={a.texto}
                className={a.error ? "text-red-700" : "text-emerald-800"}
              >
                {a.texto}
              </li>
            ))}
          </ul>
        )}

        {resumenes.length > 0 && (
          <div className="mt-5">
            <h3 className="text-sm font-semibold">Qué meses están cargados</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="text-sm">
                <thead>
                  <tr className="text-xs text-stone-500">
                    <th className="py-1 pr-4 text-left font-medium">Cuenta</th>
                    {cober.meses.map((m) => (
                      <th key={m} className="px-1 py-1 text-center font-medium">
                        {mesCorto(m)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cober.cuentas.map((c) => (
                    <tr key={c.clave}>
                      <td className="whitespace-nowrap py-1 pr-4">
                        <div className="font-medium">{c.banco}</div>
                        <div className="text-xs text-stone-500">
                          {c.tipo} · {c.numero}
                        </div>
                      </td>
                      {cober.meses.map((m) => (
                        <td key={m} className="px-1 py-1 text-center">
                          {c.meses.has(m) ? (
                            <button
                              type="button"
                              title={`Ver ${mesCorto(m)}`}
                              onClick={() => {
                                setMes(m);
                                setCuenta("");
                              }}
                              className="inline-flex h-7 w-9 items-center justify-center rounded-md bg-emerald-100 text-emerald-800 hover:bg-emerald-200"
                            >
                              ✓
                            </button>
                          ) : (
                            <span
                              title="Falta el resumen de este mes"
                              className="inline-flex h-7 w-9 items-center justify-center rounded-md bg-amber-50 text-xs text-amber-700"
                            >
                              falta
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-stone-600">
                Archivos subidos ({resumenes.length})
              </summary>
              <ul className="mt-2 divide-y divide-stone-100 rounded-xl border border-stone-200">
                {[...resumenes]
                  .sort((a, b) =>
                    (b.resumen.desde ?? "").localeCompare(
                      a.resumen.desde ?? "",
                    ),
                  )
                  .map((r) => (
                    <li
                      key={r.id ?? r.nombre}
                      className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                    >
                      <span>
                        <span className="font-medium">{r.resumen.banco}</span>
                        {r.resumen.desde && r.resumen.hasta && (
                          <span className="text-stone-500">
                            {" "}
                            · {fechaCorta(r.resumen.desde)} al{" "}
                            {fechaCorta(r.resumen.hasta)}
                          </span>
                        )}
                        <span className="text-xs text-stone-400">
                          {" "}
                          · {r.nombre}
                        </span>
                        {r.resumen.controles.length > 0 && (
                          <span className="ml-1 text-xs text-red-700">
                            ⚠ {r.resumen.controles.length} diferencias
                          </span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`¿Quitar el resumen ${r.nombre}?`))
                            onQuitar(r);
                        }}
                        className="text-xs text-stone-500 underline hover:text-red-700"
                      >
                        Quitar
                      </button>
                    </li>
                  ))}
              </ul>
            </details>
          </div>
        )}
      </section>

      {consolidado && (
        <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-stone-200/80 bg-white p-4 text-sm shadow-sm">
          <label className="block">
            <span className="text-stone-600">Mes</span>
            <select
              id="banco-mes"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="mt-1 block rounded-xl border border-stone-300 bg-white px-3 py-1.5"
            >
              <option value="">Todos los meses</option>
              {[...cober.meses].reverse().map((m) => (
                <option key={m} value={m}>
                  {mesCorto(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-stone-600">Cuenta</span>
            <select
              id="banco-cuenta"
              value={cuenta}
              onChange={(e) => setCuenta(e.target.value)}
              className="mt-1 block rounded-xl border border-stone-300 bg-white px-3 py-1.5"
            >
              <option value="">Todas las cuentas</option>
              {consolidado.cuentas.map((c) => (
                <option key={c.numero} value={c.numero}>
                  {c.banco} · {c.tipo} · {c.numero}
                </option>
              ))}
            </select>
          </label>
          <p className="pb-1.5 text-stone-500">
            Lo de abajo (cuentas, conceptos y conciliación) es de{" "}
            {mes ? mesCorto(mes) : "todos los meses"} y{" "}
            {cuenta ? "esa cuenta" : "todas las cuentas"}.
          </p>
        </section>
      )}

      {resumen && (
        <>
          <section className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
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
            <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
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
            <div className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
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

          <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
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

          <section className="overflow-hidden rounded-2xl border border-stone-200/80 bg-white shadow-sm">
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

          {conciliacion && (
            <ConciliacionBancaria
              conciliacion={conciliacion}
              cuentas={resumen.cuentas}
              onRegistrar={onRegistrar}
            />
          )}
        </>
      )}
    </div>
  );
}
