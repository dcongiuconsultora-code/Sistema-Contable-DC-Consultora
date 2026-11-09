"use client";

import { useMemo, useState } from "react";
import { Balance } from "@/components/balance/Balance";
import { LibroDiario } from "@/components/diario/LibroDiario";
import { Mayor } from "@/components/diario/Mayor";
import { EditorSaldos } from "@/components/tablero/Tablero";
import type { Asiento } from "@/lib/contabilidad/diario";
import type { SaldosIniciales } from "@/lib/contabilidad/indicadores";
import { resultadosMensuales } from "@/lib/contabilidad/sumas-saldos";
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
      ["axi", "Ajuste por inflación impositivo"],
    ],
  ],
  [
    "Estados contables",
    [["estados", "Balance y estados (anual o intermedio)"]],
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

function ResultadosMensuales({
  asientos,
  desde,
  hasta,
}: {
  asientos: Asiento[];
  desde: string;
  hasta: string;
}) {
  const r = useMemo(
    () => resultadosMensuales(asientos, desde || "1900-01-01", hasta),
    [asientos, desde, hasta],
  );
  return (
    <div className="space-y-5">
      <section>
        <h1 className="text-2xl font-semibold">Resultados mensuales</h1>
        <p className="mt-1 max-w-3xl text-stone-600">
          El estado de resultados mes por mes, en cifras históricas, para ver
          cómo viene el año y armar intermedios.
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
            {vista === "estados" || vista === "axi"
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
          <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
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
          desde={desdeEfectivo}
          hasta={hasta}
        />
      ) : vista === "estados" || vista === "axi" ? (
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
