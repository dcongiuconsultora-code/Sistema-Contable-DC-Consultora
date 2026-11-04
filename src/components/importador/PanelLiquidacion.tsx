"use client";

import type { Comprobante } from "@/lib/arca/tipos";
import { type DatosManualesIva, liquidarIva } from "@/lib/iva/liquidacion";
import { pesos, tasaTexto } from "@/lib/formato";

interface Props {
  ventas: Comprobante[];
  compras: Comprobante[];
  manual: DatosManualesIva;
  onManual: (m: DatosManualesIva) => void;
  /** Percepciones y retenciones de IVA tomadas de Mis Retenciones; reemplazan a las cargadas a mano. */
  desdeArchivos?: { percepciones: number; retenciones: number } | null;
}

const CAMPOS_MANUALES: [keyof DatosManualesIva, string][] = [
  ["saldoTecnicoAnterior", "Saldo técnico a favor del período anterior"],
  ["saldoLibreDisponibilidadAnterior", "Saldo de libre disponibilidad anterior"],
  ["percepciones", "Percepciones de IVA sufridas"],
  ["retenciones", "Retenciones de IVA sufridas"],
];

function Fila({ etiqueta, valor, fuerte, sangria }: { etiqueta: string; valor: number; fuerte?: boolean; sangria?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 py-1.5 ${fuerte ? "font-semibold" : ""} ${sangria ? "pl-4 text-stone-600" : ""}`}>
      <span>{etiqueta}</span>
      <span className="cifra">{pesos(valor)}</span>
    </div>
  );
}

export function PanelLiquidacion({ ventas, compras, manual, onManual, desdeArchivos }: Props) {
  const datos = desdeArchivos ? { ...manual, ...desdeArchivos } : manual;
  const liq = liquidarIva(ventas, compras, datos);
  const percepcionesEnArchivo = compras.reduce((s, c) => s + c.otrosTributos, 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
      <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <h3 className="mb-1 font-semibold">Datos a completar</h3>
        <p className="mb-4 text-sm text-stone-500">
          Los saldos del mes anterior se van a arrastrar solos cuando el sistema guarde las liquidaciones.
        </p>
        <div className="space-y-3">
          {CAMPOS_MANUALES.map(([campo, etiqueta]) =>
            desdeArchivos && (campo === "percepciones" || campo === "retenciones") ? (
              <div key={campo} className="text-sm">
                <span className="text-stone-700">{etiqueta}</span>
                <div className="mt-1 flex items-center justify-between rounded-md bg-stone-100 px-3 py-2">
                  <span className="text-xs text-stone-500">De Mis Retenciones</span>
                  <span className="cifra font-medium">{pesos(desdeArchivos[campo])}</span>
                </div>
              </div>
            ) : (
            <label key={campo} className="block text-sm">
              <span className="text-stone-700">{etiqueta}</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={manual[campo] || ""}
                placeholder="0,00"
                onChange={(e) => onManual({ ...manual, [campo]: Number(e.target.value) || 0 })}
                className="mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-right tabular-nums focus:border-marca focus:outline-none"
              />
              {campo === "percepciones" && percepcionesEnArchivo !== 0 && (
                <span className="mt-1 block text-xs text-stone-500">
                  Los recibidos traen {pesos(percepcionesEnArchivo)} en &quot;Otros tributos&quot;: separá la parte de IVA,
                  o subí Mis Retenciones para que se complete solo.
                </span>
              )}
            </label>
            ),
          )}
        </div>
      </div>

      <div className="rounded-xl border border-stone-200 bg-white p-5 text-sm shadow-sm">
        <h3 className="mb-3 font-semibold">Liquidación de IVA (borrador para el F.2002)</h3>
        <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Débito fiscal</p>
        {[...liq.debitoPorTasa].map(([t, v]) => <Fila key={t} etiqueta={`Ventas ${tasaTexto(t)}`} valor={v} sangria />)}
        <Fila etiqueta="Total débito fiscal" valor={liq.debitoFiscal} fuerte />

        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-stone-500">Crédito fiscal</p>
        {[...liq.creditoPorTasa].map(([t, v]) => <Fila key={t} etiqueta={`Compras ${tasaTexto(t)}`} valor={v} sangria />)}
        <Fila etiqueta="Total crédito fiscal" valor={liq.creditoFiscal} fuerte />

        <div className="my-3 border-t border-stone-200" />
        <Fila etiqueta="Saldo técnico del período" valor={liq.saldoTecnico} />
        <Fila etiqueta="Saldo técnico a favor (pasa al mes siguiente)" valor={liq.saldoTecnicoAFavor} />

        <div className="mt-4 flex items-center justify-between rounded-lg bg-marca px-4 py-3 text-white">
          <span className="font-semibold">Saldo a pagar</span>
          <span className="cifra text-lg font-bold">{pesos(liq.saldoAPagar)}</span>
        </div>
        <Fila etiqueta="Saldo de libre disponibilidad" valor={liq.saldoLibreDisponibilidad} />
      </div>
    </div>
  );
}
