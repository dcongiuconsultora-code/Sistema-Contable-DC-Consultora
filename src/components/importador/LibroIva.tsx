import type { Comprobante } from "@/lib/arca/tipos";
import { claveTasa, totalesLibro } from "@/lib/iva/liquidacion";
import { cuitConGuiones, fechaCorta, pesos, tasaTexto } from "@/lib/formato";

interface Props {
  titulo: string;
  comprobantes: Comprobante[];
}

function numeroComprobante(c: Comprobante) {
  const pv = String(c.puntoVenta).padStart(5, "0");
  const n = String(c.numeroDesde).padStart(8, "0");
  return `${pv}-${n}`;
}

export function LibroIva({ titulo, comprobantes }: Props) {
  const totales = totalesLibro(comprobantes);
  const tasas = [...totales.porTasa.keys()].sort((a, b) =>
    b === "s/d" ? -1 : a === "s/d" ? 1 : Number(b) - Number(a),
  );

  if (comprobantes.length === 0) {
    return (
      <p className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-stone-500">
        No hay comprobantes en este período.
      </p>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <h3 className="border-b border-stone-200 px-4 py-3 font-semibold">
        {titulo}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Comprobante</th>
              <th className="px-3 py-2">Contraparte</th>
              {tasas.map((t) => (
                <th key={t} className="px-3 py-2 text-right" colSpan={2}>
                  {tasaTexto(t)}
                </th>
              ))}
              <th className="px-3 py-2 text-right">No grav./Exento</th>
              <th className="px-3 py-2 text-right">Otros trib.</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
            <tr className="text-[10px]">
              <th colSpan={3} />
              {tasas.map((t) => [
                <th key={`${t}n`} className="px-3 pb-2 text-right font-normal">
                  Neto
                </th>,
                <th key={`${t}i`} className="px-3 pb-2 text-right font-normal">
                  IVA
                </th>,
              ])}
              <th colSpan={3} />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {comprobantes.map((c) => {
              const porTasa = new Map(
                c.alicuotas.map((a) => [claveTasa(a.tasa), a]),
              );
              const revisar = c.advertencias.length > 0;
              return (
                <tr
                  key={c.fila}
                  className={revisar ? "bg-amber-50" : undefined}
                  title={c.advertencias.join("\n") || undefined}
                >
                  <td className="px-3 py-2 whitespace-nowrap">
                    {fechaCorta(c.fecha)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div>{c.tipoNombre}</div>
                    <div className="text-xs text-stone-500">
                      {numeroComprobante(c)}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <div className="max-w-56 truncate">
                      {c.contraparte ||
                        (c.cuitContraparte ? "—" : "Consumidor final")}
                    </div>
                    <div className="text-xs text-stone-500">
                      {cuitConGuiones(c.cuitContraparte)}
                      {revisar && (
                        <span className="ml-2 font-medium text-amber-700">
                          ⚠ revisar
                        </span>
                      )}
                    </div>
                  </td>
                  {tasas.map((t) => [
                    <td key={`${t}n`} className="cifra px-3 py-2">
                      {porTasa.has(t) ? pesos(porTasa.get(t)!.neto) : ""}
                    </td>,
                    <td key={`${t}i`} className="cifra px-3 py-2">
                      {porTasa.has(t) ? pesos(porTasa.get(t)!.iva) : ""}
                    </td>,
                  ])}
                  <td className="cifra px-3 py-2">
                    {c.noGravado + c.exento
                      ? pesos(c.noGravado + c.exento)
                      : ""}
                  </td>
                  <td className="cifra px-3 py-2">
                    {c.otrosTributos ? pesos(c.otrosTributos) : ""}
                  </td>
                  <td className="cifra px-3 py-2 font-medium">
                    {pesos(c.total)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t-2 border-stone-200 bg-stone-50 font-semibold">
            <tr>
              <td className="px-3 py-2" colSpan={3}>
                Totales ({totales.cantidad})
              </td>
              {tasas.map((t) => [
                <td key={`${t}n`} className="cifra px-3 py-2">
                  {pesos(totales.porTasa.get(t)!.neto)}
                </td>,
                <td key={`${t}i`} className="cifra px-3 py-2">
                  {pesos(totales.porTasa.get(t)!.iva)}
                </td>,
              ])}
              <td className="cifra px-3 py-2">
                {pesos(totales.noGravado + totales.exento)}
              </td>
              <td className="cifra px-3 py-2">
                {pesos(totales.otrosTributos)}
              </td>
              <td className="cifra px-3 py-2">{pesos(totales.total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
