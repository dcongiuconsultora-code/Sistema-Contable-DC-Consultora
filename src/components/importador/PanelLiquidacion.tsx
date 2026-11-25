"use client";

import type { Comprobante } from "@/lib/arca/tipos";
import { totalesLibro } from "@/lib/iva/liquidacion";
import type {
  DatosManualesIva,
  LiquidacionGuardada,
  PeriodoIva,
} from "@/lib/iva/liquidacion";
import { fechaCorta, pesos, tasaTexto } from "@/lib/formato";
import { asientoLiquidacionIva } from "@/lib/impuestos/asientos";
import { AsientoPrevio } from "./PanelIibb";

interface Props {
  ventas: Comprobante[];
  compras: Comprobante[];
  /** El período ya encadenado: datos usados (arrastrados o corregidos) y su liquidación. */
  periodoIva: PeriodoIva;
  guardada?: LiquidacionGuardada;
  /** Corregir un dato a mano (undefined = volver a lo automático). */
  onCambiar: (campo: keyof DatosManualesIva, valor: number | undefined) => void;
  onPresentada: (presentada: boolean) => void;
  /** Percepciones y retenciones de IVA tomadas de Mis Retenciones. */
  desdeArchivos?: { percepciones: number; retenciones: number } | null;
  puedeEditar: boolean;
}

const MESES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const nombreMes = (p: string) =>
  `${MESES[Number(p.slice(5)) - 1]} ${p.slice(0, 4)}`;

const CAMPOS_MANUALES: [keyof DatosManualesIva, string][] = [
  ["saldoTecnicoAnterior", "Saldo técnico a favor del período anterior"],
  [
    "saldoLibreDisponibilidadAnterior",
    "Saldo de libre disponibilidad anterior",
  ],
  ["percepciones", "Percepciones de IVA sufridas"],
  ["retenciones", "Retenciones de IVA sufridas"],
];

function Fila({
  etiqueta,
  valor,
  fuerte,
  sangria,
}: {
  etiqueta: string;
  valor: number;
  fuerte?: boolean;
  sangria?: boolean;
}) {
  return (
    <div
      className={`flex justify-between gap-4 py-1.5 ${fuerte ? "font-semibold" : ""} ${sangria ? "pl-4 text-stone-600" : ""}`}
    >
      <span>{etiqueta}</span>
      <span className="cifra">{pesos(valor)}</span>
    </div>
  );
}

function Diferencias({
  titulo,
  filas,
}: {
  titulo: string;
  filas: [string, number, number][];
}) {
  const hay = filas.some(([, a, b]) => Math.abs(a - b) >= 1);
  return (
    <div
      className={`mb-4 rounded-lg border p-3 ${hay ? "border-amber-300 bg-amber-50" : "border-emerald-200 bg-emerald-50"}`}
    >
      <div className="mb-1 font-medium">
        {titulo}: {hay ? "⚠ hay diferencias" : "✓ coincide"}
      </div>
      <table className="w-full text-xs">
        <thead className="text-stone-500">
          <tr>
            <th className="text-left font-normal" />
            <th className="text-right font-normal">Sistema</th>
            <th className="text-right font-normal">Presentado</th>
            <th className="text-right font-normal">Diferencia</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(([n, a, b]) => (
            <tr key={n}>
              <td className="py-0.5">{n}</td>
              <td className="cifra">{pesos(a)}</td>
              <td className="cifra">{pesos(b)}</td>
              <td
                className={`cifra ${Math.abs(a - b) >= 1 ? "font-semibold text-amber-800" : ""}`}
              >
                {pesos(Math.round((a - b) * 100) / 100)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {hay && (
        <p className="mt-1 text-xs text-amber-900">
          Suele ser un comprobante que falta cargar o que se cargó de más en el
          período.
        </p>
      )}
    </div>
  );
}

/** Compara lo que calcula el sistema con la DDJJ y el Libro IVA Digital presentados. */
function ControlDdjj({
  periodoIva,
  guardada,
  ventas,
  compras,
}: {
  periodoIva: PeriodoIva;
  guardada?: LiquidacionGuardada;
  ventas: Comprobante[];
  compras: Comprobante[];
}) {
  const c = periodoIva.calculada;
  const libro = guardada?.libro;
  const tv = totalesLibro(ventas);
  const tc = totalesLibro(compras.filter((x) => x.computaIva));
  return (
    <>
      {c && guardada?.ddjj && (
        <Diferencias
          titulo={`DDJJ de IVA presentada${guardada.ddjj.fechaPresentacion ? ` el ${fechaCorta(guardada.ddjj.fechaPresentacion)}` : ""}`}
          filas={[
            ["Débito fiscal", c.debitoFiscal, guardada.ddjj.debitoFiscal],
            ["Crédito fiscal", c.creditoFiscal, guardada.ddjj.creditoFiscal],
          ]}
        />
      )}
      {libro && (
        <Diferencias
          titulo="Libro IVA Digital"
          filas={[
            ["Neto gravado ventas", tv.netoGravado, libro.ventasNeto],
            ["Débito fiscal", tv.iva, libro.debitoFiscal],
            ["Neto gravado compras", tc.netoGravado, libro.comprasNeto],
            ["Crédito fiscal", tc.iva, libro.creditoFiscal],
          ]}
        />
      )}
    </>
  );
}

export function PanelLiquidacion({
  ventas,
  compras,
  periodoIva,
  guardada,
  onCambiar,
  onPresentada,
  desdeArchivos,
  puedeEditar,
}: Props) {
  const liq = periodoIva.liquidacion;
  const manual = periodoIva.manual;
  const corregido = guardada?.manual ?? {};
  const percepcionesEnArchivo = compras.reduce(
    (s, c) => s + c.otrosTributos,
    0,
  );
  void ventas;
  const bloqueado = !puedeEditar || periodoIva.presentada;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h3 className="mb-1 font-semibold">Datos del período</h3>
        <p className="mb-4 text-sm text-stone-500">
          {periodoIva.arrastradoDe
            ? `Los saldos anteriores vienen solos de la liquidación de ${nombreMes(periodoIva.arrastradoDe)}. Si en ARCA te dio otro número, corregilo y queda guardado.`
            : "Es el primer mes con datos en el sistema: cargá los saldos a favor que traías de antes. Desde acá se arrastran solos."}
        </p>
        <div className="space-y-3">
          {CAMPOS_MANUALES.map(([campo, etiqueta]) => {
            const deArchivo =
              desdeArchivos &&
              (campo === "percepciones" || campo === "retenciones");
            if (deArchivo)
              return (
                <div key={campo} className="text-sm">
                  <span className="text-stone-700">{etiqueta}</span>
                  <div className="mt-1 flex items-center justify-between rounded-md bg-stone-100 px-3 py-2">
                    <span className="text-xs text-stone-500">
                      De Mis Retenciones
                    </span>
                    <span className="cifra font-medium">
                      {pesos(desdeArchivos[campo])}
                    </span>
                  </div>
                </div>
              );
            const esSaldo =
              campo === "saldoTecnicoAnterior" ||
              campo === "saldoLibreDisponibilidadAnterior";
            const automatico = esSaldo
              ? campo === "saldoTecnicoAnterior"
                ? periodoIva.arrastrado.saldoTecnico
                : periodoIva.arrastrado.libreDisponibilidad
              : 0;
            const fueCorregido =
              corregido[campo] !== undefined && corregido[campo] !== automatico;
            return (
              <label key={campo} className="block text-sm">
                <span className="text-stone-700">{etiqueta}</span>
                <input
                  id={`iva-${campo}`}
                  type="number"
                  min={0}
                  step="0.01"
                  disabled={bloqueado}
                  value={manual[campo] || ""}
                  placeholder="0,00"
                  onChange={(e) =>
                    onCambiar(campo, Number(e.target.value) || 0)
                  }
                  className={`mt-1 w-full rounded-md border px-3 py-2 text-right tabular-nums focus:border-marca focus:outline-none disabled:bg-stone-50 ${fueCorregido ? "border-amber-400 bg-amber-50" : "border-stone-300"}`}
                />
                {esSaldo && periodoIva.arrastradoDe && (
                  <span className="mt-1 block text-xs text-stone-500">
                    {fueCorregido ? (
                      <>
                        Corregido a mano (el arrastre daba {pesos(automatico)}).{" "}
                        {!bloqueado && (
                          <button
                            type="button"
                            onClick={() => onCambiar(campo, undefined)}
                            className="font-medium text-marca underline"
                          >
                            Volver al arrastrado
                          </button>
                        )}
                      </>
                    ) : (
                      `Arrastrado de ${nombreMes(periodoIva.arrastradoDe)}.`
                    )}
                  </span>
                )}
                {campo === "percepciones" && percepcionesEnArchivo !== 0 && (
                  <span className="mt-1 block text-xs text-stone-500">
                    Los recibidos traen {pesos(percepcionesEnArchivo)} en
                    &quot;Otros tributos&quot;: separá la parte de IVA, o subí
                    Mis Retenciones para que se complete solo.
                  </span>
                )}
              </label>
            );
          })}
        </div>
        {puedeEditar && (
          <div className="mt-5 border-t border-stone-200 pt-4">
            {periodoIva.presentada ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-medium text-emerald-700">
                  ✓ Presentada: lo que se arrastra al mes siguiente queda fijo.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (
                      !periodoIva.calculada ||
                      confirm(
                        "¿Quitar la DDJJ importada? Vuelve a calcularse con los comprobantes.",
                      )
                    )
                      onPresentada(false);
                  }}
                  className="rounded-md px-2 py-1 text-stone-600 hover:bg-stone-100"
                >
                  {periodoIva.calculada ? "Quitar la DDJJ" : "Desmarcar"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => onPresentada(true)}
                className="w-full rounded-md border border-marca px-3 py-2 text-sm font-medium text-marca hover:bg-marca-claro"
              >
                Marcar como presentada en ARCA
              </button>
            )}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-5 text-sm shadow-sm">
        <h3 className="mb-3 font-semibold">
          {periodoIva.calculada
            ? "Liquidación de IVA (según la DDJJ presentada)"
            : "Liquidación de IVA (borrador para el F.2002)"}
        </h3>
        <ControlDdjj
          periodoIva={periodoIva}
          guardada={guardada}
          ventas={ventas}
          compras={compras}
        />
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
          Débito fiscal
        </p>
        {[...liq.debitoPorTasa].map(([t, v]) => (
          <Fila key={t} etiqueta={`Ventas ${tasaTexto(t)}`} valor={v} sangria />
        ))}
        <Fila etiqueta="Total débito fiscal" valor={liq.debitoFiscal} fuerte />

        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-stone-500">
          Crédito fiscal
        </p>
        {[...liq.creditoPorTasa].map(([t, v]) => (
          <Fila
            key={t}
            etiqueta={`Compras ${tasaTexto(t)}`}
            valor={v}
            sangria
          />
        ))}
        <Fila
          etiqueta="Total crédito fiscal"
          valor={liq.creditoFiscal}
          fuerte
        />

        <div className="my-3 border-t border-stone-200" />
        <Fila etiqueta="Saldo técnico del período" valor={liq.saldoTecnico} />
        <Fila
          etiqueta="Saldo técnico a favor (pasa al mes siguiente)"
          valor={liq.saldoTecnicoAFavor}
        />

        <div className="mt-4 flex items-center justify-between rounded-lg bg-marca px-4 py-3 text-white">
          <span className="font-semibold">Saldo a pagar</span>
          <span className="cifra text-lg font-bold">
            {pesos(liq.saldoAPagar)}
          </span>
        </div>
        <Fila
          etiqueta="Saldo de libre disponibilidad"
          valor={liq.saldoLibreDisponibilidad}
        />
        <AsientoPrevio asiento={asientoLiquidacionIva(periodoIva)} />
      </div>
    </div>
  );
}
