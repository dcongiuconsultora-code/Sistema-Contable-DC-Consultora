"use client";

import { useState } from "react";
import {
  type Conciliacion,
  type EstadoConciliacion,
  type FilaConciliacion,
  sugerenciaDesdeBanco,
} from "@/lib/bancos/conciliacion";
import { cuitConGuiones, fechaCorta, pesos } from "@/lib/formato";
import { cuentaDelMovimiento } from "@/lib/movimientos/asiento";
import {
  CATEGORIAS_GASTO,
  CONCEPTOS_SUELDO,
  IMPUESTOS,
  MEDIOS,
  type Movimiento,
  OPERACIONES_SOCIOS,
  TIPOS,
  type TipoMovimiento,
} from "@/lib/movimientos/tipos";
import { nombreCuenta } from "@/lib/plan/plan";

interface Props {
  conciliacion: Conciliacion;
  cuentas: { numero: string; tipo: string }[];
  /** Registra cobros o pagos que salen del banco (los crea el estudio, ya aprobados). */
  onRegistrar: (movimientos: Movimiento[]) => void;
}

const FILTROS: [EstadoConciliacion | "todos", string, string][] = [
  ["sin_registrar", "Sin registrar", "bg-amber-100 text-amber-900"],
  ["sugerido", "Sugeridos", "bg-sky-100 text-sky-800"],
  ["conciliado", "Conciliados", "bg-emerald-100 text-emerald-800"],
  ["automatico", "Automáticos", "bg-stone-200 text-stone-700"],
  ["todos", "Todos", ""],
];

const ETIQUETA: Record<EstadoConciliacion, [string, string]> = {
  conciliado: ["Conciliado", "bg-emerald-100 text-emerald-800"],
  sugerido: ["Sugerido", "bg-sky-100 text-sky-800"],
  automatico: ["Automático", "bg-stone-200 text-stone-700"],
  sin_registrar: ["Sin registrar", "bg-amber-100 text-amber-900"],
};

const CONCEPTOS: Partial<Record<TipoMovimiento, [string, string][]>> = {
  gasto: CATEGORIAS_GASTO,
  impuesto: IMPUESTOS,
  sueldo: CONCEPTOS_SUELDO,
};

function nombreTipo(tipo: TipoMovimiento) {
  return TIPOS.find((t) => t.id === tipo)?.nombre ?? tipo;
}

/** Formulario corto para registrar un movimiento del banco que nadie cargó. */
function Registrar({
  fila,
  medio,
  onRegistrar,
  onCancelar,
}: {
  fila: FilaConciliacion;
  medio: string;
  onRegistrar: (m: Movimiento) => void;
  onCancelar: () => void;
}) {
  const entra = fila.movimiento.importe > 0;
  const sugerido = sugerenciaDesdeBanco(fila.movimiento);
  const [tipo, setTipo] = useState<TipoMovimiento>(
    entra
      ? "cobro"
      : /AFIP|ARCA|VEP/i.test(fila.movimiento.descripcion)
        ? "impuesto"
        : "pago_proveedor",
  );
  const [contraparte, setContraparte] = useState(sugerido.nombre);
  const [cuenta, setCuenta] = useState("");
  const conceptos =
    tipo === "socios"
      ? OPERACIONES_SOCIOS.filter(
          ([, , sentido]) => (sentido === "entrada") === entra,
        ).map(([c, n]) => [c, n] as [string, string])
      : CONCEPTOS[tipo];
  const tipos = TIPOS.filter((t) =>
    entra ? t.id === "cobro" || t.id === "socios" : t.id !== "cobro",
  );
  const falta = conceptos ? !cuenta : !contraparte.trim();

  return (
    <form
      className="mt-2 grid gap-2 rounded-md bg-stone-50 p-3 sm:grid-cols-[auto_1fr_auto]"
      onSubmit={(e) => {
        e.preventDefault();
        if (falta) return;
        onRegistrar({
          id: `banco-${fila.cuenta}-${fila.movimiento.fecha}-${fila.movimiento.referencia}-${fila.movimiento.importe}-${fila.movimiento.pagina}`,
          tipo,
          fecha: fila.movimiento.fecha,
          importe: Math.abs(fila.movimiento.importe),
          medio,
          contraparte: contraparte.trim(),
          cuitContraparte: sugerido.cuit,
          cuenta: conceptos ? cuenta : undefined,
          // Lo que sale del banco sin factura cargada va directo al gasto; los honorarios, contra Proveedores.
          conFactura:
            tipo === "honorarios" ? true : tipo === "gasto" ? false : undefined,
          retenciones: tipo === "cobro" ? [] : undefined,
          nota: fila.movimiento.descripcion,
          estado: "aprobado",
        });
      }}
    >
      <select
        aria-label="Tipo de movimiento"
        value={tipo}
        onChange={(e) => {
          setTipo(e.target.value as TipoMovimiento);
          setCuenta("");
        }}
        className="rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
      >
        {tipos.map((t) => (
          <option key={t.id} value={t.id}>
            {t.nombre}
          </option>
        ))}
      </select>
      {conceptos ? (
        <select
          aria-label="Concepto"
          value={cuenta}
          onChange={(e) => setCuenta(e.target.value)}
          className="min-w-0 rounded-md border border-stone-300 bg-white px-2 py-1.5 text-sm"
        >
          <option value="">Elegí el concepto…</option>
          {conceptos.map(([c, n]) => (
            <option key={c} value={c}>
              {n}
            </option>
          ))}
        </select>
      ) : (
        <input
          aria-label={entra ? "Cliente" : "Proveedor"}
          value={contraparte}
          onChange={(e) => setContraparte(e.target.value)}
          placeholder={entra ? "Cliente" : "Proveedor"}
          className="min-w-0 rounded-md border border-stone-300 px-2 py-1.5 text-sm"
        />
      )}
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={falta}
          className="rounded-md bg-marca px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Registrar
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-md px-2 py-1.5 text-sm text-stone-600 hover:bg-stone-200"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

export function ConciliacionBancaria({
  conciliacion,
  cuentas,
  onRegistrar,
}: Props) {
  const [filtro, setFiltro] = useState<EstadoConciliacion | "todos">(
    "sin_registrar",
  );
  const [cuentaElegida, setCuentaElegida] = useState<string>("todas");
  const [registrando, setRegistrando] = useState<FilaConciliacion | null>(null);
  const { totales, pendientesEnBanco } = conciliacion;
  const medioDe = (numero: string) =>
    /AHORRO/i.test(cuentas.find((c) => c.numero === numero)?.tipo ?? "")
      ? "banco_ca"
      : "banco_cc";

  const filas = conciliacion.filas.filter(
    (f) =>
      (filtro === "todos" || f.estado === filtro) &&
      (cuentaElegida === "todas" || f.cuenta === cuentaElegida),
  );
  const sugeridos = conciliacion.filas.filter((f) => f.sugerencia);
  const total = conciliacion.filas.length;
  const resueltos = totales.conciliado.cantidad + totales.automatico.cantidad;

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">Conciliación bancaria</h3>
          <span className="text-sm text-stone-600">
            {resueltos} de {total} movimientos resueltos (
            {total ? Math.round((resueltos / total) * 100) : 0}%)
          </span>
        </div>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-stone-100">
          {(
            [
              "conciliado",
              "automatico",
              "sugerido",
              "sin_registrar",
            ] as EstadoConciliacion[]
          ).map((e) => (
            <div
              key={e}
              style={{
                width: `${total ? (totales[e].cantidad / total) * 100 : 0}%`,
              }}
              className={
                {
                  conciliado: "bg-emerald-500",
                  automatico: "bg-stone-400",
                  sugerido: "bg-sky-500",
                  sin_registrar: "bg-amber-400",
                }[e]
              }
            />
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          {(
            [
              "conciliado",
              "automatico",
              "sugerido",
              "sin_registrar",
            ] as EstadoConciliacion[]
          ).map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setFiltro(e)}
              className="rounded-lg border border-stone-200 p-3 text-left hover:border-marca"
            >
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${ETIQUETA[e][1]}`}
              >
                {ETIQUETA[e][0]}
              </span>
              <div className="mt-1 font-semibold tabular-nums">
                {totales[e].cantidad}
              </div>
              <div className="text-xs text-stone-500 tabular-nums">
                {pesos(totales[e].importe)}
              </div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs text-stone-500">
          <strong>Conciliado:</strong> lo cargó el cliente.{" "}
          <strong>Automático:</strong> impuestos, retenciones, gastos bancarios
          y cobros sin cuenta corriente. <strong>Sugerido:</strong> el banco
          trae el CUIT o el nombre de un cliente o proveedor: se propone el
          cobro o pago. <strong>Sin registrar:</strong> falta saber qué es.
        </p>
      </section>

      {pendientesEnBanco.length > 0 && (
        <section className="overflow-hidden rounded-xl border border-amber-200 bg-white shadow-sm">
          <h3 className="border-b border-amber-200 bg-amber-50 px-4 py-3 font-semibold text-amber-900">
            Registrados por el cliente que no aparecen en el banco (
            {pendientesEnBanco.length})
          </h3>
          <p className="px-4 pt-3 text-sm text-stone-600">
            Pueden ser transferencias que se acreditan después del cierre, o
            errores de carga (importe o fecha distintos).
          </p>
          <ul className="divide-y divide-stone-100 text-sm">
            {pendientesEnBanco.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2"
              >
                <span className="w-20 text-stone-500">
                  {fechaCorta(m.fecha)}
                </span>
                <span className="min-w-0 flex-1">
                  {nombreTipo(m.tipo)} · {m.contraparte || "—"}
                </span>
                <span className="cifra font-medium">
                  {pesos(m.tipo === "cobro" ? m.importe : -m.importe)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 px-4 py-3">
          <div className="flex flex-wrap gap-1 rounded-lg bg-stone-200/70 p-1 text-sm">
            {FILTROS.map(([id, texto]) => (
              <button
                key={id}
                type="button"
                onClick={() => setFiltro(id)}
                className={`rounded-md px-2.5 py-1 font-medium ${filtro === id ? "bg-white text-marca shadow-sm" : "text-stone-600"}`}
              >
                {texto}
                {id !== "todos" && (
                  <span className="ml-1 text-stone-400">
                    {totales[id].cantidad}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {cuentas.length > 1 && (
              <select
                aria-label="Cuenta bancaria"
                value={cuentaElegida}
                onChange={(e) => setCuentaElegida(e.target.value)}
                className="rounded-md border border-stone-300 bg-white px-2 py-1"
              >
                <option value="todas">Todas las cuentas</option>
                {cuentas.map((c) => (
                  <option key={c.numero} value={c.numero}>
                    {c.tipo} · {c.numero}
                  </option>
                ))}
              </select>
            )}
            {filtro === "sugerido" && sugeridos.length > 0 && (
              <button
                type="button"
                onClick={() => onRegistrar(sugeridos.map((f) => f.sugerencia!))}
                className="rounded-md bg-sky-700 px-3 py-1.5 font-medium text-white hover:opacity-90"
              >
                Registrar los {sugeridos.length} sugeridos
              </button>
            )}
          </div>
        </div>
        {filas.length === 0 ? (
          <p className="p-6 text-sm text-stone-500">
            No hay movimientos con este filtro.
          </p>
        ) : (
          <div className="max-h-[40rem] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="px-3 py-2">Fecha</th>
                  <th className="px-3 py-2">Descripción del banco</th>
                  <th className="px-3 py-2">Conciliación</th>
                  <th className="px-3 py-2 text-right">Importe</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {filas.map((f, i) => {
                  const m = f.movimiento;
                  const deCliente = f.delCliente ?? f.sugerencia;
                  const cuentaContable = deCliente
                    ? cuentaDelMovimiento(deCliente)
                    : f.clasificacion.cuenta;
                  return (
                    <tr key={i} className="align-top">
                      <td className="whitespace-nowrap px-3 py-2">
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
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${ETIQUETA[f.estado][1]}`}
                        >
                          {ETIQUETA[f.estado][0]}
                        </span>
                        <div className="mt-1 font-medium">
                          {deCliente
                            ? `${nombreTipo(deCliente.tipo)}${deCliente.contraparte ? ` · ${deCliente.contraparte}` : ""}`
                            : f.clasificacion.concepto}
                        </div>
                        <div className="text-xs text-stone-500">
                          {cuentaContable
                            ? `${cuentaContable} · ${nombreCuenta(cuentaContable)}`
                            : "Cuenta a definir"}
                          {deCliente?.cuitContraparte && (
                            <>
                              {" "}
                              · CUIT {cuitConGuiones(deCliente.cuitContraparte)}
                            </>
                          )}
                          {f.delCliente && (
                            <>
                              {" "}
                              ·{" "}
                              {
                                MEDIOS.find((x) => x.id === f.delCliente!.medio)
                                  ?.nombre
                              }
                            </>
                          )}
                        </div>
                        {f.estado === "sugerido" && (
                          <button
                            type="button"
                            onClick={() => onRegistrar([f.sugerencia!])}
                            className="mt-1 rounded bg-sky-700 px-2 py-0.5 text-xs font-medium text-white"
                          >
                            Registrar
                          </button>
                        )}
                        {f.estado === "sin_registrar" && registrando !== f && (
                          <button
                            type="button"
                            onClick={() => setRegistrando(f)}
                            className="mt-1 rounded border border-marca px-2 py-0.5 text-xs font-medium text-marca"
                          >
                            Registrar…
                          </button>
                        )}
                        {registrando === f && (
                          <Registrar
                            fila={f}
                            medio={medioDe(f.cuenta)}
                            onRegistrar={(nuevo) => {
                              onRegistrar([nuevo]);
                              setRegistrando(null);
                            }}
                            onCancelar={() => setRegistrando(null)}
                          />
                        )}
                      </td>
                      <td
                        className={`cifra whitespace-nowrap px-3 py-2 font-medium ${m.importe < 0 ? "text-red-700" : "text-emerald-700"}`}
                      >
                        {pesos(m.importe)}
                      </td>
                    </tr>
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
