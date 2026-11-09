"use client";

import { useState } from "react";
import {
  aliasValido,
  BANCOS,
  BILLETERAS,
  type ClaseCuenta,
  type CuentaBancaria,
  cbuValido,
  cuentaContableSugerida,
} from "@/lib/cuentas-bancarias/cuentas";
import { nombreCuenta } from "@/lib/plan/plan";
import { type ConfigUnidades, nombreUnidad } from "@/lib/unidades/unidades";

const VACIA = (clase: ClaseCuenta): CuentaBancaria => ({
  clase,
  entidad: "",
  tipoCuenta: clase === "billetera" ? "billetera" : "cc",
  moneda: "ARS",
  numero: "",
  cbu: "",
  alias: "",
  cuentaContable: clase === "billetera" ? "1.1.01.009" : "1.1.01.006",
  activa: true,
});

function Formulario({
  inicial,
  unidades,
  onGuardar,
  onCancelar,
}: {
  inicial: CuentaBancaria;
  unidades: ConfigUnidades;
  onGuardar: (c: CuentaBancaria) => Promise<void>;
  onCancelar: () => void;
}) {
  const [c, setC] = useState(inicial);
  const [errores, setErrores] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);
  const esBilletera = c.clase === "billetera";
  const cambiar = (cambios: Partial<CuentaBancaria>) => {
    const n = { ...c, ...cambios };
    // La cuenta del plan acompaña al tipo, salvo que el estudio la haya cambiado a mano.
    if (c.cuentaContable === cuentaContableSugerida(c))
      n.cuentaContable = cuentaContableSugerida(n);
    setC(n);
  };

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const problemas: string[] = [];
    if (!c.entidad.trim())
      problemas.push(esBilletera ? "Elegí la billetera." : "Elegí el banco.");
    if (c.cbu && !cbuValido(c.cbu))
      problemas.push(
        `El ${esBilletera ? "CVU" : "CBU"} no es válido: revisá los 22 números.`,
      );
    if (!aliasValido(c.alias))
      problemas.push(
        "El alias tiene que tener entre 6 y 20 letras, números, puntos o guiones.",
      );
    if (!c.cbu && !c.numero && !c.alias)
      problemas.push(
        `Cargá al menos el ${esBilletera ? "CVU" : "CBU"}, el número o el alias.`,
      );
    setErrores(problemas);
    if (problemas.length) return;
    setGuardando(true);
    try {
      await onGuardar(c);
    } catch (err) {
      setErrores([err instanceof Error ? err.message : String(err)]);
    } finally {
      setGuardando(false);
    }
  }

  const campo =
    "mt-1 block w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm";
  return (
    <form
      onSubmit={guardar}
      className="space-y-3 rounded-xl border border-marca/30 bg-white p-5 shadow-sm"
    >
      <div className="flex gap-1 rounded-lg bg-stone-100 p-1 text-sm">
        {(
          [
            ["banco", "Cuenta bancaria"],
            ["billetera", "Billetera virtual"],
          ] as const
        ).map(([clase, texto]) => (
          <button
            key={clase}
            type="button"
            onClick={() =>
              cambiar({
                clase,
                tipoCuenta: clase === "billetera" ? "billetera" : "cc",
                entidad: "",
              })
            }
            className={`flex-1 rounded-md px-3 py-1.5 ${c.clase === clase ? "bg-white font-medium shadow-sm" : "text-stone-600"}`}
          >
            {texto}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-stone-600">
            {esBilletera ? "Billetera" : "Banco"}
          </span>
          <input
            id="cb-entidad"
            list="cb-entidades"
            value={c.entidad}
            onChange={(e) => cambiar({ entidad: e.target.value })}
            placeholder={
              esBilletera ? "Mercado Pago, Naranja X…" : "Banco Macro, Galicia…"
            }
            className={campo}
          />
          <datalist id="cb-entidades">
            {(esBilletera ? BILLETERAS : BANCOS).map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        {!esBilletera && (
          <label className="block text-sm">
            <span className="text-stone-600">Tipo de cuenta</span>
            <select
              id="cb-tipo"
              value={c.tipoCuenta}
              onChange={(e) =>
                cambiar({ tipoCuenta: e.target.value as "cc" | "ca" })
              }
              className={`${campo} bg-white`}
            >
              <option value="cc">Cuenta corriente</option>
              <option value="ca">Caja de ahorro</option>
            </select>
          </label>
        )}
        <label className="block text-sm">
          <span className="text-stone-600">Moneda</span>
          <select
            id="cb-moneda"
            value={c.moneda}
            onChange={(e) =>
              cambiar({ moneda: e.target.value as "ARS" | "USD" })
            }
            className={`${campo} bg-white`}
          >
            <option value="ARS">Pesos</option>
            <option value="USD">Dólares</option>
          </select>
        </label>
        {!esBilletera && (
          <label className="block text-sm">
            <span className="text-stone-600">
              Número de cuenta (como en el resumen)
            </span>
            <input
              id="cb-numero"
              value={c.numero}
              onChange={(e) => cambiar({ numero: e.target.value })}
              placeholder="3-152-0942499576-9"
              className={`${campo} tabular-nums`}
            />
          </label>
        )}
        <label className="block text-sm">
          <span className="text-stone-600">
            {esBilletera ? "CVU" : "CBU"} (22 números)
          </span>
          <input
            id="cb-cbu"
            inputMode="numeric"
            value={c.cbu}
            onChange={(e) =>
              cambiar({ cbu: e.target.value.replace(/\D/g, "").slice(0, 22) })
            }
            className={`${campo} tabular-nums`}
          />
          {c.cbu.length === 22 && (
            <span
              className={`text-xs ${cbuValido(c.cbu) ? "text-emerald-700" : "text-red-700"}`}
            >
              {cbuValido(c.cbu)
                ? "✓ Válido"
                : "Los números de control no coinciden"}
            </span>
          )}
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">Alias</span>
          <input
            id="cb-alias"
            value={c.alias}
            onChange={(e) =>
              cambiar({ alias: e.target.value.replace(/\s/g, "") })
            }
            placeholder="empresa.cobros.mp"
            className={campo}
          />
        </label>
        {unidades.unidades.length > 0 && (
          <label className="block text-sm">
            <span className="text-stone-600">Unidad de negocio</span>
            <select
              id="cb-unidad"
              value={c.unidad ?? ""}
              onChange={(e) => cambiar({ unidad: e.target.value || null })}
              className={`${campo} bg-white`}
            >
              <option value="">Compartida</option>
              {unidades.unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <p className="text-xs text-stone-500">
        Se registra en la cuenta contable{" "}
        <strong>
          {c.cuentaContable} {nombreCuenta(c.cuentaContable)}
        </strong>
        .
      </p>
      {errores.length > 0 && (
        <ul className="rounded-md bg-red-50 p-2 text-sm text-red-800">
          {errores.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={guardando}
          className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Guardar
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="rounded-md px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}

function Copiar({ texto, etiqueta }: { texto: string; etiqueta: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(texto);
        setOk(true);
        setTimeout(() => setOk(false), 2000);
      }}
      className="rounded px-1.5 py-0.5 text-xs text-marca hover:bg-marca-claro"
    >
      {ok ? "✓ Copiado" : `Copiar ${etiqueta}`}
    </button>
  );
}

/** Cuentas bancarias y billeteras virtuales de la empresa, con CBU/CVU y alias. */
export function CuentasBancarias({
  cuentas,
  unidades,
  onGuardar,
  onBorrar,
}: {
  cuentas: CuentaBancaria[];
  unidades: ConfigUnidades;
  onGuardar: (c: CuentaBancaria) => Promise<void>;
  onBorrar: (id: string) => Promise<void>;
}) {
  const [editando, setEditando] = useState<CuentaBancaria | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <section>
          <h1 className="text-2xl font-semibold">
            Cuentas bancarias y billeteras
          </h1>
          <p className="mt-1 max-w-3xl text-stone-600">
            Las cuentas de banco y las billeteras virtuales (Mercado Pago,
            Naranja X, Ualá…) de la empresa, con su CBU o CVU y alias. Después,
            al cargar un cobro o un pago, se elige por cuál entró o salió la
            plata.
          </p>
        </section>
        {!editando && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setEditando(VACIA("banco"))}
              className="rounded-md bg-marca px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              + Cuenta bancaria
            </button>
            <button
              type="button"
              onClick={() => setEditando(VACIA("billetera"))}
              className="rounded-md border border-marca px-4 py-2 text-sm font-medium text-marca hover:bg-marca-claro"
            >
              + Billetera virtual
            </button>
          </div>
        )}
      </div>

      {editando && (
        <Formulario
          key={editando.id ?? editando.clase}
          inicial={editando}
          unidades={unidades}
          onGuardar={async (c) => {
            await onGuardar(c);
            setEditando(null);
          }}
          onCancelar={() => setEditando(null)}
        />
      )}

      {cuentas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
          Todavía no hay cuentas cargadas.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {cuentas.map((c) => (
            <article
              key={c.id}
              className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">{c.entidad}</div>
                  <div className="text-sm text-stone-500">
                    {c.clase === "billetera"
                      ? "Billetera virtual"
                      : c.tipoCuenta === "ca"
                        ? "Caja de ahorro"
                        : "Cuenta corriente"}
                    {c.moneda === "USD" ? " en dólares" : " en pesos"}
                    {unidades.unidades.length > 0 &&
                      ` · ${c.unidad ? nombreUnidad(c.unidad, unidades) : "Compartida"}`}
                  </div>
                </div>
                <span className="text-xl" aria-hidden>
                  {c.clase === "billetera" ? "📱" : "🏦"}
                </span>
              </div>
              <dl className="mt-3 space-y-1 text-sm">
                {c.numero && (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-stone-500">Número</dt>
                    <dd className="tabular-nums">{c.numero}</dd>
                  </div>
                )}
                {c.cbu && (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-stone-500">
                      {c.clase === "billetera" ? "CVU" : "CBU"}
                    </dt>
                    <dd className="flex items-center gap-1 tabular-nums">
                      {c.cbu}
                      <Copiar texto={c.cbu} etiqueta="" />
                    </dd>
                  </div>
                )}
                {c.alias && (
                  <div className="flex items-center justify-between gap-2">
                    <dt className="text-stone-500">Alias</dt>
                    <dd className="flex items-center gap-1">
                      {c.alias}
                      <Copiar texto={c.alias} etiqueta="" />
                    </dd>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 text-xs text-stone-500">
                  <dt>Cuenta contable</dt>
                  <dd>{nombreCuenta(c.cuentaContable)}</dd>
                </div>
              </dl>
              <div className="mt-3 flex gap-1 border-t border-stone-100 pt-2 text-sm">
                <button
                  type="button"
                  onClick={() => setEditando(c)}
                  className="rounded px-2 py-0.5 text-stone-600 hover:bg-stone-100"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    if (
                      !confirm(
                        `¿Borrar ${c.entidad}? Los movimientos ya cargados no se borran.`,
                      )
                    )
                      return;
                    try {
                      setError(null);
                      await onBorrar(c.id!);
                    } catch (e) {
                      setError(e instanceof Error ? e.message : String(e));
                    }
                  }}
                  className="rounded px-2 py-0.5 text-stone-600 hover:bg-stone-100"
                >
                  Borrar
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
    </div>
  );
}
