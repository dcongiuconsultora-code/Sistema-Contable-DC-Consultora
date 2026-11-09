"use client";

import { useEffect, useMemo, useState } from "react";
import { leerXlsx } from "@/lib/arca/leer-archivo";
import type { Asiento } from "@/lib/contabilidad/diario";
import {
  calcularEstados,
  type EstadosContables,
  type Renglon,
} from "@/lib/contabilidad/estados";
import type { SaldosIniciales } from "@/lib/contabilidad/indicadores";
import type {
  DatosCierre,
  Empresa,
  Repositorio,
} from "@/lib/datos/repositorio";
import { fechaCorta, pesos } from "@/lib/formato";
import {
  INDICES_FACPCE,
  type Indices,
  indicesDesdeFilas,
  ultimoMes,
} from "@/lib/inflacion/indices";
import { nombreCuenta } from "@/lib/plan/plan";
import { AxiImpositivo } from "./AxiImpositivo";

const BIENES_DE_CAMBIO = [
  "1.1.05.001",
  "1.1.05.002",
  "1.1.05.003",
  "1.1.05.004",
  "1.1.05.005",
  "1.1.05.006",
];

/** Un año después del cierre anterior. */
function cierreSugerido(anterior: string) {
  if (!anterior) return "";
  const d = new Date(`${anterior}T12:00:00Z`);
  const fin = new Date(
    Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()),
  );
  // Si el anterior era fin de mes, el nuevo también.
  const finDeMes =
    new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate() === d.getUTCDate();
  if (finDeMes)
    fin.setUTCDate(
      new Date(
        Date.UTC(fin.getUTCFullYear(), fin.getUTCMonth() + 1, 0),
      ).getUTCDate(),
    );
  return fin.toISOString().slice(0, 10);
}

function nombreMes(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function numero(texto: string) {
  const limpio = texto.replace(/\./g, "").replace(",", ".").trim();
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function Tabla({
  titulo,
  renglones,
  total,
  conAnterior = true,
}: {
  titulo: string;
  renglones: Renglon[];
  total: [string, number, number | null];
  conAnterior?: boolean;
}) {
  const visibles = renglones.filter((r) => r.actual || r.anterior);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs uppercase tracking-wide text-stone-500">
          <th className="py-1.5 font-medium">{titulo}</th>
          <th className="py-1.5 text-right font-medium">Actual</th>
          {conAnterior && (
            <th className="py-1.5 text-right font-medium">Anterior</th>
          )}
        </tr>
      </thead>
      <tbody className="divide-y divide-stone-100">
        {visibles.length === 0 && (
          <tr>
            <td className="py-1.5 text-stone-400" colSpan={3}>
              Sin saldos
            </td>
          </tr>
        )}
        {visibles.map((r) => (
          <tr key={`${titulo}-${r.clave}`}>
            <td className="py-1.5">
              <details>
                <summary className="cursor-pointer">{r.nombre}</summary>
                <ul className="mt-1 space-y-0.5 pl-4 text-xs text-stone-500">
                  {r.cuentas.map((c) => (
                    <li key={c.codigo} className="flex justify-between gap-3">
                      <span>{c.nombre}</span>
                      <span className="tabular-nums">{pesos(c.actual)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            </td>
            <td className="cifra py-1.5">{pesos(r.actual)}</td>
            {conAnterior && (
              <td className="cifra py-1.5 text-stone-500">
                {r.anterior === null ? "—" : pesos(r.anterior)}
              </td>
            )}
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-stone-300 font-semibold">
          <td className="py-1.5">{total[0]}</td>
          <td className="cifra py-1.5">{pesos(total[1])}</td>
          {conAnterior && (
            <td className="cifra py-1.5 text-stone-500">
              {total[2] === null ? "—" : pesos(total[2])}
            </td>
          )}
        </tr>
      </tfoot>
    </table>
  );
}

function Vista({ e }: { e: EstadosContables }) {
  const t = e.totales;
  const r = (clave: string) =>
    e.resultados.find((x) => x.clave === clave)?.actual ?? 0;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold">Estado de situación patrimonial</h3>
        <Tabla
          titulo="Activo corriente"
          renglones={e.rubros.AC}
          total={["Total", ...t.activoCorriente]}
        />
        <Tabla
          titulo="Activo no corriente"
          renglones={e.rubros.ANC}
          total={["Total del activo", ...t.activo]}
        />
        <Tabla
          titulo="Pasivo corriente"
          renglones={e.rubros.PC}
          total={["Total", ...t.pasivoCorriente]}
        />
        <Tabla
          titulo="Pasivo no corriente"
          renglones={e.rubros.PNC}
          total={["Total del pasivo", ...t.pasivo]}
        />
        <div className="flex justify-between border-t-2 border-stone-300 pt-2 font-semibold">
          <span>Patrimonio neto</span>
          <span className="flex gap-6 tabular-nums">
            <span>{pesos(t.patrimonioNeto[0])}</span>
            <span className="text-stone-500">{pesos(t.patrimonioNeto[1])}</span>
          </span>
        </div>
      </section>
      <section className="h-fit space-y-4 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h3 className="font-semibold">Estado de resultados</h3>
        <Tabla
          titulo="Concepto"
          renglones={e.resultados}
          total={["Ganancia (pérdida) del ejercicio", e.resultado, null]}
          conAnterior={false}
        />
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-stone-500">Ganancia bruta</dt>
          <dd className="cifra">{pesos(e.gananciaBruta)}</dd>
          <dt className="text-stone-500">Antes del impuesto</dt>
          <dd className="cifra">{pesos(e.resultadoAntesDeImpuesto)}</dd>
          {e.reexpresion && (
            <>
              <dt className="text-stone-500">RECPAM incluido</dt>
              <dd className="cifra">{pesos(e.reexpresion.recpam)}</dd>
            </>
          )}
          <dt className="text-stone-500">Ventas</dt>
          <dd className="cifra">{pesos(r("ventas"))}</dd>
        </dl>
        <h3 className="pt-2 font-semibold">Flujo de efectivo</h3>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-stone-500">Efectivo al inicio</dt>
          <dd className="cifra">{pesos(e.flujo.inicio)}</dd>
          <dt className="text-stone-500">Efectivo al cierre</dt>
          <dd className="cifra">{pesos(e.flujo.cierre)}</dd>
          {e.enMonedaHomogenea && (
            <>
              <dt className="text-stone-500">Efecto de la inflación</dt>
              <dd className="cifra">{pesos(e.flujo.resultadosDelEfectivo)}</dd>
            </>
          )}
        </dl>
      </section>
    </div>
  );
}

export function Balance({
  repo,
  empresa,
  asientos,
  iniciales,
}: {
  repo?: Repositorio;
  empresa: Empresa;
  asientos: Asiento[];
  iniciales: SaldosIniciales;
}) {
  const [cierre, setCierre] = useState(() => cierreSugerido(iniciales.fecha));
  const [homogenea, setHomogenea] = useState(true);
  const [indices, setIndices] = useState<Indices>(INDICES_FACPCE);
  const [datos, setDatos] = useState<DatosCierre>({});
  const [inventario, setInventario] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);

  useEffect(() => {
    if (!cierre && iniciales.fecha) setCierre(cierreSugerido(iniciales.fecha));
  }, [iniciales.fecha, cierre]);

  useEffect(() => {
    repo?.indices().then(setIndices, (e) => setError(e.message));
  }, [repo]);

  // Lo guardado para este cierre (o, si es nuevo, la carátula del último).
  useEffect(() => {
    if (!repo || !cierre) return;
    let vigente = true;
    (async () => {
      const guardado = await repo.cierre(empresa.id, cierre);
      const base = guardado ?? {
        ...((await repo.ultimoCierre(empresa.id)) ?? {}),
        existenciaFinal: undefined,
      };
      if (!vigente) return;
      setDatos(base);
      setInventario(
        Object.fromEntries(
          Object.entries(base.existenciaFinal ?? {}).map(([c, v]) => [
            c,
            String(v).replace(".", ","),
          ]),
        ),
      );
    })().catch((e) => setError(e.message));
    return () => {
      vigente = false;
    };
  }, [repo, empresa.id, cierre]);

  const existenciaFinal = useMemo(() => {
    const ef: Record<string, number> = {};
    for (const [c, t] of Object.entries(inventario)) {
      const n = numero(t);
      if (n !== null) ef[c] = n;
    }
    return ef;
  }, [inventario]);

  const valido = Boolean(iniciales.fecha && cierre && cierre > iniciales.fecha);
  const calculo = useMemo(() => {
    if (!valido) return { estados: null, problema: null };
    try {
      return {
        estados: calcularEstados({
          asientos,
          iniciales,
          cierre,
          indices: homogenea ? indices : null,
          existenciaFinal,
        }),
        problema: null,
      };
    } catch (e) {
      return {
        estados: null,
        problema: e instanceof Error ? e.message : String(e),
      };
    }
  }, [
    valido,
    asientos,
    iniciales,
    cierre,
    homogenea,
    indices,
    existenciaFinal,
  ]);
  const estados = calculo.estados;

  async function guardar() {
    if (!repo) return;
    await repo.guardarCierre(empresa.id, cierre, { ...datos, existenciaFinal });
  }

  // Lo que cambia el estudio se guarda solo, un segundo después de dejar de escribir.
  const [sucio, setSucio] = useState(false);
  useEffect(() => {
    if (!sucio || !repo) return;
    const t = setTimeout(() => {
      setSucio(false);
      guardar().catch((e) => setError(e.message));
    }, 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucio, datos, existenciaFinal]);

  async function descargar() {
    if (!estados) return;
    setDescargando(true);
    setError(null);
    try {
      await guardar();
      const { armarExcelRT54, PLANTILLA_RT54 } =
        await import("@/lib/contabilidad/exportar-rt54");
      const respuesta = await fetch(PLANTILLA_RT54);
      if (!respuesta.ok) throw new Error("No se encontró el modelo RT 54.");
      const archivo = await armarExcelRT54(
        await respuesta.arrayBuffer(),
        estados,
        {
          razonSocial: empresa.razon_social,
          cuit: empresa.cuit,
          actividad: datos.actividad,
          domicilio: datos.domicilio,
          ejercicioNumero: datos.ejercicioNumero,
        },
        asientos,
        homogenea ? indices : null,
      );
      const url = URL.createObjectURL(
        new Blob([archivo], {
          type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `Estados contables ${empresa.razon_social} ${cierre}.xlsx`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDescargando(false);
    }
  }

  async function subirIndices(archivo: File) {
    setError(null);
    setAviso(null);
    try {
      const nuevos = indicesDesdeFilas(
        await leerXlsx(await archivo.arrayBuffer()),
      );
      const cargados = repo ? await repo.guardarIndices(nuevos) : 0;
      setIndices({ ...indices, ...nuevos });
      setAviso(
        `Índices actualizados hasta ${nombreMes(ultimoMes(nuevos) ?? "")}${cargados ? ` (${cargados} meses nuevos o corregidos)` : ""}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const ultimo = ultimoMes(indices);
  const r = estados?.reexpresion;

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold">Balance</h1>
        <p className="mt-1 max-w-3xl text-stone-600">
          Estados contables completos con el modelo de la RT 54: situación
          patrimonial, resultados, evolución del patrimonio neto, flujo de
          efectivo, anexos y notas, en moneda homogénea (RT 6) con los índices
          de la FACPCE. Se arman con todo lo cargado en el sistema más los
          saldos de inicio del último balance.
        </p>
      </section>

      {!iniciales.fecha ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Primero cargá los saldos del último balance en Inicio → “Cómo se
          calcula”. Son el punto de partida del ejercicio.
        </p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold">Ejercicio</h3>
            <p className="text-sm text-stone-600">
              Inicia el día siguiente al último balance (
              {fechaCorta(iniciales.fecha)}).
            </p>
            <label className="block text-sm">
              <span className="text-stone-600">Fecha de cierre</span>
              <input
                id="balance-cierre"
                type="date"
                value={cierre}
                min={iniciales.fecha}
                onChange={(e) => setCierre(e.target.value)}
                className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2"
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                id="balance-homogenea"
                type="checkbox"
                checked={homogenea}
                onChange={(e) => setHomogenea(e.target.checked)}
                className="mt-1"
              />
              <span>
                En moneda homogénea (ajuste por inflación, RT 6)
                {homogenea && r && (
                  <span className="block text-xs text-stone-500">
                    Coeficiente {r.coeficienteInicio.toFixed(4)} · índice{" "}
                    {nombreMes(r.indiceInicio.mes)} a{" "}
                    {nombreMes(r.indiceCierre.mes)}
                  </span>
                )}
              </span>
            </label>
            {homogenea && r?.indiceCierre.estimado && (
              <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">
                Todavía no está el índice del mes de cierre: se usó el de{" "}
                {nombreMes(r.indiceCierre.mes)}. Cuando la FACPCE lo publique,
                subí el archivo nuevo abajo.
              </p>
            )}
          </section>

          <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold">Inventario final</h3>
            <p className="text-sm text-stone-600">
              Valor de las existencias al cierre. El costo de lo vendido se
              calcula con la diferencia de inventarios.
            </p>
            {BIENES_DE_CAMBIO.map((c) => (
              <label key={c} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate text-stone-600">
                  {nombreCuenta(c)}
                </span>
                <input
                  id={`inventario-${c}`}
                  inputMode="decimal"
                  value={inventario[c] ?? ""}
                  onChange={(e) => {
                    setInventario({ ...inventario, [c]: e.target.value });
                    setSucio(true);
                  }}
                  placeholder="0,00"
                  className="w-36 rounded-md border border-stone-300 px-2 py-1 text-right tabular-nums"
                />
              </label>
            ))}
          </section>

          <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold">Carátula</h3>
            {(
              [
                ["actividad", "Actividad principal"],
                ["domicilio", "Domicilio legal"],
                ["ejercicioNumero", "Ejercicio económico Nº"],
              ] as const
            ).map(([campo, etiqueta]) => (
              <label key={campo} className="block text-sm">
                <span className="text-stone-600">{etiqueta}</span>
                <input
                  id={`caratula-${campo}`}
                  value={datos[campo] ?? ""}
                  onChange={(e) => {
                    setDatos({ ...datos, [campo]: e.target.value });
                    setSucio(true);
                  }}
                  className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-1.5"
                />
              </label>
            ))}
          </section>
        </div>
      )}

      {estados && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={descargar}
              disabled={descargando}
              className="rounded-md bg-marca px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {descargando
                ? "Armando el Excel…"
                : "Descargar estados contables (Excel, modelo RT 54)"}
            </button>
            {estados.diferencia !== 0 && (
              <span className="text-sm text-amber-700">
                ⚠ El activo no iguala al pasivo más el patrimonio neto (
                {pesos(estados.diferencia)}): revisá los saldos de inicio.
              </span>
            )}
          </div>
          <Vista e={estados} />
          <AxiImpositivo
            asientos={asientos}
            iniciales={iniciales}
            cierre={cierre}
            indices={indices}
            correcciones={datos.axi ?? {}}
            onCorrecciones={(axi) => {
              setDatos({ ...datos, axi });
              setSucio(true);
            }}
            empresa={empresa.razon_social}
          />
        </>
      )}

      <section className="rounded-xl border border-stone-200 bg-white p-5 text-sm shadow-sm">
        <h3 className="font-semibold">Índices de inflación (FACPCE)</h3>
        <p className="mt-1 text-stone-600">
          IPC nacional empalmado con IPIM (Res. JG 539/18). Cargado hasta{" "}
          <strong>{ultimo ? nombreMes(ultimo) : "—"}</strong>
          {ultimo && ` (${indices[ultimo].toLocaleString("es-AR")})`}. Cada mes
          bajá el Excel nuevo de la FACPCE y subilo acá.
        </p>
        <input
          id="subir-indices"
          type="file"
          accept=".xlsx"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) subirIndices(f);
            e.target.value = "";
          }}
          className="mt-2 block text-sm"
        />
        {aviso && <p className="mt-2 text-emerald-700">{aviso}</p>}
      </section>
      {(error ?? calculo.problema) && (
        <p className="text-sm text-red-700">{error ?? calculo.problema}</p>
      )}
    </div>
  );
}
