"use client";

import { useMemo, useState } from "react";
import {
  ETIQUETA_IMPUESTO,
  EtiquetaImpuesto,
} from "@/components/empresas/Vencimientos";
import type { InformeMensual } from "@/lib/informes/informe";
import type { Impuesto } from "@/lib/vencimientos/vencimientos";
import type { Asiento } from "@/lib/contabilidad/diario";
import {
  balance,
  type Estado,
  formatoIndicador,
  indicadores,
  mayor,
  resultados,
  type SaldosIniciales,
  flujoDeCaja,
  type FiltroUnidad,
} from "@/lib/contabilidad/indicadores";
import { fechaCorta, nombrePeriodo, pesos } from "@/lib/formato";
import { cuenta as datosCuenta, PLAN_MODELO } from "@/lib/plan/plan";
import {
  type ConfigUnidades,
  nombreUnidad,
  SIN_UNIDADES,
} from "@/lib/unidades/unidades";

export interface Alertas {
  observados: number;
  sinAprobar: number;
  cobrosVencidos: { cantidad: number; importe: number };
  bancoSinRegistrar: number;
  bancoSugeridos: number;
  ticketsPendientes: number;
}

interface Props {
  empresa: string;
  asientos: Asiento[];
  iniciales: SaldosIniciales;
  onIniciales: (s: SaldosIniciales) => void;
  alertas: Alertas;
  onIr: (seccion: "movimientos" | "cuentas" | "bancos" | "tickets") => void;
  /** false para los clientes: ven cómo se calcula pero no cambian los saldos de inicio. */
  puedeEditarSaldos?: boolean;
  /** Unidades de negocio de la empresa (vacío si no tiene). */
  unidades?: ConfigUnidades;
  /** Próximos vencimientos de la empresa (impuestos y cuotas de planes). */
  proximos?: { fecha: string; impuesto: Impuesto; detalle: string }[];
  /** Descarga el informe del mes en Excel o PDF (completa CUIT, comprobantes y logo). */
  onDescargar?: (
    informe: InformeMensual,
    formato: "pdf" | "excel",
  ) => Promise<void>;
}

const TODAS = "todas";
const COMPARTIDO = "compartido";

/** Tabla con el resultado del mes de cada unidad de negocio. */
function PorUnidad({
  asientos,
  desde,
  hasta,
  unidades,
  onElegir,
}: {
  asientos: Asiento[];
  desde: string;
  hasta: string;
  unidades: ConfigUnidades;
  onElegir: (id: string) => void;
}) {
  const filas: [string, string, FiltroUnidad][] = [
    ...unidades.unidades.map(
      (u) => [u.id, u.nombre, u.id] as [string, string, FiltroUnidad],
    ),
    [COMPARTIDO, "Compartido (sin unidad)", null],
  ];
  const datos = filas.map(([id, nombre, filtro]) => ({
    id,
    nombre,
    r: resultados(asientos, desde, hasta, filtro),
    caja: flujoDeCaja(asientos, desde, hasta, filtro).neto,
  }));
  const total = resultados(asientos, desde, hasta);
  const cajaTotal = flujoDeCaja(asientos, desde, hasta).neto;
  const pct = (m: number | null) =>
    m === null ? "—" : `${Math.round(m * 1000) / 10}%`.replace(".", ",");
  return (
    <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      <h2 className="border-b border-stone-200 px-5 py-3 font-semibold">
        Por unidad de negocio
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-4 py-2">Unidad</th>
              <th className="px-4 py-2 text-right">Ventas</th>
              <th className="px-4 py-2 text-right">Compras</th>
              <th className="px-4 py-2 text-right">Gastos</th>
              <th className="px-4 py-2 text-right">Resultado</th>
              <th className="px-4 py-2 text-right">Rentabilidad</th>
              <th className="px-4 py-2 text-right">Caja del mes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {datos.map((d) => (
              <tr
                key={d.id}
                onClick={() => onElegir(d.id)}
                className="cursor-pointer hover:bg-stone-50"
                title="Ver el tablero de esta unidad"
              >
                <td className="px-4 py-2 font-medium">{d.nombre}</td>
                <td className="cifra px-4 py-2">{pesos(d.r.ventas)}</td>
                <td className="cifra px-4 py-2">{pesos(d.r.costos)}</td>
                <td className="cifra px-4 py-2">{pesos(d.r.gastos)}</td>
                <td
                  className={`cifra px-4 py-2 font-semibold ${d.r.resultado < 0 ? "text-red-700" : ""}`}
                >
                  {pesos(d.r.resultado)}
                </td>
                <td className="cifra px-4 py-2">{pct(d.r.margen)}</td>
                <td
                  className={`cifra px-4 py-2 ${d.caja < 0 ? "text-red-700" : ""}`}
                >
                  {pesos(d.caja)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-stone-200 bg-stone-50 font-semibold">
            <tr>
              <td className="px-4 py-2">Toda la empresa</td>
              <td className="cifra px-4 py-2">{pesos(total.ventas)}</td>
              <td className="cifra px-4 py-2">{pesos(total.costos)}</td>
              <td className="cifra px-4 py-2">{pesos(total.gastos)}</td>
              <td className="cifra px-4 py-2">{pesos(total.resultado)}</td>
              <td className="cifra px-4 py-2">{pct(total.margen)}</td>
              <td className="cifra px-4 py-2">{pesos(cajaTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="border-t border-stone-200 px-5 py-2 text-xs text-stone-500">
        Ventas por punto de venta, compras por proveedor, cobros y pagos según
        la unidad elegida al cargarlos. &quot;Compartido&quot; es lo que no es
        de una sola unidad (por ejemplo, gastos de la cuenta bancaria común).
        Caja del mes = entradas − salidas de caja y bancos.
      </p>
    </section>
  );
}

// Colores del gráfico (paleta categórica validada: azul y naranja) y de estado (fijos).
const SERIE_VENTAS = "#591101";
const SERIE_COMPRAS = "#d9a28f";
const ESTADOS: Record<
  Estado,
  { texto: string; icono: string; color: string; fondo: string }
> = {
  bien: { texto: "Bien", icono: "✓", color: "#0ca30c", fondo: "#e7f6e7" },
  atencion: {
    texto: "Atención",
    icono: "!",
    color: "#b07800",
    fondo: "#fff4dc",
  },
  critico: { texto: "Crítico", icono: "✕", color: "#d03b3b", fondo: "#fbeaea" },
  sin_datos: {
    texto: "Sin datos",
    icono: "–",
    color: "#78716c",
    fondo: "#f5f5f4",
  },
};

const MILLONES = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });
function compacto(n: number) {
  const a = Math.abs(n);
  if (a >= 1e6) return `$${MILLONES.format(n / 1e6)} M`;
  if (a >= 1e3) return `$${MILLONES.format(n / 1e3)} mil`;
  return `$${MILLONES.format(n)}`;
}

function plural(n: number, uno: string, varios: string) {
  return `${n} ${n === 1 ? uno : varios}`;
}

function finDeMes(periodo: string) {
  const [a, m] = periodo.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

function mesAnterior(periodo: string) {
  const [a, m] = periodo.split("-").map(Number);
  return m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
}

function variacion(actual: number, anterior: number) {
  if (!anterior) return null;
  return (actual - anterior) / Math.abs(anterior);
}

interface PuntoMes {
  periodo: string;
  ventas: number;
  compras: number;
}

/** Barras agrupadas de ventas y compras netas por mes, con tooltip al pasar el mouse. */
function GraficoMensual({ datos }: { datos: PuntoMes[] }) {
  const [activo, setActivo] = useState<number | null>(null);
  const ancho = 640;
  const alto = 220;
  const margen = { izq: 64, der: 12, arr: 12, aba: 28 };
  const maximo = Math.max(1, ...datos.flatMap((d) => [d.ventas, d.compras]));
  // Tres o cuatro líneas de guía en números redondos.
  const paso = (() => {
    const bruto = maximo / 4;
    const base = 10 ** Math.floor(Math.log10(bruto));
    return (
      [1, 2, 2.5, 5, 10].map((f) => f * base).find((p) => p >= bruto) ?? bruto
    );
  })();
  const tope = Math.ceil(maximo / paso) * paso;
  const y = (v: number) =>
    margen.arr + (alto - margen.arr - margen.aba) * (1 - v / tope);
  const grupo = (ancho - margen.izq - margen.der) / Math.max(1, datos.length);
  const barra = Math.min(36, (grupo - 16) / 2);
  const guias = Array.from(
    { length: Math.round(tope / paso) + 1 },
    (_, k) => k * paso,
  );

  const rect = (x: number, v: number, color: string) => {
    const h = alto - margen.aba - y(v);
    if (h <= 0) return null;
    const r = Math.min(4, h);
    // Esquinas redondeadas solo arriba: la base queda apoyada en el eje.
    return (
      <path
        d={`M${x},${alto - margen.aba} V${y(v) + r} Q${x},${y(v)} ${x + r},${y(v)} H${x + barra - r} Q${x + barra},${y(v)} ${x + barra},${y(v) + r} V${alto - margen.aba} Z`}
        fill={color}
      />
    );
  };

  return (
    <div className="relative">
      <div className="mb-3 flex flex-wrap gap-4 text-sm text-stone-700">
        {[
          ["Ventas", SERIE_VENTAS],
          ["Compras", SERIE_COMPRAS],
        ].map(([n, c]) => (
          <span key={n} className="inline-flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm" style={{ background: c }} />
            {n}
          </span>
        ))}
        <span className="text-stone-500">netas de IVA</span>
      </div>
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="w-full"
        role="img"
        aria-label="Ventas y compras netas por mes"
        onMouseLeave={() => setActivo(null)}
      >
        {guias.map((g) => (
          <g key={g}>
            <line
              x1={margen.izq}
              x2={ancho - margen.der}
              y1={y(g)}
              y2={y(g)}
              stroke="#e7e5e4"
              strokeWidth={1}
            />
            <text
              x={margen.izq - 8}
              y={y(g)}
              textAnchor="end"
              dominantBaseline="middle"
              fontSize={11}
              fill="#78716c"
            >
              {compacto(g)}
            </text>
          </g>
        ))}
        {datos.map((d, k) => {
          const x0 = margen.izq + k * grupo + (grupo - 2 * barra - 2) / 2;
          return (
            <g key={d.periodo} onMouseEnter={() => setActivo(k)}>
              <rect
                x={margen.izq + k * grupo}
                y={margen.arr}
                width={grupo}
                height={alto - margen.arr - margen.aba}
                fill={activo === k ? "#f5f5f4" : "transparent"}
              />
              {rect(x0, d.ventas, SERIE_VENTAS)}
              {rect(x0 + barra + 2, d.compras, SERIE_COMPRAS)}
              <text
                x={margen.izq + k * grupo + grupo / 2}
                y={alto - 8}
                textAnchor="middle"
                fontSize={11}
                fill="#57534e"
                className="capitalize"
              >
                {nombrePeriodo(d.periodo)
                  .replace(/ \d{4}$/, "")
                  .slice(0, 3)}
              </text>
            </g>
          );
        })}
        <line
          x1={margen.izq}
          x2={ancho - margen.der}
          y1={alto - margen.aba}
          y2={alto - margen.aba}
          stroke="#a8a29e"
          strokeWidth={1}
        />
      </svg>
      {activo !== null && (
        <div
          className="pointer-events-none absolute top-8 z-10 min-w-44 rounded-lg border border-stone-200 bg-white p-3 text-sm shadow-lg"
          style={{
            left: `min(calc(${((margen.izq + activo * grupo + grupo) / ancho) * 100}% + 8px), calc(100% - 11rem))`,
          }}
        >
          <div className="mb-1 font-semibold capitalize">
            {nombrePeriodo(datos[activo].periodo)}
          </div>
          {[
            ["Ventas", datos[activo].ventas, SERIE_VENTAS],
            ["Compras", datos[activo].compras, SERIE_COMPRAS],
          ].map(([n, v, c]) => (
            <div
              key={n as string}
              className="flex items-center justify-between gap-4"
            >
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: c as string }}
                />
                {n}
              </span>
              <span className="tabular-nums">{pesos(v as number)}</span>
            </div>
          ))}
        </div>
      )}
      <details className="mt-2 text-sm">
        <summary className="cursor-pointer text-stone-500">
          Ver como tabla
        </summary>
        <table className="mt-2 w-full">
          <thead className="text-left text-xs text-stone-500">
            <tr>
              <th className="py-1">Mes</th>
              <th className="py-1 text-right">Ventas</th>
              <th className="py-1 text-right">Compras</th>
            </tr>
          </thead>
          <tbody>
            {datos.map((d) => (
              <tr key={d.periodo}>
                <td className="py-0.5 capitalize">
                  {nombrePeriodo(d.periodo)}
                </td>
                <td className="cifra py-0.5">{pesos(d.ventas)}</td>
                <td className="cifra py-0.5">{pesos(d.compras)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

export function EditorSaldos({
  iniciales,
  onIniciales,
}: {
  iniciales: SaldosIniciales;
  onIniciales: (s: SaldosIniciales) => void;
}) {
  const [nueva, setNueva] = useState("");
  const imputables = PLAN_MODELO.filter(
    (c) => c.imputable && !(c.codigo in iniciales.saldos),
  );
  const cambiar = (codigo: string, importe: number | null) => {
    const saldos = { ...iniciales.saldos };
    if (importe === null) delete saldos[codigo];
    else saldos[codigo] = importe;
    onIniciales({ ...iniciales, saldos });
  };
  const b = balance(mayor([], iniciales, iniciales.fecha));
  return (
    <div className="min-w-0 space-y-3 text-sm">
      <p className="text-stone-600">
        Los carga el estudio una sola vez, con el último balance. Todo lo que
        pasa después se suma solo. Importes en el lado natural de cada cuenta
        (las amortizaciones acumuladas, en positivo).
      </p>
      <label className="flex items-center gap-2">
        <span className="text-stone-600">Saldos al</span>
        <input
          id="fecha-saldos"
          type="date"
          value={iniciales.fecha}
          onChange={(e) => onIniciales({ ...iniciales, fecha: e.target.value })}
          className="rounded-md border border-stone-300 px-2 py-1"
        />
      </label>
      <div className="overflow-x-auto">
        <table className="w-full">
          <tbody className="divide-y divide-stone-100">
            {Object.entries(iniciales.saldos)
              .sort(([a], [c]) =>
                a.localeCompare(c, undefined, { numeric: true }),
              )
              .map(([codigo, importe]) => (
                <tr key={codigo}>
                  <td className="py-1 pr-2">
                    {codigo} {datosCuenta(codigo).nombre}
                  </td>
                  <td className="py-1 pr-2">
                    <input
                      id={`saldo-${codigo}`}
                      type="number"
                      step="0.01"
                      value={importe}
                      onChange={(e) =>
                        cambiar(codigo, Number(e.target.value) || 0)
                      }
                      className="w-36 rounded-md border border-stone-300 px-2 py-1 text-right tabular-nums"
                    />
                  </td>
                  <td className="py-1 text-right">
                    <button
                      type="button"
                      onClick={() => cambiar(codigo, null)}
                      className="rounded px-2 py-0.5 text-stone-500 hover:bg-stone-100"
                    >
                      Quitar
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <select
          id="nueva-cuenta"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-2 py-1.5"
        >
          <option value="">Agregar una cuenta…</option>
          {imputables.map((c) => (
            <option key={c.codigo} value={c.codigo}>
              {c.codigo} {c.nombre}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!nueva}
          onClick={() => {
            cambiar(nueva, 0);
            setNueva("");
          }}
          className="rounded-md border border-marca px-3 py-1.5 font-medium text-marca disabled:opacity-50"
        >
          Agregar
        </button>
      </div>
      <p
        className={
          b.diferencia === 0 ? "text-emerald-700" : "font-medium text-red-700"
        }
      >
        {b.diferencia === 0
          ? "✓ Los saldos de inicio balancean."
          : `Los saldos de inicio no balancean: diferencia de ${pesos(b.diferencia)}.`}
      </p>
    </div>
  );
}

export function Tablero({
  empresa,
  asientos,
  iniciales,
  onIniciales,
  alertas,
  onIr,
  puedeEditarSaldos = true,
  unidades = SIN_UNIDADES,
  proximos = [],
  onDescargar,
}: Props) {
  const [descargando, setDescargando] = useState<string | null>(null);
  const [vistaUnidad, setVistaUnidad] = useState<string>(TODAS);
  const conUnidades = unidades.unidades.length > 0;
  const filtro: FiltroUnidad =
    !conUnidades || vistaUnidad === TODAS
      ? undefined
      : vistaUnidad === COMPARTIDO
        ? null
        : vistaUnidad;
  const nombreVista =
    filtro === undefined
      ? null
      : filtro === null
        ? "Lo compartido"
        : nombreUnidad(filtro, unidades);
  const periodos = useMemo(() => {
    const todos = new Set(
      asientos
        .filter((a) => a.fecha > iniciales.fecha)
        .map((a) => a.fecha.slice(0, 7)),
    );
    return [...todos].sort();
  }, [asientos, iniciales.fecha]);
  const [elegido, setElegido] = useState<string | null>(null);
  const periodo =
    elegido && periodos.includes(elegido) ? elegido : periodos.at(-1);

  if (!periodo) {
    return (
      <section className="rounded-2xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-xl font-semibold">
          Todavía no hay datos para el tablero
        </h2>
        <p className="mx-auto mt-2 max-w-md text-stone-600">
          Se arma solo cuando el estudio importa los comprobantes de ARCA y vos
          cargás tus cobros y pagos.
        </p>
      </section>
    );
  }

  const hasta = finDeMes(periodo);
  const desde = `${periodo}-01`;
  const b = balance(mayor(asientos, iniciales, hasta));
  const r = resultados(asientos, desde, hasta, filtro);
  const anterior = resultados(
    asientos,
    `${mesAnterior(periodo)}-01`,
    finDeMes(mesAnterior(periodo)),
    filtro,
  );
  const caja = flujoDeCaja(asientos, desde, hasta, filtro);
  const lista = indicadores(b, r);
  const varVentas = variacion(r.ventas, anterior.ventas);
  const mensual: PuntoMes[] = periodos.slice(-6).map((p) => {
    const x = resultados(asientos, `${p}-01`, finDeMes(p), filtro);
    return { periodo: p, ventas: x.ventas, compras: x.costos };
  });

  const pendientes: {
    texto: string;
    accion: string;
    ir: Parameters<Props["onIr"]>[0];
    tono: Estado;
  }[] = [];
  if (alertas.observados)
    pendientes.push({
      texto:
        plural(
          alertas.observados,
          "movimiento observado",
          "movimientos observados",
        ) + " por el estudio",
      accion: "Corregir",
      ir: "movimientos",
      tono: "critico",
    });
  if (alertas.cobrosVencidos.cantidad)
    pendientes.push({
      texto: `${plural(alertas.cobrosVencidos.cantidad, "factura", "facturas")} sin cobrar hace más de 60 días (${pesos(alertas.cobrosVencidos.importe)})`,
      accion: "Ver clientes",
      ir: "cuentas",
      tono: "atencion",
    });
  if (alertas.bancoSinRegistrar || alertas.bancoSugeridos)
    pendientes.push({
      texto: `${plural(alertas.bancoSinRegistrar + alertas.bancoSugeridos, "movimiento", "movimientos")} del banco sin registrar`,
      accion: "Conciliar",
      ir: "bancos",
      tono: "atencion",
    });
  if (alertas.sinAprobar)
    pendientes.push({
      texto: `${plural(alertas.sinAprobar, "movimiento espera", "movimientos esperan")} la revisión del estudio`,
      accion: "Ver",
      ir: "movimientos",
      tono: "sin_datos",
    });
  if (alertas.ticketsPendientes)
    pendientes.push({
      texto: `${plural(alertas.ticketsPendientes, "ticket todavía no aparece", "tickets todavía no aparecen")} en ARCA`,
      accion: "Ver",
      ir: "tickets",
      tono: "sin_datos",
    });

  const ganancia = r.resultado >= 0;
  const mesCorto = nombrePeriodo(periodo).split(" ")[0].toLowerCase();
  const tiles: { titulo: string; valor: string; extra?: string }[] = [
    {
      titulo: ganancia ? "Ganaste" : "Perdiste",
      valor: compacto(Math.abs(r.resultado)),
      extra:
        r.margen !== null
          ? `${formatoIndicador(lista[0])} de lo que vendiste`
          : undefined,
    },
    {
      titulo: "Vendiste",
      valor: compacto(r.ventas),
      extra:
        varVentas === null
          ? undefined
          : `${varVentas >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(varVentas * 100))} % vs. ${nombrePeriodo(mesAnterior(periodo)).split(" ")[0].toLowerCase()}`,
    },
    ...(filtro === undefined
      ? [
          {
            titulo: "Tenés en caja y bancos",
            valor: compacto(b.disponibilidades),
          },
          {
            titulo: "Te deben tus clientes",
            valor: compacto(b.creditosPorVentas),
            extra: `y vos debés ${compacto(b.deudasComerciales)} a proveedores`,
          },
        ]
      : [
          {
            titulo: "Gastos del mes",
            valor: compacto(r.gastos),
            extra: `compras ${compacto(r.costos)}`,
          },
          {
            titulo: "Caja del mes",
            valor: compacto(caja.neto),
            extra: `entraron ${compacto(caja.entradas)}, salieron ${compacto(caja.salidas)}`,
          },
        ]),
  ];
  const armarInforme = (): InformeMensual => {
    const doce = periodos.filter((p) => p <= periodo).slice(-12);
    return {
      empresa,
      cuit: "",
      periodo,
      unidad: nombreVista,
      generado: new Date().toLocaleDateString("en-CA"),
      resumen: {
        ventas: r.ventas,
        ventasMesAnterior: anterior.ventas || null,
        compras: r.costos,
        gastos: r.gastos,
        resultado: r.resultado,
        margen: r.margen,
        cajaYBancos: b.disponibilidades,
        teDeben: b.creditosPorVentas,
        debes: b.deudasComerciales,
      },
      indicadores: lista.map((i) => ({
        nombre: i.nombre,
        valor: formatoIndicador(i),
        estado: i.estado,
        lectura: i.lectura,
        formula: i.formula,
      })),
      meses: doce.map((p) => {
        const x = resultados(asientos, `${p}-01`, finDeMes(p), filtro);
        return {
          periodo: p,
          ventas: x.ventas,
          compras: x.costos,
          resultado: x.resultado,
        };
      }),
      vencimientos: proximos.slice(0, 8).map((v) => ({
        fecha: v.fecha,
        impuesto: ETIQUETA_IMPUESTO[v.impuesto][0],
        detalle: v.detalle,
      })),
      pendientes: pendientes.map((p) => p.texto),
    };
  };
  const conValor = lista.filter((i) => i.valor !== null);
  const general: Estado = !conValor.length
    ? "sin_datos"
    : conValor.some((i) => i.estado === "critico")
      ? "critico"
      : conValor.some((i) => i.estado === "atencion")
        ? "atencion"
        : "bien";
  const ICONO_INDICADOR: Record<string, string> = {
    rentabilidad: "💰",
    liquidez: "💧",
    acida: "📦",
    endeudamiento: "⚖️",
  };
  const fondo: Record<Estado, string> = {
    bien: "bg-emerald-50/80",
    atencion: "bg-amber-50",
    critico: "bg-red-50",
    sin_datos: "bg-stone-50",
  };

  return (
    <div className="space-y-5">
      {/* Encabezado con los números del mes */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-marca to-[#8a2a12] p-6 text-white shadow-md sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/5" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm text-white/70">Hola, {empresa} 👋</p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
              Así viene {nombreVista ?? "tu negocio"} en {mesCorto}
            </h1>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <select
                id="periodo-tablero"
                aria-label="Mes"
                value={periodo}
                onChange={(e) => setElegido(e.target.value)}
                className="rounded-full border border-white/25 bg-white/10 px-3 py-1 capitalize text-white"
              >
                {[...periodos].reverse().map((p) => (
                  <option key={p} value={p} className="text-stone-900">
                    {nombrePeriodo(p)}
                  </option>
                ))}
              </select>
              {conUnidades && (
                <select
                  id="unidad-tablero"
                  aria-label="Unidad de negocio"
                  value={vistaUnidad}
                  onChange={(e) => setVistaUnidad(e.target.value)}
                  className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-white"
                >
                  <option value={TODAS} className="text-stone-900">
                    Toda la empresa
                  </option>
                  {unidades.unidades.map((u) => (
                    <option key={u.id} value={u.id} className="text-stone-900">
                      {u.nombre}
                    </option>
                  ))}
                  <option value={COMPARTIDO} className="text-stone-900">
                    Compartido
                  </option>
                </select>
              )}
            </div>
          </div>
          {onDescargar && (
            <div className="flex gap-2">
              {(
                [
                  ["pdf", "PDF para presentar"],
                  ["excel", "Excel"],
                ] as const
              ).map(([f, texto]) => (
                <button
                  key={f}
                  type="button"
                  disabled={descargando !== null}
                  onClick={async () => {
                    setDescargando(f);
                    try {
                      await onDescargar(armarInforme(), f);
                    } finally {
                      setDescargando(null);
                    }
                  }}
                  className="rounded-full border border-white/30 bg-white/10 px-3.5 py-1.5 text-sm font-medium text-white hover:bg-white/20 disabled:opacity-60"
                >
                  {descargando === f ? "Armando…" : `⬇ ${texto}`}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="relative mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {tiles.map((t) => (
            <div
              key={t.titulo}
              className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm"
            >
              <div className="text-xs text-white/70">{t.titulo}</div>
              <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">
                {t.valor}
              </div>
              {t.extra && (
                <div className="mt-1 text-xs text-white/70">{t.extra}</div>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Lo que tenés que hacer</h2>
          {pendientes.length === 0 ? (
            <p className="mt-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
              ✓ Está todo al día. ¡Bien!
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5 text-sm">
              {pendientes.map((p) => (
                <li
                  key={p.texto}
                  className="flex items-center gap-3 rounded-xl border border-stone-200 p-3"
                >
                  <span
                    aria-hidden
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{
                      color: ESTADOS[p.tono].color,
                      background: ESTADOS[p.tono].fondo,
                    }}
                  >
                    {ESTADOS[p.tono].icono}
                  </span>
                  <span className="min-w-0 flex-1">{p.texto}</span>
                  <button
                    type="button"
                    onClick={() => onIr(p.ir)}
                    className="shrink-0 rounded-lg bg-marca px-3 py-1.5 font-medium text-white hover:opacity-90"
                  >
                    {p.accion}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Próximos vencimientos</h2>
          {proximos.length === 0 ? (
            <p className="mt-3 text-sm text-stone-500">
              No tenés vencimientos en las próximas semanas.
            </p>
          ) : (
            <ul className="mt-3 space-y-3 text-sm">
              {proximos.slice(0, 5).map((v) => {
                const d = new Date(`${v.fecha}T12:00:00Z`);
                return (
                  <li
                    key={`${v.fecha}-${v.impuesto}-${v.detalle}`}
                    className="flex items-center gap-3"
                  >
                    <div className="w-12 shrink-0 rounded-xl bg-stone-50 py-1 text-center">
                      <div className="text-lg font-semibold leading-tight">
                        {d.getUTCDate()}
                      </div>
                      <div className="text-[10px] font-semibold uppercase text-stone-500">
                        {d.toLocaleDateString("es-AR", {
                          month: "short",
                          timeZone: "UTC",
                        })}
                      </div>
                    </div>
                    <span className="min-w-0 flex-1">{v.detalle}</span>
                    <EtiquetaImpuesto impuesto={v.impuesto} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Índices */}
      <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            ¿Cómo está la salud de {nombreVista ? "la unidad" : "tu empresa"}?
          </h2>
          {general !== "sin_datos" && (
            <span
              className="rounded-full px-3 py-1 text-sm font-medium"
              style={{
                color: ESTADOS[general].color,
                background: ESTADOS[general].fondo,
              }}
            >
              ●{" "}
              {general === "bien"
                ? "Muy bien"
                : general === "atencion"
                  ? "Para mirar"
                  : "Preocupa"}
            </span>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {lista.map((i) => (
            <div
              key={i.id}
              title={i.formula}
              className={`rounded-2xl p-4 ${fondo[i.estado]}`}
            >
              <div className="flex items-center justify-between gap-2 text-sm text-stone-700">
                <span>
                  {ICONO_INDICADOR[i.id] ?? "📈"} {i.nombre}
                </span>
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: ESTADOS[i.estado].color }}
                />
              </div>
              <div className="mt-2 text-2xl font-semibold tabular-nums">
                {formatoIndicador(i)}
              </div>
              <p className="mt-1 text-xs text-stone-600">{i.lectura}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-stone-400">
          Al {fechaCorta(hasta)}.
          {filtro !== undefined &&
            " La rentabilidad es de la unidad; el resto es de toda la empresa."}{" "}
          Verde: bien · amarillo: para mirar · rojo: preocupa. Son referencias
          generales; el estudio las ajusta según el rubro.
        </p>
      </section>

      {conUnidades && filtro === undefined && (
        <PorUnidad
          asientos={asientos}
          desde={desde}
          hasta={hasta}
          unidades={unidades}
          onElegir={setVistaUnidad}
        />
      )}

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <section className="min-w-0 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">
            Ventas y compras de los últimos meses
          </h2>
          <GraficoMensual datos={mensual} />
        </section>
        <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Tu mes en números</h2>
          <dl className="divide-y divide-stone-100 text-sm">
            {(
              [
                ["Vendiste", r.ventas, ""],
                ["Compraste (mercadería)", -r.costos, ""],
                ["Gastos", -r.gastos, "sueldos, servicios y otros"],
                [
                  ganancia ? "Te quedó de ganancia" : "Perdiste",
                  r.resultado,
                  "",
                ],
              ] as const
            ).map(([t, v, nota], i) => (
              <div
                key={t}
                className={`flex items-baseline justify-between gap-3 py-2.5 ${i === 3 ? "font-semibold" : ""}`}
              >
                <dt>
                  {t}
                  {nota && (
                    <span className="block text-xs font-normal text-stone-500">
                      {nota}
                    </span>
                  )}
                </dt>
                <dd
                  className={`cifra ${v < 0 ? "text-stone-600" : ""} ${i === 3 ? (v < 0 ? "text-red-700" : "text-emerald-700") : ""}`}
                >
                  {pesos(v || 0)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-xs text-stone-400">
            Netos de IVA. Entraron {compacto(caja.entradas)} y salieron{" "}
            {compacto(caja.salidas)} de caja y bancos en el mes.
          </p>
        </section>
      </div>

      <details className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
        <summary className="cursor-pointer font-semibold">
          Cómo se calcula (para el estudio)
        </summary>
        <div className="mt-4 grid gap-6 lg:grid-cols-2">
          <div className="min-w-0 text-sm">
            <h3 className="mb-2 font-medium">Balance al {fechaCorta(hasta)}</h3>
            <table className="w-full">
              <tbody className="divide-y divide-stone-100">
                {[
                  ["Activo corriente", b.activoCorriente],
                  ["Activo no corriente", b.activoNoCorriente],
                  ["Pasivo corriente", b.pasivoCorriente],
                  ["Pasivo no corriente", b.pasivoNoCorriente],
                  ["Patrimonio neto (incluye el resultado)", b.patrimonioNeto],
                  ["Resultado desde los saldos de inicio", b.resultado],
                ].map(([n, v]) => (
                  <tr key={n as string}>
                    <td className="py-1">{n}</td>
                    <td className="cifra py-1">{pesos(v as number)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {b.diferencia !== 0 && (
              <p className="mt-2 font-medium text-red-700">
                Diferencia sin explicar: {pesos(b.diferencia)}. Revisá los
                saldos de inicio.
              </p>
            )}
            <p className="mt-3 text-stone-600">
              Se arma con los saldos de inicio más las facturas de ARCA, los
              tickets, los cobros y pagos aprobados o enviados, y los
              movimientos del banco resueltos solos. La rentabilidad no
              considera la variación del stock hasta que se cargue el
              inventario; lo que falta conciliar en el banco todavía no está
              incluido.
            </p>
          </div>
          {puedeEditarSaldos && (
            <EditorSaldos iniciales={iniciales} onIniciales={onIniciales} />
          )}
        </div>
      </details>
    </div>
  );
}
