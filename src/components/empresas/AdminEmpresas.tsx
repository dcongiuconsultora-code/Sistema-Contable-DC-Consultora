"use client";

import { useEffect, useState } from "react";
import type { Empresa, Repositorio } from "@/lib/datos/repositorio";
import { linkGmail } from "@/lib/avisos/avisos";
import { cuitConGuiones } from "@/lib/formato";
import { cuitValido } from "@/lib/tickets/validar";
import { AlertasMonotributo } from "./AlertasMonotributo";
import { Avisos } from "./Avisos";
import { UnidadesEmpresa } from "./UnidadesEmpresa";
import { ImpuestosEmpresa, ProximosVencimientos } from "./Vencimientos";

/** Mensaje listo para mandarle al cliente con su acceso. */
function mensajeAcceso(empresa: string, email: string, clave: string) {
  const sitio =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://sistema-contable-dc-consultora.vercel.app";
  return `Hola, ¿cómo estás? Ya tenés acceso al sistema del estudio para ${empresa}.

Entrá acá: ${sitio}
Usuario: ${email}
Contraseña: ${clave}

Una vez adentro, la podés cambiar desde "Contraseña" (arriba a la derecha).
Ahí vas a poder cargar tus tickets, cobros y pagos, subir los resúmenes del banco y escribirnos por "Mensajes".

Saludos,
DC Consultora`;
}

const CONDICIONES = ["Responsable inscripto", "Monotributo", "Exento"];

function Invitaciones({
  repo,
  empresa,
}: {
  repo: Repositorio;
  empresa: Empresa;
}) {
  const [emails, setEmails] = useState<string[] | null>(null);
  const [nuevo, setNuevo] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    repo.invitaciones(empresa.id).then(setEmails, (e) => setError(e.message));
  }, [repo, empresa.id]);

  async function invitar(e: React.FormEvent) {
    e.preventDefault();
    const email = nuevo.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
      return setError("Ese mail no parece válido.");
    setError(null);
    try {
      await repo.invitar(email, empresa.id);
      setEmails(await repo.invitaciones(empresa.id));
      setNuevo("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const [claves, setClaves] = useState<Record<string, string>>({});
  const [copiado, setCopiado] = useState<string | null>(null);
  async function crearClave(email: string) {
    setError(null);
    try {
      const clave = await repo.crearClave(email);
      setClaves({ ...claves, [email]: clave });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function quitar(email: string) {
    try {
      await repo.quitarInvitacion(email, empresa.id);
      setEmails(await repo.invitaciones(empresa.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="mt-3 space-y-2 text-sm">
      <p className="text-stone-600">
        Usuarios del cliente que pueden entrar a esta empresa:
      </p>
      {emails === null ? (
        <p className="text-stone-500">Cargando…</p>
      ) : emails.length === 0 ? (
        <p className="text-stone-500">Todavía nadie.</p>
      ) : (
        <ul className="divide-y divide-stone-100 rounded-md border border-stone-200">
          {emails.map((e) => (
            <li
              key={e}
              className="flex items-center justify-between gap-2 px-3 py-1.5"
            >
              <span className="min-w-0 flex-1 truncate">
                {e}
                {claves[e] && (
                  <span className="mt-0.5 block text-xs text-emerald-800">
                    Contraseña:{" "}
                    <code className="rounded bg-emerald-50 px-1.5 py-0.5 text-sm font-semibold">
                      {claves[e]}
                    </code>{" "}
                    · pasásela al cliente (después la puede cambiar).
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      <a
                        href={`https://wa.me/?text=${encodeURIComponent(mensajeAcceso(empresa.razon_social, e, claves[e]))}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md bg-emerald-600 px-2.5 py-1 font-medium text-white hover:opacity-90"
                      >
                        Enviar por WhatsApp
                      </a>
                      <a
                        href={linkGmail(
                          [e],
                          "Tu acceso al sistema de DC Consultora",
                          mensajeAcceso(empresa.razon_social, e, claves[e]),
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-md border border-stone-300 bg-white px-2.5 py-1 font-medium text-stone-700 hover:bg-stone-50"
                      >
                        Enviar por Gmail
                      </a>
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(
                            mensajeAcceso(empresa.razon_social, e, claves[e]),
                          );
                          setCopiado(e);
                          setTimeout(() => setCopiado(null), 2500);
                        }}
                        className="rounded-md border border-stone-300 bg-white px-2.5 py-1 font-medium text-stone-700 hover:bg-stone-50"
                      >
                        {copiado === e ? "✓ Copiado" : "Copiar mensaje"}
                      </button>
                    </span>
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => crearClave(e)}
                className="shrink-0 rounded px-2 py-0.5 text-marca hover:bg-marca-claro"
              >
                {claves[e] ? "Otra contraseña" : "Crear contraseña"}
              </button>
              <button
                type="button"
                onClick={() => quitar(e)}
                className="shrink-0 rounded px-2 py-0.5 text-stone-500 hover:bg-stone-100"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={invitar} className="flex flex-wrap gap-2">
        <input
          id={`invitar-${empresa.id}`}
          type="email"
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          placeholder="mail del cliente"
          className="min-w-0 flex-1 rounded-md border border-stone-300 px-3 py-1.5"
        />
        <button
          type="submit"
          className="rounded-md border border-marca px-3 py-1.5 font-medium text-marca hover:bg-marca-claro"
        >
          Dar acceso
        </button>
      </form>
      {error && <p className="text-red-700">{error}</p>}
    </div>
  );
}

/** Corregir los datos de una empresa o eliminarla con todo lo cargado. */
function EditarEmpresa({
  repo,
  empresa,
  onActualizada,
  onBorrada,
  onCerrar,
}: {
  repo: Repositorio;
  empresa: Empresa;
  onActualizada: (e: Empresa) => void;
  onBorrada: (id: string) => void;
  onCerrar: () => void;
}) {
  const [razonSocial, setRazonSocial] = useState(empresa.razon_social);
  const [cuit, setCuit] = useState(empresa.cuit);
  const [condicion, setCondicion] = useState(empresa.condicion_iva);
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!razonSocial.trim()) return setError("Falta la razón social.");
    if (!cuitValido(cuit)) return setError("El CUIT no es válido.");
    setError(null);
    setTrabajando(true);
    try {
      const cambios = {
        razon_social: razonSocial.trim(),
        cuit,
        condicion_iva: condicion,
      };
      await repo.editarEmpresa(empresa.id, cambios);
      onActualizada({ ...empresa, ...cambios });
      onCerrar();
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      setError(
        /duplicate|unique/i.test(m) ? "Ya hay otra empresa con ese CUIT." : m,
      );
    } finally {
      setTrabajando(false);
    }
  }

  async function eliminar() {
    setError(null);
    setTrabajando(true);
    try {
      await repo.borrarEmpresa(empresa.id);
      onBorrada(empresa.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setTrabajando(false);
    }
  }

  const coincide =
    confirmacion.trim().toLowerCase() ===
    empresa.razon_social.trim().toLowerCase();

  return (
    <div className="mt-3 space-y-4 text-sm">
      <form
        onSubmit={guardar}
        className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
      >
        <label className="block">
          <span className="text-stone-600">Razón social</span>
          <input
            id={`editar-razon-${empresa.id}`}
            value={razonSocial}
            onChange={(ev) => setRazonSocial(ev.target.value)}
            className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-1.5"
          />
        </label>
        <label className="block">
          <span className="text-stone-600">CUIT</span>
          <input
            id={`editar-cuit-${empresa.id}`}
            inputMode="numeric"
            value={cuit}
            onChange={(ev) =>
              setCuit(ev.target.value.replace(/\D/g, "").slice(0, 11))
            }
            className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-1.5 tabular-nums"
          />
        </label>
        <label className="block">
          <span className="text-stone-600">Condición IVA</span>
          <select
            id={`editar-condicion-${empresa.id}`}
            value={condicion}
            onChange={(ev) => setCondicion(ev.target.value)}
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-1.5"
          >
            {CONDICIONES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={trabajando}
          className="rounded-md border border-marca px-3 py-1.5 font-medium text-marca hover:bg-marca-claro disabled:opacity-50"
        >
          Guardar cambios
        </button>
      </form>

      <div className="rounded-lg border border-red-200 bg-red-50 p-3">
        <p className="font-medium text-red-800">Eliminar esta empresa</p>
        <p className="mt-1 text-red-800">
          Se borra la empresa con todo lo cargado: comprobantes, cobros y pagos,
          tickets, bancos, asientos, inventarios, mensajes y accesos de sus
          usuarios. No se puede deshacer. Para confirmar, escribí{" "}
          <strong>{empresa.razon_social}</strong>:
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            id={`confirmar-borrar-${empresa.id}`}
            value={confirmacion}
            onChange={(ev) => setConfirmacion(ev.target.value)}
            placeholder={empresa.razon_social}
            className="min-w-0 flex-1 rounded-md border border-red-300 bg-white px-3 py-1.5"
          />
          <button
            type="button"
            disabled={!coincide || trabajando}
            onClick={eliminar}
            className="rounded-md bg-red-700 px-3 py-1.5 font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            Eliminar definitivamente
          </button>
        </div>
      </div>
      {error && <p className="text-red-700">{error}</p>}
    </div>
  );
}

export function AdminEmpresas({
  repo,
  empresas,
  sinLeer = {},
  onCreada,
  onActualizada,
  onBorrada,
  onAbrir,
  onMensajes,
}: {
  repo: Repositorio;
  empresas: Empresa[];
  /** Mensajes del cliente sin leer, por empresa. */
  sinLeer?: Record<string, number>;
  onCreada: (e: Empresa) => void;
  onActualizada?: (e: Empresa) => void;
  onBorrada?: (id: string) => void;
  onAbrir: (e: Empresa) => void;
  onMensajes?: (e: Empresa) => void;
}) {
  const [razonSocial, setRazonSocial] = useState("");
  const [cuit, setCuit] = useState("");
  const [condicion, setCondicion] = useState(CONDICIONES[0]);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [conUnidades, setConUnidades] = useState<string | null>(null);
  const [conImpuestos, setConImpuestos] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);

  async function crear(e: React.FormEvent) {
    e.preventDefault();
    if (creando) return;
    if (!razonSocial.trim()) return setError("Falta la razón social.");
    if (!cuitValido(cuit)) return setError("El CUIT no es válido.");
    if (empresas.some((x) => x.cuit === cuit))
      return setError("Ya hay una empresa con ese CUIT en la lista.");
    setError(null);
    setCreando(true);
    try {
      const nueva = await repo.crearEmpresa({
        razon_social: razonSocial.trim(),
        cuit,
        condicion_iva: condicion,
      });
      setRazonSocial("");
      setCuit("");
      onCreada(nueva);
      setAbierta(nueva.id);
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : String(err);
      setError(
        /duplicate|unique/i.test(mensaje)
          ? "Ya hay una empresa con ese CUIT."
          : mensaje,
      );
    } finally {
      setCreando(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <ProximosVencimientos empresas={empresas} />
      <AlertasMonotributo repo={repo} empresas={empresas} onAbrir={onAbrir} />
      <Avisos repo={repo} empresas={empresas} />
      <section>
        <h1 className="text-2xl font-semibold">Empresas</h1>
        <p className="mt-1 text-stone-600">
          Tus clientes. Para que un cliente entre al sistema, dale acceso con su
          mail: cuando entre por primera vez va a ver solo su empresa.
        </p>
      </section>

      <form
        onSubmit={crear}
        className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
      >
        <label className="block text-sm">
          <span className="text-stone-600">Razón social</span>
          <input
            id="nueva-razon-social"
            value={razonSocial}
            onChange={(e) => setRazonSocial(e.target.value)}
            className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">CUIT</span>
          <input
            id="nuevo-cuit"
            inputMode="numeric"
            value={cuit}
            onChange={(e) =>
              setCuit(e.target.value.replace(/\D/g, "").slice(0, 11))
            }
            placeholder="30711111111"
            className="mt-1 block w-full rounded-md border border-stone-300 px-3 py-2 tabular-nums"
          />
        </label>
        <label className="block text-sm">
          <span className="text-stone-600">Condición IVA</span>
          <select
            id="nueva-condicion"
            value={condicion}
            onChange={(e) => setCondicion(e.target.value)}
            className="mt-1 block w-full rounded-md border border-stone-300 bg-white px-2 py-2"
          >
            {CONDICIONES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={creando}
          className="rounded-md bg-marca px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          {creando ? "Agregando…" : "Agregar empresa"}
        </button>
        {error && <p className="text-sm text-red-700 sm:col-span-4">{error}</p>}
      </form>

      <section className="space-y-3">
        {empresas.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-stone-500">
            Todavía no cargaste empresas.
          </p>
        ) : (
          empresas.map((e) => (
            <div
              key={e.id}
              className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold">{e.razon_social}</div>
                  <div className="text-sm text-stone-500">
                    CUIT {cuitConGuiones(e.cuit)} · {e.condicion_iva}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sinLeer[e.id] ? (
                    <button
                      type="button"
                      onClick={() => onMensajes?.(e)}
                      className="rounded-md bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-200"
                    >
                      ✉ {sinLeer[e.id]}{" "}
                      {sinLeer[e.id] === 1
                        ? "mensaje nuevo"
                        : "mensajes nuevos"}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setEditando(editando === e.id ? null : e.id)}
                    className="rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
                  >
                    {editando === e.id ? "Cerrar" : "Editar"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConImpuestos(conImpuestos === e.id ? null : e.id)
                    }
                    className="rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
                  >
                    {conImpuestos === e.id ? "Ocultar impuestos" : "Impuestos"}
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setConUnidades(conUnidades === e.id ? null : e.id)
                    }
                    className="rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
                  >
                    {conUnidades === e.id
                      ? "Ocultar unidades"
                      : "Unidades de negocio"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAbierta(abierta === e.id ? null : e.id)}
                    className="rounded-md px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
                  >
                    {abierta === e.id ? "Ocultar accesos" : "Accesos"}
                  </button>
                  <button
                    type="button"
                    onClick={() => onAbrir(e)}
                    className="rounded-md bg-marca px-3 py-1.5 text-sm font-medium text-white hover:opacity-90"
                  >
                    Abrir
                  </button>
                </div>
              </div>
              {editando === e.id && (
                <EditarEmpresa
                  repo={repo}
                  empresa={e}
                  onActualizada={(nueva) => onActualizada?.(nueva)}
                  onBorrada={(id) => {
                    setEditando(null);
                    onBorrada?.(id);
                  }}
                  onCerrar={() => setEditando(null)}
                />
              )}
              {conImpuestos === e.id && (
                <ImpuestosEmpresa
                  repo={repo}
                  empresa={e}
                  onCambio={(nueva) => onActualizada?.(nueva)}
                />
              )}
              {conUnidades === e.id && (
                <UnidadesEmpresa repo={repo} empresaId={e.id} />
              )}
              {abierta === e.id && <Invitaciones repo={repo} empresa={e} />}
            </div>
          ))
        )}
      </section>
    </div>
  );
}
