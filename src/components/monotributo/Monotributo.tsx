"use client";

import { useEffect, useMemo, useState } from "react";
import type { Comprobante } from "@/lib/arca/tipos";
import type { Empresa, Repositorio } from "@/lib/datos/repositorio";
import { pesos } from "@/lib/formato";
import {
  type Actividad,
  type Categoria,
  categoriaQueCorresponde,
  categoriasDesdeTexto,
  proximaRecategorizacion,
  ultimos12Meses,
} from "@/lib/monotributo/monotributo";

const CLAVE_TABLA = "monotributo_categorias";
const MESES = [
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

function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nombreMes(mes: string) {
  return `${MESES[Number(mes.slice(5)) - 1]} ${mes.slice(2, 4)}`;
}

/** Tablero del monotributista: facturación de 12 meses, categoría y recategorización. */
export function Monotributo({
  repo,
  empresa,
  ventas,
  compras,
  acreditaciones = [],
  esEstudio,
  onEmpresa,
}: {
  repo?: Repositorio;
  empresa: Empresa;
  ventas: Comprobante[];
  compras: Comprobante[];
  /** Créditos de los resúmenes bancarios subidos. */
  acreditaciones?: { fecha: string; importe: number }[];
  esEstudio: boolean;
  onEmpresa?: (e: Empresa) => void;
}) {
  const [tabla, setTabla] = useState<Categoria[]>([]);
  const [pegado, setPegado] = useState("");
  const [editandoTabla, setEditandoTabla] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hoy = hoyIso();
  // Por defecto, los 12 meses que terminan en el último mes con facturas (o el mes pasado).
  const ultimoConVentas = ventas
    .map((v) => v.fecha.slice(0, 7))
    .sort()
    .at(-1);
  const [mes, setMes] = useState(ultimoConVentas ?? hoy.slice(0, 7));

  useEffect(() => {
    repo?.parametro<Categoria[]>(CLAVE_TABLA).then(
      (t) => setTabla(t ?? []),
      (e) => setError(e.message),
    );
  }, [repo]);

  const r = useMemo(
    () => ultimos12Meses(ventas, compras, mes, acreditaciones),
    [ventas, compras, mes, acreditaciones],
  );
  // Comparación banco vs. facturado, solo en los meses con resumen.
  const facturadoConBanco = r.meses.reduce(
    (s, m, i) => (r.mesesConBanco.includes(m) ? s + r.facturado[i] : s),
    0,
  );
  const diferenciaBanco = r.totalBanco - facturadoConBanco;
  const corresponde = categoriaQueCorresponde(r.totalFacturado, tabla);
  const actual =
    tabla.find((c) => c.letra === empresa.categoria_monotributo) ?? null;
  const actividad: Actividad = empresa.actividad_monotributo ?? "servicios";
  const cuota = (c: Categoria | null) =>
    c ? (actividad === "bienes" ? c.cuotaBienes : c.cuotaServicios) : null;
  const tope = actual?.tope ?? corresponde?.tope ?? tabla.at(-1)?.tope ?? 0;
  const uso = tope ? r.totalFacturado / tope : 0;
  const recat = proximaRecategorizacion(hoy);
  const maximo = Math.max(1, ...r.facturado, ...r.comprado, ...r.banco);
  const excluido = tabla.length > 0 && !corresponde;

  async function cambiarEmpresa(cambios: Partial<Empresa>) {
    if (!repo) return;
    setError(null);
    try {
      await repo.actualizarEmpresa(empresa.id, cambios);
      onEmpresa?.({ ...empresa, ...cambios });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function guardarTabla() {
    const nueva = categoriasDesdeTexto(pegado);
    if (nueva.length < 3)
      return setError(
        "No pude leer la tabla: pegá los renglones de las categorías (letra, tope y cuotas).",
      );
    setError(null);
    try {
      await repo?.guardarParametro(CLAVE_TABLA, nueva);
      setTabla(nueva);
      setEditandoTabla(false);
      setPegado("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl bg-gradient-to-br from-marca to-[#7a2412] p-6 text-white shadow-sm">
        <p className="text-sm opacity-80">Hola, {empresa.razon_social}</p>
        <h1 className="mt-1 text-2xl font-semibold">Tu monotributo</h1>
        <div className="mt-4 flex flex-wrap items-end gap-x-10 gap-y-3">
          <div>
            <div className="text-sm opacity-80">
              Facturado en los últimos 12 meses
            </div>
            <div className="text-4xl font-semibold tabular-nums">
              {pesos(r.totalFacturado)}
            </div>
            <div className="text-xs opacity-70">
              {nombreMes(r.meses[0])} a {nombreMes(r.meses[11])}
            </div>
          </div>
          <div>
            <div className="text-sm opacity-80">Categoría que corresponde</div>
            <div className="text-4xl font-semibold">
              {tabla.length ? (corresponde?.letra ?? "Excede") : "—"}
            </div>
            {actual && (
              <div className="text-xs opacity-70">
                Hoy está en la {actual.letra}
              </div>
            )}
          </div>
          <label className="text-sm">
            <span className="opacity-80">Ver 12 meses hasta</span>
            <input
              id="mono-mes"
              type="month"
              value={mes}
              onChange={(e) => e.target.value && setMes(e.target.value)}
              className="mt-1 block rounded-md border border-white/30 bg-white/10 px-2 py-1 text-white"
            />
          </label>
        </div>
      </section>

      {!excluido && uso >= 0.8 && (
        <p
          className={`rounded-xl border p-4 text-sm ${uso > 1 ? "border-red-200 bg-red-50 text-red-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}
        >
          {uso > 1
            ? `⚠ Lo facturado en 12 meses (${pesos(r.totalFacturado)}) ya pasó el tope de la categoría ${actual?.letra ?? ""}: en la próxima recategorización hay que subir a la ${corresponde?.letra ?? "siguiente"}.`
            : `⚠ Atención: ya se usó el ${(uso * 100).toFixed(0)} % del tope de la categoría ${actual?.letra ?? corresponde?.letra ?? ""}. Quedan ${pesos(tope - r.totalFacturado)} para facturar en 12 meses.`}
        </p>
      )}
      {r.mesesConBanco.length > 0 &&
        diferenciaBanco > facturadoConBanco * 0.1 && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            ⚠ En los meses con resumen bancario entró al banco{" "}
            <strong>{pesos(r.totalBanco)}</strong> y se facturó{" "}
            <strong>{pesos(facturadoConBanco)}</strong>. Conviene revisar la
            diferencia ({pesos(diferenciaBanco)}): pueden ser transferencias
            entre cuentas propias, préstamos o ventas sin facturar, que ARCA
            también ve.
          </p>
        )}
      {excluido && (
        <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          ⚠ Lo facturado en 12 meses supera el tope de la categoría más alta:
          hay que revisar la exclusión del monotributo con el estudio.
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm md:col-span-2">
          <h3 className="font-semibold">¿Cuánto falta para el tope?</h3>
          {tabla.length === 0 ? (
            <p className="mt-2 text-sm text-stone-500">
              El estudio todavía no cargó la tabla de categorías vigente.
            </p>
          ) : (
            <>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-stone-100">
                <div
                  className={`h-full rounded-full ${uso > 1 ? "bg-red-600" : uso > 0.8 ? "bg-amber-500" : "bg-emerald-600"}`}
                  style={{ width: `${Math.min(100, uso * 100)}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-stone-700">
                {uso <= 1 ? (
                  <>
                    Usaste el <strong>{(uso * 100).toFixed(0)} %</strong> del
                    tope de la categoría {actual?.letra ?? corresponde?.letra} (
                    {pesos(tope)}). Podés facturar hasta{" "}
                    <strong>{pesos(tope - r.totalFacturado)}</strong> más en 12
                    meses sin pasarte.
                  </>
                ) : (
                  <>
                    Te pasaste del tope de la categoría {actual?.letra} por{" "}
                    <strong>{pesos(r.totalFacturado - tope)}</strong>: en la
                    próxima recategorización corresponde subir.
                  </>
                )}
              </p>
            </>
          )}
          <div className="mt-5">
            <div className="mb-1 flex gap-4 text-xs text-stone-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-3 rounded-sm bg-[#2a78d6]" />{" "}
                Facturado
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-3 rounded-sm bg-[#eb6834]" />{" "}
                Compras y gastos
              </span>
              {r.mesesConBanco.length > 0 && (
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-3 rounded-sm bg-stone-400" />{" "}
                  Entró al banco
                </span>
              )}
            </div>
            <div className="flex h-36 items-end gap-1.5">
              {r.meses.map((m, i) => (
                <div
                  key={m}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <div className="flex h-28 w-full items-end justify-center gap-0.5">
                    <div
                      title={`Facturado ${pesos(r.facturado[i])}`}
                      className="w-1/2 rounded-t-sm bg-[#2a78d6]"
                      style={{
                        height: `${(Math.max(0, r.facturado[i]) / maximo) * 100}%`,
                      }}
                    />
                    <div
                      title={`Compras ${pesos(r.comprado[i])}`}
                      className="w-1/2 rounded-t-sm bg-[#eb6834]"
                      style={{
                        height: `${(Math.max(0, r.comprado[i]) / maximo) * 100}%`,
                      }}
                    />
                    {r.mesesConBanco.length > 0 && (
                      <div
                        title={`Entró al banco ${pesos(r.banco[i])}`}
                        className="w-1/2 rounded-t-sm bg-stone-400"
                        style={{ height: `${(r.banco[i] / maximo) * 100}%` }}
                      />
                    )}
                  </div>
                  <span className="text-[10px] text-stone-500">
                    {nombreMes(m)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
          <h3 className="font-semibold">Recategorización</h3>
          <p className="text-sm text-stone-700">
            La próxima es en <strong>{recat.presentarEn}</strong>, con lo
            facturado en los 12 meses hasta {nombreMes(recat.cierre)}.
          </p>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-stone-500">Cuota mensual actual</dt>
              <dd className="tabular-nums">
                {cuota(actual) !== null ? pesos(cuota(actual)!) : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-stone-500">Con la que corresponde</dt>
              <dd className="tabular-nums">
                {cuota(corresponde) !== null ? pesos(cuota(corresponde)!) : "—"}
              </dd>
            </div>
            {r.mesesConBanco.length > 0 && (
              <div className="flex justify-between">
                <dt className="text-stone-500">
                  Entró al banco ({r.mesesConBanco.length} meses)
                </dt>
                <dd className="tabular-nums">{pesos(r.totalBanco)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-stone-500">Compras y gastos 12 meses</dt>
              <dd className="tabular-nums">{pesos(r.totalComprado)}</dd>
            </div>
          </dl>
          {esEstudio && (
            <div className="space-y-2 border-t border-stone-200 pt-3 text-sm">
              <label className="flex items-center justify-between gap-2">
                <span className="text-stone-600">Categoría actual</span>
                <select
                  id="mono-categoria"
                  value={empresa.categoria_monotributo ?? ""}
                  onChange={(e) =>
                    cambiarEmpresa({
                      categoria_monotributo: e.target.value || null,
                    })
                  }
                  className="rounded-md border border-stone-300 bg-white px-2 py-1"
                >
                  <option value="">—</option>
                  {(tabla.length
                    ? tabla.map((c) => c.letra)
                    : "ABCDEFGHIJK".split("")
                  ).map((l) => (
                    <option key={l} value={l}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center justify-between gap-2">
                <span className="text-stone-600">Actividad</span>
                <select
                  id="mono-actividad"
                  value={actividad}
                  onChange={(e) =>
                    cambiarEmpresa({
                      actividad_monotributo: e.target.value as Actividad,
                    })
                  }
                  className="rounded-md border border-stone-300 bg-white px-2 py-1"
                >
                  <option value="servicios">Servicios</option>
                  <option value="bienes">Venta de bienes</option>
                </select>
              </label>
            </div>
          )}
        </section>
      </div>

      {esEstudio && (
        <section className="rounded-xl border border-stone-200 bg-white p-5 text-sm shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Tabla de categorías vigente</h3>
            <button
              type="button"
              onClick={() => setEditandoTabla(!editandoTabla)}
              className="rounded-md border border-marca px-3 py-1 font-medium text-marca hover:bg-marca-claro"
            >
              {tabla.length ? "Actualizar tabla" : "Cargar tabla"}
            </button>
          </div>
          <p className="mt-1 text-stone-600">
            Es la misma para todos los monotributistas. Cuando ARCA la actualiza
            (febrero y agosto), copiá la tabla de su página o de un Excel y
            pegala acá: letra, tope de ingresos, cuota de servicios y cuota de
            venta de bienes.
          </p>
          {editandoTabla && (
            <div className="mt-3 space-y-2">
              <textarea
                id="mono-tabla"
                value={pegado}
                onChange={(e) => setPegado(e.target.value)}
                rows={8}
                placeholder={
                  "A\t$ 8.000.000,00\t$ 30.000,00\t$ 29.000,00\nB\t…"
                }
                className="block w-full rounded-md border border-stone-300 px-3 py-2 font-mono text-xs"
              />
              {pegado && (
                <p className="text-xs text-stone-500">
                  Se leen {categoriasDesdeTexto(pegado).length} categorías.
                </p>
              )}
              <button
                type="button"
                onClick={guardarTabla}
                className="rounded-md bg-marca px-4 py-1.5 font-medium text-white"
              >
                Guardar tabla
              </button>
            </div>
          )}
          {tabla.length > 0 && (
            <table className="mt-3 w-full">
              <thead className="text-left text-xs uppercase tracking-wide text-stone-500">
                <tr>
                  <th className="py-1">Cat.</th>
                  <th className="py-1 text-right">Tope 12 meses</th>
                  <th className="py-1 text-right">Cuota servicios</th>
                  <th className="py-1 text-right">Cuota bienes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {tabla.map((c) => (
                  <tr
                    key={c.letra}
                    className={
                      c.letra === corresponde?.letra
                        ? "bg-marca-claro font-medium"
                        : ""
                    }
                  >
                    <td className="py-1">{c.letra}</td>
                    <td className="cifra py-1">{pesos(c.tope)}</td>
                    <td className="cifra py-1">{pesos(c.cuotaServicios)}</td>
                    <td className="cifra py-1">{pesos(c.cuotaBienes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
