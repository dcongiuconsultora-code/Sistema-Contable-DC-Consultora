import { type Deduccion, totalesDeducciones } from "@/lib/arca/retenciones";
import { cuitConGuiones, fechaCorta, pesos } from "@/lib/formato";

interface Props {
  deducciones: Deduccion[];
  periodo: string;
}

const TIPO = { percepcion: "Percepción", retencion: "Retención" };

export function TablaDeducciones({ deducciones, periodo }: Props) {
  const totales = totalesDeducciones(deducciones, periodo);
  const delPeriodo = deducciones
    .filter((d) => d.periodo === periodo)
    .sort((a, b) => a.impuesto.localeCompare(b.impuesto) || a.fecha.localeCompare(b.fecha));

  if (delPeriodo.length === 0) {
    return (
      <p className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-500">
        No hay retenciones ni percepciones cargadas para este período.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <h3 className="border-b border-stone-200 px-4 py-3 font-semibold">Resumen para las declaraciones juradas</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-4 py-2">Impuesto</th>
                <th className="px-4 py-2">Jurisdicción</th>
                <th className="px-4 py-2">Tipo</th>
                <th className="px-4 py-2 text-right">Cantidad</th>
                <th className="px-4 py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {totales.map((t) => (
                <tr key={`${t.impuesto}${t.jurisdiccion}${t.tipo}`}>
                  <td className="px-4 py-2 font-medium">{t.impuesto}</td>
                  <td className="px-4 py-2">{t.jurisdiccion ?? "—"}</td>
                  <td className="px-4 py-2">{TIPO[t.tipo]}</td>
                  <td className="cifra px-4 py-2">{t.cantidad}</td>
                  <td className="cifra px-4 py-2 font-medium">{pesos(t.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <h3 className="border-b border-stone-200 px-4 py-3 font-semibold">Detalle ({delPeriodo.length})</h3>
        <div className="max-h-[32rem] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
              <tr>
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Impuesto</th>
                <th className="px-3 py-2">Agente</th>
                <th className="px-3 py-2">Régimen</th>
                <th className="px-3 py-2">Comprobante</th>
                <th className="px-3 py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {delPeriodo.map((d, i) => (
                <tr key={i}>
                  <td className="px-3 py-2 whitespace-nowrap">{d.origen === "SIRCREB" ? "Mensual" : fechaCorta(d.fecha)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div>{d.impuesto}{d.jurisdiccion ? ` · ${d.jurisdiccion}` : ""}</div>
                    <div className="text-xs text-stone-500">{TIPO[d.tipo]}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="max-w-56 truncate">{d.agente || "—"}</div>
                    <div className="text-xs text-stone-500">{cuitConGuiones(d.cuitAgente)}</div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="max-w-72 truncate text-stone-600" title={d.regimen}>{d.regimen}</div>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-stone-600">{d.comprobante || "—"}</td>
                  <td className="cifra px-3 py-2">{pesos(d.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
