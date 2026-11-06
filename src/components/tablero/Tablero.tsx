"use client";

import { useMemo, useState } from "react";
import type { Asiento } from "@/lib/contabilidad/diario";
import {
  balance,
  type Estado,
  formatoIndicador,
  type Indicador,
  indicadores,
  mayor,
  resultados,
  type SaldosIniciales,
} from "@/lib/contabilidad/indicadores";
import { fechaCorta, nombrePeriodo, pesos } from "@/lib/formato";
import { cuenta as datosCuenta, PLAN_MODELO } from "@/lib/plan/plan";

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
}

// Colores del gráfico (paleta categórica validada: azul y naranja) y de estado (fijos).
const SERIE_VENTAS = "#2a78d6";
const SERIE_COMPRAS = "#eb6834";
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

function Pastilla({ estado }: { estado: Estado }) {
  const e = ESTADOS[estado];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ color: e.color, background: e.fondo }}
    >
      <span aria-hidden>{e.icono}</span>
      {e.texto}
    </span>
  );
}

/** Escala horizontal con las tres zonas y una marca en el valor. */
function Medidor({ i }: { i: Indicador }) {
  const { min, max, atencion, bien, menorEsMejor } = i.escala;
  const pos = (v: number) =>
    `${((Math.min(max, Math.max(min, v)) - min) / (max - min)) * 100}%`;
  const zonas = menorEsMejor
    ? [
        { desde: min, hasta: bien, estado: "bien" as const },
        { desde: bien, hasta: atencion, estado: "atencion" as const },
        { desde: atencion, hasta: max, estado: "critico" as const },
      ]
    : [
        { desde: min, hasta: atencion, estado: "critico" as const },
        { desde: atencion, hasta: bien, estado: "atencion" as const },
        { desde: bien, hasta: max, estado: "bien" as const },
      ];
  const etiqueta = (v: number) =>
    i.id === "rentabilidad" ? `${Math.round(v * 100)}%` : MILLONES.format(v);
  return (
    <div className="mt-4" aria-hidden>
      <div className="relative h-2.5">
        <div className="absolute inset-0 flex gap-0.5 overflow-hidden rounded-full">
          {zonas.map((z) => (
            <div
              key={z.estado}
              style={{
                // Base cero y crecimiento proporcional al tramo: llena el ancho aunque la escala sea chica.
                flex: `${(z.hasta - z.desde) * 1000} 1 0`,
                background: ESTADOS[z.estado].fondo,
                borderBottom: `2px solid ${ESTADOS[z.estado].color}55`,
              }}
            />
          ))}
        </div>
        {i.valor !== null && (
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow"
            style={{ left: pos(i.valor), background: ESTADOS[i.estado].color }}
          />
        )}
      </div>
      <div className="relative mt-1 h-4 text-[10px] text-stone-500">
        {[atencion, bien].map((v) => (
          <span
            key={v}
            className="absolute -translate-x-1/2 tabular-nums"
            style={{ left: pos(v) }}
          >
            {etiqueta(v)}
          </span>
        ))}
      </div>
    </div>
  );
}

function TarjetaIndicador({ i }: { i: Indicador }) {
  return (
    <div className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-medium text-stone-600">{i.nombre}</h3>
        <Pastilla estado={i.estado} />
      </div>
      <div className="mt-2 text-3xl font-semibold tabular-nums tracking-tight">
        {formatoIndicador(i)}
        {i.id !== "rentabilidad" && i.valor !== null && (
          <span className="ml-1 text-base font-normal text-stone-500">
            veces
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-stone-700">{i.lectura}</p>
      <div className="mt-auto">
        <Medidor i={i} />
        <p className="mt-1 text-xs text-stone-500">{i.formula}</p>
      </div>
    </div>
  );
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

function EditorSaldos({
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
}: Props) {
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
  const r = resultados(asientos, desde, hasta);
  const anterior = resultados(
    asientos,
    `${mesAnterior(periodo)}-01`,
    finDeMes(mesAnterior(periodo)),
  );
  const lista = indicadores(b, r);
  const varVentas = variacion(r.ventas, anterior.ventas);
  const mensual: PuntoMes[] = periodos.slice(-6).map((p) => {
    const x = resultados(asientos, `${p}-01`, finDeMes(p));
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
  return (
    <div className="space-y-6">
      {/* Encabezado con el resultado del mes */}
      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-marca to-[#7a2412] text-white shadow-md">
        <div className="flex flex-wrap items-end justify-between gap-6 px-6 py-6 sm:px-8">
          <div className="min-w-0">
            <p className="text-sm opacity-80">Hola, {empresa}</p>
            <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">
              Así está tu empresa en{" "}
              <span className="capitalize">{nombrePeriodo(periodo)}</span>
            </h1>
            <label className="mt-3 inline-flex items-center gap-2 text-sm">
              <span className="opacity-80">Ver otro mes</span>
              <select
                id="periodo-tablero"
                value={periodo}
                onChange={(e) => setElegido(e.target.value)}
                className="rounded-md border border-white/30 bg-white/10 px-2 py-1 capitalize text-white"
              >
                {[...periodos].reverse().map((p) => (
                  <option key={p} value={p} className="text-stone-900">
                    {nombrePeriodo(p)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="text-right">
            <p className="text-sm opacity-80">
              {ganancia ? "Ganancia del mes" : "Pérdida del mes"}
            </p>
            <p className="text-4xl font-semibold tabular-nums tracking-tight sm:text-5xl">
              {pesos(Math.abs(r.resultado))}
            </p>
            {r.margen !== null && (
              <p className="mt-1 text-sm opacity-90">
                Rentabilidad {formatoIndicador(lista[0])} sobre ventas
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Números principales */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            titulo: "Ventas del mes",
            valor: r.ventas,
            extra:
              varVentas === null
                ? "sin datos del mes anterior"
                : `${varVentas >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(varVentas * 100))}% vs. ${nombrePeriodo(mesAnterior(periodo)).split(" ")[0]}`,
            tono:
              varVentas === null
                ? ""
                : varVentas >= 0
                  ? "text-emerald-700"
                  : "text-red-700",
          },
          {
            titulo: "Plata disponible",
            valor: b.disponibilidades,
            extra: "caja y bancos",
            tono: "",
          },
          {
            titulo: "Te deben",
            valor: b.creditosPorVentas,
            extra: "clientes",
            tono: "",
          },
          {
            titulo: "Debés",
            valor: b.deudasComerciales,
            extra: "proveedores",
            tono: "",
          },
        ].map((k) => (
          <div
            key={k.titulo}
            className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-stone-600">{k.titulo}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">
              {compacto(k.valor)}
            </p>
            <p className={`mt-1 text-xs ${k.tono || "text-stone-500"}`}>
              {k.extra}
            </p>
          </div>
        ))}
      </section>

      {/* Índices */}
      <section>
        <h2 className="mb-3 text-lg font-semibold">Salud financiera</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {lista.map((i) => (
            <TarjetaIndicador key={i.id} i={i} />
          ))}
        </div>
        <p className="mt-2 text-xs text-stone-500">
          Índices al {fechaCorta(hasta)}. Los rangos de &quot;bien&quot; y
          &quot;atención&quot; son referencias generales: el estudio los ajusta
          según el rubro.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Ventas y compras por mes</h2>
          <GraficoMensual datos={mensual} />
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Para atender</h2>
          {pendientes.length === 0 ? (
            <p className="text-sm text-emerald-700">✓ Todo al día.</p>
          ) : (
            <ul className="space-y-2">
              {pendientes.map((p) => (
                <li
                  key={p.texto}
                  className="flex items-center gap-3 rounded-lg border border-stone-100 p-3 text-sm"
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
                    className="shrink-0 rounded-md px-2 py-1 font-medium text-marca hover:bg-marca-claro"
                  >
                    {p.accion}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

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
