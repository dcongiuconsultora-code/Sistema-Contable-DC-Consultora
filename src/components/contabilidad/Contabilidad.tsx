"use client";

import { useMemo, useState } from "react";
import { Balance } from "@/components/balance/Balance";
import { LibroDiario } from "@/components/diario/LibroDiario";
import { Mayor } from "@/components/diario/Mayor";
import { EditorSaldos } from "@/components/tablero/Tablero";
import { ImportarBalance } from "./ImportarBalance";
import type { Asiento } from "@/lib/contabilidad/diario";
import type { SaldosIniciales } from "@/lib/contabilidad/indicadores";
import {
  indicadoresMensuales,
  resultadosMensuales,
} from "@/lib/contabilidad/sumas-saldos";
import type { Empresa, Repositorio } from "@/lib/datos/repositorio";
import { fechaCorta, pesos } from "@/lib/formato";
import type { ConfigUnidades } from "@/lib/unidades/unidades";
import type { Inventario } from "@/lib/inventarios/inventarios";

export type VistaContable =
  | "asientos"
  | "diario"
  | "mayor"
  | "sumas"
  | "mensuales"
  | "estados"
  | "axi"
  | "rt6"
  | "cierre"
  | "saldos";

/** Menú de Contabilidad: grupos y vistas (como en el encabezado). */
export const MENU_CONTABLE: [string, [VistaContable, string][]][] = [
  [
    "Registros contables",
    [
      ["asientos", "Asientos manuales"],
      ["diario", "Libro diario"],
      ["mayor", "Libro mayor"],
    ],
  ],
  [
    "Papeles de trabajo",
    [
      ["sumas", "Sumas y saldos"],
      ["mensuales", "Resultados mensuales"],
    ],
  ],
  [
    "Estados contables",
    [
      ["estados", "Balance y estados (anual o intermedio)"],
      ["rt6", "Ajuste por inflación contable (RT 6)"],
      ["cierre", "Cierre del ejercicio"],
    ],
  ],
  ["Configuración", [["saldos", "Ejercicio y saldos de inicio"]]],
];

function hoy() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sumarDias(fecha: string, dias: number) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Cierre del ejercicio: un año después del último balance. */
function finDeEjercicio(anterior: string) {
  const d = new Date(`${anterior}T12:00:00Z`);
  const fin = new Date(
    Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth() + 1, 0),
  );
  return fin.toISOString().slice(0, 10);
}

const NOMBRES_MES = [
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

const porcentaje = (v: number | null) =>
  v === null
    ? "—"
    : `${(v * 100).toLocaleString("es-AR", { maximumFractionDigits: 1 })} %`;
const veces = (v: number | null) =>
  v === null ? "—" : v.toLocaleString("es-AR", { maximumFractionDigits: 2 });

/** Semáforo simple: verde si está bien, ámbar si conviene mirarlo, rojo si preocupa. */
function color(clave: string, v: number | null) {
  if (v === null) return "";
  const bien =
    clave === "margen"
      ? v > 0.05
      : clave === "endeudamiento"
        ? v < 1
        : v >= (clave === "liquidez" ? 1.5 : 1);
  const mal =
    clave === "margen"
      ? v < 0
      : clave === "endeudamiento"
        ? v > 2
        : v < (clave === "liquidez" ? 1 : 0.7);
  return bien ? "text-emerald-700" : mal ? "text-red-700" : "text-amber-700";
}

function ResultadosMensuales({
  asientos,
  iniciales,
  desde,
  hasta,
}: {
  asientos: Asiento[];
  iniciales: SaldosIniciales;
  desde: string;
  hasta: string;
}) {
  const r = useMemo(
    () => resultadosMensuales(asientos, desde || "1900-01-01", hasta),
    [asientos, desde, hasta],
  );
  const ind = useMemo(
    () =>
      iniciales.fecha
        ? indicadoresMensuales(
            asientos,
            iniciales,
            r.meses,
            r.filas.find((f) => f.clave === "resultado")!.valores,
            r.filas.find((f) => f.clave === "ventas")!.valores,
            hasta,
          )
        : [],
    [asientos, iniciales, r, hasta],
  );
  const filasInd: [
    string,
    string,
    (i: (typeof ind)[number]) => string,
    keyof (typeof ind)[number] | null,
  ][] = [
    [
      "margen",
      "Rentabilidad del mes (resultado / ventas)",
      (i) => porcentaje(i.margen),
      "margen",
    ],
    [
      "liquidez",
      "Liquidez corriente (AC / PC)",
      (i) => veces(i.liquidez),
      "liquidez",
    ],
    [
      "acida",
      "Prueba ácida (AC sin stock / PC)",
      (i) => veces(i.pruebaAcida),
      "pruebaAcida",
    ],
    [
      "endeudamiento",
      "Endeudamiento (pasivo / PN)",
      (i) => veces(i.endeudamiento),
      "endeudamiento",
    ],
    [
      "capital",
      "Capital de trabajo (AC − PC)",
      (i) => pesos(i.capitalDeTrabajo),
      null,
    ],
    [
      "caja",
      "Caja y bancos al fin del mes",
      (i) => pesos(i.disponibilidades),
      null,
    ],
  ];
  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-semibold">Resultados mensuales</h1>
        <p className="mt-1 max-w-3xl text-stone-600">
          El estado de resultados mes por mes, en cifras históricas, para ver
          cómo viene el año y armar intermedios, con los indicadores de
          rentabilidad y liquidez de cada mes.
        </p>
      </section>
      <section className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="sticky left-0 bg-stone-50 px-3 py-2 text-left">
                Concepto
              </th>
              {r.meses.map((m) => (
                <th key={m} className="px-3 py-2 text-right">
                  {NOMBRES_MES[Number(m.slice(5)) - 1]} {m.slice(2, 4)}
                </th>
              ))}
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {r.filas.map((f) => (
              <tr
                key={f.clave}
                className={f.total ? "bg-stone-50 font-semibold" : ""}
              >
                <td className="sticky left-0 whitespace-nowrap bg-inherit px-3 py-1.5">
                  {f.nombre}
                </td>
                {f.valores.map((v, i) => (
                  <td
                    key={r.meses[i]}
                    className={`cifra whitespace-nowrap px-3 py-1.5 ${v < 0 ? "text-red-700" : ""}`}
                  >
                    {v ? pesos(v) : "—"}
                  </td>
                ))}
                <td
                  className={`cifra whitespace-nowrap px-3 py-1.5 font-semibold ${f.total < 0 ? "text-red-700" : ""}`}
                >
                  {pesos(f.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {ind.length > 0 && (
        <section className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
          <h3 className="px-3 pt-3 font-semibold">Rentabilidad y liquidez</h3>
          <p className="px-3 text-xs text-stone-500">
            Con los saldos acumulados al último día de cada mes. Verde: bien ·
            ámbar: para mirar · rojo: preocupa.
          </p>
          <table className="mt-2 w-full text-sm">
            <thead className="bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="sticky left-0 bg-stone-50 px-3 py-2 text-left">
                  Indicador
                </th>
                {ind.map((i) => (
                  <th key={i.mes} className="px-3 py-2 text-right">
                    {NOMBRES_MES[Number(i.mes.slice(5)) - 1]}{" "}
                    {i.mes.slice(2, 4)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {filasInd.map(([clave, nombre, texto, campo]) => (
                <tr key={clave}>
                  <td className="sticky left-0 whitespace-nowrap bg-white px-3 py-1.5">
                    {nombre}
                  </td>
                  {ind.map((i) => (
                    <td
                      key={i.mes}
                      className={`cifra whitespace-nowrap px-3 py-1.5 ${campo ? color(campo, i[campo] as number | null) : ""}`}
                    >
                      {texto(i)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

/** Todo lo contable del estudio, con un período común arriba. */
export function Contabilidad({
  vista,
  onVista,
  repo,
  empresa,
  asientos,
  inventarios = [],
  iniciales,
  onIniciales,
  unidades,
  onGuardarAsiento,
  onBorrarAsiento,
}: {
  vista: VistaContable;
  onVista: (v: VistaContable) => void;
  repo?: Repositorio;
  empresa: Empresa;
  asientos: Asiento[];
  inventarios?: Inventario[];
  iniciales: SaldosIniciales;
  onIniciales: (s: SaldosIniciales) => void;
  unidades: ConfigUnidades;
  onGuardarAsiento: (a: Asiento) => Promise<void>;
  onBorrarAsiento: (id: string) => Promise<void>;
}) {
  const inicio = iniciales.fecha ? sumarDias(iniciales.fecha, 1) : "";
  const fin = iniciales.fecha ? finDeEjercicio(iniciales.fecha) : "";
  const [desde, setDesde] = useState(inicio);
  const [hasta, setHasta] = useState(() => (fin && fin < hoy() ? fin : hoy()));
  const [cuentaMayor, setCuentaMayor] = useState("");
  const desdeEfectivo = desde || inicio;

  const atajos: [string, string, string][] = fin
    ? [
        ["Ejercicio completo", inicio, fin],
        ["Hasta hoy", inicio, hoy() < fin ? hoy() : fin],
      ]
    : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
        <div className="mr-2 text-sm">
          <div className="text-stone-500">Ejercicio</div>
          <div className="font-semibold">
            {inicio
              ? `${fechaCorta(inicio)} al ${fechaCorta(fin)}`
              : "Sin saldos de inicio"}
          </div>
        </div>
        <label className="block text-sm">
          <span className="text-stone-600">Desde</span>
          <input
            id="periodo-desde"
            type="date"
            value={desdeEfectivo}
            onChange={(e) => setDesde(e.target.value)}
            className="mt-1 block rounded-md border border-stone-300 px-2 py-1.5"
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">
            {vista === "estados" ||
            vista === "axi" ||
            vista === "rt6" ||
            vista === "cierre"
              ? "Cierre (anual o intermedio)"
              : "Hasta"}
          </span>
          <input
            id="periodo-hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="mt-1 block rounded-md border border-stone-300 px-2 py-1.5"
          />
        </label>
        {atajos.map(([texto, d, h]) => (
          <button
            key={texto}
            type="button"
            onClick={() => {
              setDesde(d);
              setHasta(h);
            }}
            className={`rounded-md px-3 py-1.5 text-sm ${desdeEfectivo === d && hasta === h ? "bg-marca-claro font-medium text-marca" : "text-stone-600 hover:bg-stone-100"}`}
          >
            {texto}
          </button>
        ))}
      </div>

      {vista === "saldos" ? (
        <div className="space-y-4">
          <section>
            <h1 className="text-2xl font-semibold">
              Ejercicio y saldos de inicio
            </h1>
            <p className="mt-1 max-w-3xl text-stone-600">
              La fecha del último balance cerrado define el ejercicio (empieza
              el día siguiente y dura un año). Los saldos de ese balance son el
              punto de partida de la contabilidad.
            </p>
          </section>
          <ImportarBalance
            repo={repo}
            empresaId={empresa.id}
            iniciales={iniciales}
            onIniciales={onIniciales}
          />
          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
            <h3 className="mb-2 font-semibold">Saldos de inicio cargados</h3>
            <EditorSaldos iniciales={iniciales} onIniciales={onIniciales} />
          </div>
        </div>
      ) : vista === "mayor" ? (
        <Mayor
          cuenta={cuentaMayor}
          onCuenta={setCuentaMayor}
          desde={desdeEfectivo}
          hasta={hasta}
          asientos={asientos}
          iniciales={iniciales}
          empresa={empresa.razon_social}
        />
      ) : vista === "mensuales" ? (
        <ResultadosMensuales
          asientos={asientos}
          iniciales={iniciales}
          desde={desdeEfectivo}
          hasta={hasta}
        />
      ) : vista === "estados" ||
        vista === "axi" ||
        vista === "rt6" ||
        vista === "cierre" ? (
        <Balance
          key={vista}
          modo={vista}
          repo={repo}
          empresa={empresa}
          asientos={asientos}
          inventarios={inventarios}
          iniciales={iniciales}
          cierre={hasta}
          onCierre={setHasta}
          onIniciales={
            vista === "cierre"
              ? async (s) => {
                  // Se guardan los saldos de inicio del ejercicio que se cierra, por las dudas.
                  if (repo) {
                    const previo =
                      (await repo
                        .cierre(empresa.id, s.fecha)
                        .catch(() => null)) ?? {};
                    await repo
                      .guardarCierre(empresa.id, s.fecha, {
                        ...previo,
                        saldosInicioEjercicio: iniciales,
                      })
                      .catch(() => {});
                  }
                  onIniciales(s);
                  setDesde(sumarDias(s.fecha, 1));
                  setHasta(finDeEjercicio(s.fecha));
                }
              : undefined
          }
        />
      ) : (
        <LibroDiario
          key={vista}
          vista={vista}
          desde={desdeEfectivo}
          hasta={hasta}
          asientos={asientos}
          iniciales={iniciales}
          unidades={unidades}
          empresa={empresa.razon_social}
          onGuardar={onGuardarAsiento}
          onBorrar={onBorrarAsiento}
          onVerMayor={(codigo) => {
            setCuentaMayor(codigo);
            onVista("mayor");
          }}
        />
      )}
    </div>
  );
}
