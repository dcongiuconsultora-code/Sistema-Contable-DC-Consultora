"use client";

import { nombreCuenta, PLAN_MODELO } from "@/lib/plan/plan";
import {
  type CuentaBancaria,
  medioDeCuenta,
  nombreCuentaBancaria,
} from "@/lib/cuentas-bancarias/cuentas";

import {
  type ConfigUnidades,
  nombreUnidad,
  SIN_UNIDADES,
  unidadDeMovimiento,
} from "@/lib/unidades/unidades";
import { useState } from "react";
import { JURISDICCIONES } from "@/lib/arca/retenciones";
import { cuitConGuiones, fechaCorta, pesos } from "@/lib/formato";
import {
  cuentaDelMovimiento,
  generarAsiento,
  totalesAsiento,
  validarMovimiento,
} from "@/lib/movimientos/asiento";
import {
  CATEGORIAS_GASTO,
  CONCEPTOS_SUELDO,
  entraPlata,
  IMPUESTOS,
  MEDIOS,
  type Movimiento,
  OPERACIONES_SOCIOS,
  type RetencionSufrida,
  TIPOS,
  type TipoMovimiento,
} from "@/lib/movimientos/tipos";

export interface Contraparte {
  nombre: string;
  cuit: string;
}

interface Props {
  movimientos: Movimiento[];
  onMovimientos: (m: Movimiento[]) => void;
  /** Clientes y proveedores conocidos (de Mis Comprobantes), para sugerir al escribir. */
  clientes: Contraparte[];
  proveedores: Contraparte[];
  /** Con usuarios reales, la vista la da el rol y no se puede cambiar. */
  vistaFija?: Vista;
  /** Unidades de negocio de la empresa (vacío si no tiene). */
  unidades?: ConfigUnidades;
  /** Cuentas bancarias y billeteras de la empresa. */
  cuentas?: CuentaBancaria[];
}

export type Vista = "cliente" | "estudio";

const PROVINCIAS = Object.values(JURISDICCIONES);
const ESTADOS = {
  enviado: { texto: "Enviado", clase: "bg-sky-100 text-sky-800" },
  aprobado: { texto: "Aprobado", clase: "bg-emerald-100 text-emerald-800" },
  observado: { texto: "Observado", clase: "bg-red-100 text-red-800" },
};

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nuevo(tipo: TipoMovimiento): Movimiento {
  return {
    id: crypto.randomUUID(),
    tipo,
    fecha: hoy(),
    importe: 0,
    medio: "banco_cc",
    contraparte: "",
    cuitContraparte: "",
    nota: "",
    estado: "enviado",
    conFactura: tipo === "honorarios" || tipo === "gasto" ? true : undefined,
    retenciones: tipo === "cobro" ? [] : undefined,
  };
}

function descripcion(m: Movimiento) {
  const lista =
    m.tipo === "gasto"
      ? CATEGORIAS_GASTO
      : m.tipo === "impuesto"
        ? IMPUESTOS
        : m.tipo === "sueldo"
          ? CONCEPTOS_SUELDO
          : m.tipo === "socios"
            ? OPERACIONES_SOCIOS
            : [];
  const concepto = lista.find(([c]) => c === m.cuenta)?.[1];
  return (
    [concepto, m.contraparte].filter(Boolean).join(" · ") ||
    TIPOS.find((t) => t.id === m.tipo)?.nombre ||
    ""
  );
}

const campo =
  "mt-1 block w-full rounded-md border border-stone-300 bg-white px-3 py-2 focus:border-marca focus:outline-none";

function Etiqueta({
  texto,
  children,
  className = "",
}: {
  texto: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="text-stone-600">{texto}</span>
      {children}
    </label>
  );
}

const IMPUTABLES = PLAN_MODELO.filter((c) => c.imputable);

function Formulario({
  inicial,
  clientes,
  proveedores,
  unidades,
  cuentas,
  onGuardar,
  onCancelar,
}: {
  inicial: Movimiento;
  clientes: Contraparte[];
  proveedores: Contraparte[];
  unidades: ConfigUnidades;
  cuentas: CuentaBancaria[];
  onGuardar: (m: Movimiento) => void;
  onCancelar: () => void;
}) {
  const [m, setM] = useState(inicial);
  const [intento, setIntento] = useState(false);
  const cambiar = (c: Partial<Movimiento>) => setM({ ...m, ...c });
  const conUnidades = unidades.unidades.length > 0;
  // La unidad del proveedor se propone sola; quien carga la puede cambiar.
  const unidadSugerida = unidadDeMovimiento(m, unidades) ?? undefined;
  const errores = [
    ...validarMovimiento(m),
    ...(conUnidades && !unidadSugerida ? ["Elegí la unidad de negocio."] : []),
  ];
  const tipo = TIPOS.find((t) => t.id === m.tipo)!;
  const sugerencias =
    m.tipo === "cobro"
      ? clientes
      : m.tipo === "pago_proveedor" ||
          m.tipo === "honorarios" ||
          m.tipo === "gasto"
        ? proveedores
        : [];
  const listaId = `sugerencias-${m.id}`;

  const elegirContraparte = (nombre: string) => {
    const conocida = sugerencias.find((s) => s.nombre === nombre);
    cambiar({
      contraparte: nombre,
      cuitContraparte: conocida?.cuit ?? m.cuitContraparte,
    });
  };
  const retencion = (impuesto: RetencionSufrida["impuesto"]) =>
    m.retenciones?.find((r) => r.impuesto === impuesto);
  const cambiarRetencion = (
    impuesto: RetencionSufrida["impuesto"],
    cambios: Partial<RetencionSufrida>,
  ) => {
    const otras = (m.retenciones ?? []).filter((r) => r.impuesto !== impuesto);
    const actual = retencion(impuesto) ?? { impuesto, importe: 0 };
    cambiar({ retenciones: [...otras, { ...actual, ...cambios }] });
  };

  const etiquetaContraparte =
    m.tipo === "cobro"
      ? "Cliente"
      : m.tipo === "sueldo"
        ? "Empleado"
        : m.tipo === "honorarios"
          ? "Profesional"
          : m.tipo === "socios"
            ? "Socio"
            : m.tipo === "gasto"
              ? "A quién se le pagó (opcional)"
              : "Proveedor";
  const conceptos =
    m.tipo === "gasto"
      ? CATEGORIAS_GASTO
      : m.tipo === "impuesto"
        ? IMPUESTOS
        : m.tipo === "sueldo"
          ? CONCEPTOS_SUELDO
          : m.tipo === "socios"
            ? OPERACIONES_SOCIOS.map(([c, n]) => [c, n] as [string, string])
            : null;

  return (
    <section className="overflow-hidden rounded-xl border-2 border-marca bg-white shadow-sm">
      <div className="border-b border-stone-200 px-4 py-3">
        <h3 className="font-semibold">{tipo.nombre}</h3>
        {inicial.estado === "observado" && inicial.observacion && (
          <p className="mt-2 rounded-md bg-red-50 p-2 text-sm text-red-800">
            Observación del estudio: {inicial.observacion}
          </p>
        )}
      </div>
      <form
        className="space-y-4 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setIntento(true);
          if (errores.length === 0)
            onGuardar({
              ...m,
              unidad: conUnidades ? unidadSugerida : undefined,
              estado: "enviado",
              observacion: undefined,
            });
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Etiqueta texto="Fecha">
            <input
              id={`fecha-${m.id}`}
              type="date"
              value={m.fecha}
              onChange={(e) => cambiar({ fecha: e.target.value })}
              className={campo}
            />
          </Etiqueta>
          <Etiqueta
            texto={m.tipo === "cobro" ? "Importe recibido" : "Importe pagado"}
          >
            <input
              id={`importe-${m.id}`}
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              value={m.importe || ""}
              placeholder="0,00"
              onChange={(e) =>
                cambiar({ importe: Number(e.target.value) || 0 })
              }
              className={`${campo} text-right text-lg font-semibold tabular-nums`}
            />
          </Etiqueta>
          <Etiqueta texto={entraPlata(m) ? "Cómo entró" : "Cómo se pagó"}>
            <select
              id={`medio-${m.id}`}
              value={m.cuentaBancaria ? `cuenta:${m.cuentaBancaria}` : m.medio}
              onChange={(e) => {
                const v = e.target.value;
                const c = cuentas.find((x) => `cuenta:${x.id}` === v);
                cambiar(
                  c
                    ? { medio: medioDeCuenta(c), cuentaBancaria: c.id }
                    : { medio: v, cuentaBancaria: undefined },
                );
              }}
              className={campo}
            >
              {cuentas.length > 0 && (
                <optgroup label="Cuentas de la empresa">
                  {cuentas.map((c) => (
                    <option key={c.id} value={`cuenta:${c.id}`}>
                      {nombreCuentaBancaria(c)}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={cuentas.length ? "Otros medios" : "Medios"}>
                {MEDIOS.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nombre}
                  </option>
                ))}
              </optgroup>
            </select>
          </Etiqueta>
        </div>

        {conceptos && (
          <Etiqueta texto={m.tipo === "socios" ? "Operación" : "Concepto"}>
            <select
              id={`concepto-${m.id}`}
              value={m.cuenta ?? ""}
              onChange={(e) => cambiar({ cuenta: e.target.value || undefined })}
              className={campo}
            >
              <option value="">Elegí…</option>
              {conceptos.map(([c, n]) => (
                <option key={c} value={c}>
                  {n}
                </option>
              ))}
            </select>
          </Etiqueta>
        )}

        {m.tipo !== "impuesto" && (
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Etiqueta texto={etiquetaContraparte}>
              <input
                id={`contraparte-${m.id}`}
                list={listaId}
                value={m.contraparte}
                onChange={(e) => elegirContraparte(e.target.value)}
                className={campo}
              />
              <datalist id={listaId}>
                {sugerencias.map((s) => (
                  <option key={s.cuit + s.nombre} value={s.nombre}>
                    {cuitConGuiones(s.cuit)}
                  </option>
                ))}
              </datalist>
            </Etiqueta>
            <Etiqueta
              texto={
                m.tipo === "sueldo" ? "CUIL (opcional)" : "CUIT (opcional)"
              }
            >
              <input
                id={`cuit-${m.id}`}
                inputMode="numeric"
                value={m.cuitContraparte}
                onChange={(e) =>
                  cambiar({
                    cuitContraparte: e.target.value
                      .replace(/\D/g, "")
                      .slice(0, 11),
                  })
                }
                className={`${campo} tabular-nums`}
              />
            </Etiqueta>
          </div>
        )}

        {(m.tipo === "sueldo" || m.tipo === "impuesto") && (
          <Etiqueta texto="Período que se paga" className="sm:w-1/3">
            <input
              id={`periodo-${m.id}`}
              type="month"
              value={m.periodo ?? ""}
              onChange={(e) => cambiar({ periodo: e.target.value })}
              className={campo}
            />
          </Etiqueta>
        )}

        {(m.tipo === "honorarios" || m.tipo === "gasto") && (
          <fieldset className="text-sm">
            <legend className="text-stone-600">¿Tiene factura o ticket?</legend>
            <div className="mt-1 flex gap-2">
              {[
                [true, "Sí"],
                [false, "No"],
              ].map(([valor, texto]) => (
                <button
                  key={String(valor)}
                  type="button"
                  onClick={() => cambiar({ conFactura: valor as boolean })}
                  className={`rounded-md border px-4 py-1.5 ${m.conFactura === valor ? "border-marca bg-marca-claro font-medium text-marca" : "border-stone-300"}`}
                >
                  {texto as string}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-stone-500">
              {m.conFactura
                ? "La factura llega por ARCA o se carga como ticket; acá se registra solo el pago."
                : "Sin comprobante: el gasto se registra directo y no genera crédito fiscal."}
            </p>
          </fieldset>
        )}

        {m.tipo === "cobro" && (
          <fieldset className="rounded-lg bg-stone-50 p-3 text-sm">
            <legend className="px-1 font-medium">
              Retenciones que te hizo el cliente (si te dio certificado)
            </legend>
            <div className="grid gap-3 sm:grid-cols-4">
              {(["IVA", "Ganancias", "IIBB"] as const).map((imp) => (
                <Etiqueta key={imp} texto={imp}>
                  <input
                    id={`ret-${imp}-${m.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={retencion(imp)?.importe || ""}
                    placeholder="0,00"
                    onChange={(e) =>
                      cambiarRetencion(imp, {
                        importe: Number(e.target.value) || 0,
                      })
                    }
                    className={`${campo} text-right tabular-nums`}
                  />
                </Etiqueta>
              ))}
              <Etiqueta texto="Provincia (IIBB)">
                <select
                  id={`ret-prov-${m.id}`}
                  value={retencion("IIBB")?.jurisdiccion ?? ""}
                  onChange={(e) =>
                    cambiarRetencion("IIBB", {
                      jurisdiccion: e.target.value || undefined,
                    })
                  }
                  className={campo}
                >
                  <option value="">—</option>
                  {PROVINCIAS.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Etiqueta>
            </div>
          </fieldset>
        )}

        {conUnidades && (
          <Etiqueta texto="Unidad de negocio" className="sm:w-1/2">
            <select
              id={`unidad-${m.id}`}
              value={unidadSugerida ?? ""}
              onChange={(e) => cambiar({ unidad: e.target.value || undefined })}
              className={campo}
            >
              <option value="">Elegí…</option>
              {unidades.unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </Etiqueta>
        )}

        <details
          className="rounded-lg border border-stone-200 bg-stone-50 p-3 text-sm"
          open={Boolean(m.imputacion)}
        >
          <summary className="cursor-pointer">
            Imputación contable:{" "}
            <strong>
              {cuentaDelMovimiento(m)} {nombreCuenta(cuentaDelMovimiento(m))}
            </strong>{" "}
            <span className="text-stone-500">(cambiar)</span>
          </summary>
          <div className="mt-2 space-y-2">
            <input
              id={`imputacion-${m.id}`}
              list="cuentas-imputacion"
              defaultValue={
                m.imputacion
                  ? `${m.imputacion} ${nombreCuenta(m.imputacion)}`
                  : ""
              }
              onChange={(e) => {
                const codigo = e.target.value.trim().split(/\s+/)[0];
                if (!e.target.value.trim()) cambiar({ imputacion: undefined });
                else if (IMPUTABLES.some((c) => c.codigo === codigo))
                  cambiar({ imputacion: codigo });
              }}
              placeholder="Escribí el código o el nombre de la cuenta"
              className={campo}
            />
            <datalist id="cuentas-imputacion">
              {IMPUTABLES.map((c) => (
                <option key={c.codigo} value={`${c.codigo} ${c.nombre}`} />
              ))}
            </datalist>
            <p className="text-xs text-stone-500">
              Vacío = la cuenta que corresponde según el concepto. Si la factura
              ya entra por ARCA, dejá Proveedores o Deudores por ventas para no
              registrarla dos veces.
            </p>
            <Asiento m={{ ...m, unidad: unidadSugerida }} />
          </div>
        </details>

        <Etiqueta texto="Nota (opcional)">
          <input
            id={`nota-${m.id}`}
            value={m.nota}
            onChange={(e) => cambiar({ nota: e.target.value })}
            placeholder="Ej.: paga facturas 1201 y 1202"
            className={campo}
          />
        </Etiqueta>

        {intento && errores.length > 0 && (
          <ul className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded-md bg-marca px-5 py-2 font-medium text-white hover:opacity-90"
          >
            {inicial.estado === "observado"
              ? "Corregir y reenviar"
              : "Enviar al estudio"}
          </button>
          <button
            type="button"
            onClick={onCancelar}
            className="rounded-md px-4 py-2 text-stone-600 hover:bg-stone-100"
          >
            Cancelar
          </button>
        </div>
      </form>
    </section>
  );
}

function Asiento({ m }: { m: Movimiento }) {
  const lineas = generarAsiento(m);
  const t = totalesAsiento(lineas);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="text-left text-stone-500">
          <tr>
            <th className="py-1 pr-3 font-medium">Cuenta</th>
            <th className="py-1 pr-3 text-right font-medium">Debe</th>
            <th className="py-1 text-right font-medium">Haber</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={i}>
              <td className={`py-0.5 pr-3 ${l.haber ? "pl-6" : ""}`}>
                {l.cuenta} {l.nombre}
                {l.detalle && (
                  <span className="text-stone-500"> · {l.detalle}</span>
                )}
              </td>
              <td className="cifra py-0.5 pr-3">
                {l.debe ? pesos(l.debe) : ""}
              </td>
              <td className="cifra py-0.5">{l.haber ? pesos(l.haber) : ""}</td>
            </tr>
          ))}
          <tr className="border-t border-stone-200 font-medium">
            <td className="py-0.5 pr-3">{t.balancea ? "" : "⚠ No balancea"}</td>
            <td className="cifra py-0.5 pr-3">{pesos(t.debe)}</td>
            <td className="cifra py-0.5">{pesos(t.haber)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function Movimientos({
  movimientos,
  onMovimientos,
  clientes,
  proveedores,
  vistaFija,
  unidades = SIN_UNIDADES,
  cuentas = [],
}: Props) {
  const [vistaElegida, setVista] = useState<Vista>("cliente");
  const vista = vistaFija ?? vistaElegida;
  const [editando, setEditando] = useState<Movimiento | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [observando, setObservando] = useState<{
    id: string;
    texto: string;
  } | null>(null);

  const guardar = (m: Movimiento) => {
    onMovimientos(
      [...movimientos.filter((x) => x.id !== m.id), m].sort((a, b) =>
        b.fecha.localeCompare(a.fecha),
      ),
    );
    setEditando(null);
  };
  const actualizar = (id: string, cambios: Partial<Movimiento>) =>
    onMovimientos(
      movimientos.map((x) => (x.id === id ? { ...x, ...cambios } : x)),
    );

  const cuenta = (estado: Movimiento["estado"]) =>
    movimientos.filter((m) => m.estado === estado).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          hidden={Boolean(vistaFija)}
          className="flex gap-1 rounded-lg bg-stone-200/70 p-1 text-sm"
        >
          {(
            [
              ["cliente", "Vista del cliente"],
              ["estudio", "Vista del estudio"],
            ] as [Vista, string][]
          ).map(([id, texto]) => (
            <button
              key={id}
              type="button"
              onClick={() => setVista(id)}
              className={`rounded-md px-3 py-1.5 font-medium ${vista === id ? "bg-white text-marca shadow-sm" : "text-stone-600"}`}
            >
              {texto}
            </button>
          ))}
        </div>
        <p className="text-sm text-stone-600">
          {cuenta("enviado")} para revisar · {cuenta("observado")} observados ·{" "}
          {cuenta("aprobado")} aprobados
        </p>
      </div>

      {vista === "cliente" && !editando && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {TIPOS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setEditando(nuevo(t.id))}
              className="rounded-xl border border-stone-200 bg-white p-4 text-left shadow-sm transition hover:border-marca hover:shadow"
            >
              <div
                className={`text-xs font-semibold uppercase tracking-wide ${t.id === "socios" ? "text-stone-500" : t.entra ? "text-emerald-700" : "text-red-700"}`}
              >
                {t.id === "socios"
                  ? "Entra o sale plata"
                  : t.entra
                    ? "Entra plata"
                    : "Sale plata"}
              </div>
              <div className="mt-1 font-semibold">{t.nombre}</div>
              <div className="text-sm text-stone-500">{t.ayuda}</div>
            </button>
          ))}
        </section>
      )}

      {editando && (
        <Formulario
          key={editando.id}
          inicial={editando}
          clientes={clientes}
          proveedores={proveedores}
          unidades={unidades}
          cuentas={cuentas}
          onGuardar={guardar}
          onCancelar={() => setEditando(null)}
        />
      )}

      <section className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <h3 className="border-b border-stone-200 px-4 py-3 font-semibold">
          Movimientos cargados ({movimientos.length})
        </h3>
        {movimientos.length === 0 ? (
          <p className="p-6 text-sm text-stone-500">
            Todavía no hay movimientos. Elegí arriba qué querés registrar.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {movimientos.map((m) => {
              const t = TIPOS.find((x) => x.id === m.tipo)!;
              const entra = entraPlata(m);
              const estado = ESTADOS[m.estado];
              return (
                <li key={m.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <div className="w-20 shrink-0 text-stone-500">
                      {fechaCorta(m.fecha)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">
                        {descripcion(m)}
                      </div>
                      <div className="text-xs text-stone-500">
                        {unidades.unidades.length > 0 && (
                          <span className="font-medium text-stone-700">
                            {nombreUnidad(
                              unidadDeMovimiento(m, unidades),
                              unidades,
                            )}{" "}
                            ·{" "}
                          </span>
                        )}
                        {t.nombre} ·{" "}
                        {(() => {
                          const c = cuentas.find(
                            (x) => x.id === m.cuentaBancaria,
                          );
                          return c
                            ? nombreCuentaBancaria(c)
                            : MEDIOS.find((x) => x.id === m.medio)?.nombre;
                        })()}
                        {m.nota && <> · {m.nota}</>}
                      </div>
                    </div>
                    <div
                      className={`cifra shrink-0 font-semibold ${entra ? "text-emerald-700" : "text-red-700"}`}
                    >
                      {entra ? "" : "-"}
                      {pesos(m.importe)}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${estado.clase}`}
                    >
                      {estado.texto}
                    </span>
                  </div>
                  {m.estado === "observado" && m.observacion && (
                    <p className="mt-2 rounded-md bg-red-50 p-2 text-red-800">
                      Observación del estudio: {m.observacion}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {vista === "cliente" && m.estado !== "aprobado" && (
                      <button
                        type="button"
                        onClick={() => setEditando(m)}
                        className="rounded px-2 py-1 text-stone-600 hover:bg-stone-100"
                      >
                        {m.estado === "observado" ? "Corregir" : "Editar"}
                      </button>
                    )}
                    {vista === "estudio" && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setAbierto(abierto === m.id ? null : m.id)
                          }
                          className="rounded px-2 py-1 text-stone-600 hover:bg-stone-100"
                        >
                          {abierto === m.id ? "Ocultar asiento" : "Ver asiento"}
                        </button>
                        {m.estado !== "aprobado" && (
                          <button
                            type="button"
                            onClick={() =>
                              actualizar(m.id, {
                                estado: "aprobado",
                                observacion: undefined,
                              })
                            }
                            className="rounded bg-emerald-700 px-3 py-1 font-medium text-white hover:opacity-90"
                          >
                            Aprobar
                          </button>
                        )}
                        {m.estado !== "observado" && (
                          <button
                            type="button"
                            onClick={() =>
                              setObservando({ id: m.id, texto: "" })
                            }
                            className="rounded border border-red-300 px-3 py-1 font-medium text-red-700 hover:bg-red-50"
                          >
                            Observar
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  {observando?.id === m.id && (
                    <form
                      className="mt-2 flex flex-wrap gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!observando.texto.trim()) return;
                        actualizar(m.id, {
                          estado: "observado",
                          observacion: observando.texto.trim(),
                        });
                        setObservando(null);
                      }}
                    >
                      <input
                        id={`observacion-${m.id}`}
                        autoFocus
                        value={observando.texto}
                        onChange={(e) =>
                          setObservando({ id: m.id, texto: e.target.value })
                        }
                        placeholder="Qué tiene que corregir el cliente"
                        className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5"
                      />
                      <button
                        type="submit"
                        className="rounded-md bg-red-700 px-3 py-1.5 font-medium text-white"
                      >
                        Enviar observación
                      </button>
                      <button
                        type="button"
                        onClick={() => setObservando(null)}
                        className="rounded-md px-3 py-1.5 text-stone-600"
                      >
                        Cancelar
                      </button>
                    </form>
                  )}
                  {vista === "estudio" && abierto === m.id && (
                    <div className="mt-2 rounded-md bg-stone-50 p-3">
                      <Asiento m={m} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
