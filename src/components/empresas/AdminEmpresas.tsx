"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  Empresa,
  FichaEmpresa,
  Repositorio,
} from "@/lib/datos/repositorio";
import { JURISDICCIONES } from "@/lib/arca/retenciones";
import {
  cuotasVencidas,
  type Impuesto,
  type PlanPago,
  vencimientos,
} from "@/lib/vencimientos/vencimientos";
import { esMonotributo } from "@/lib/monotributo/monotributo";
import { Modal } from "@/components/Modal";
import { inicialesDe } from "@/components/MenuUsuario";
import { linkGmail } from "@/lib/avisos/avisos";
import { cuitConGuiones } from "@/lib/formato";
import { cuitValido } from "@/lib/tickets/validar";
import { AlertasMonotributo, useMonotributistas } from "./AlertasMonotributo";
import { Avisos } from "./Avisos";
import { RecordatoriosClientes } from "./RecordatoriosClientes";
import { UnidadesEmpresa } from "./UnidadesEmpresa";
import {
  AgendaVencimientos,
  ETIQUETA_IMPUESTO,
  ImpuestosEmpresa,
} from "./Vencimientos";

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

const CAMPO =
  "mt-1 block w-full rounded-md border border-stone-300 px-3 py-1.5";

function Campo({
  etiqueta,
  ancho,
  children,
}: {
  etiqueta: string;
  ancho?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${ancho ? "sm:col-span-2" : ""}`}>
      <span className="text-stone-600">{etiqueta}</span>
      {children}
    </label>
  );
}

/** Ficha completa del cliente (datos fiscales y de contacto) o eliminarlo con todo lo cargado. */

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
  const [ficha, setFicha] = useState<FichaEmpresa>(() => ({
    razon_social: empresa.razon_social,
    cuit: empresa.cuit,
    condicion_iva: empresa.condicion_iva,
    actividad: empresa.actividad ?? "",
    domicilio: empresa.domicilio ?? "",
    localidad: empresa.localidad ?? "",
    provincia: empresa.provincia ?? "",
    codigo_postal: empresa.codigo_postal ?? "",
    telefono: empresa.telefono ?? "",
    email_contacto: empresa.email_contacto ?? "",
    contacto: empresa.contacto ?? "",
    inicio_actividades: empresa.inicio_actividades ?? null,
    iibb_numero: empresa.iibb_numero ?? "",
    iibb_regimen: empresa.iibb_regimen ?? "",
    notas: empresa.notas ?? "",
  }));
  const cambiar = (c: Partial<FichaEmpresa>) => setFicha({ ...ficha, ...c });
  const [confirmacion, setConfirmacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  async function guardar(ev: React.FormEvent) {
    ev.preventDefault();
    if (!ficha.razon_social.trim()) return setError("Falta la razón social.");
    if (!cuitValido(ficha.cuit)) return setError("El CUIT no es válido.");
    const mail = (ficha.email_contacto ?? "").trim().toLowerCase();
    if (mail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail))
      return setError("El mail de contacto no parece válido.");
    setError(null);
    setTrabajando(true);
    try {
      const cambios: FichaEmpresa = {
        ...ficha,
        razon_social: ficha.razon_social.trim(),
        email_contacto: mail,
        inicio_actividades: ficha.inicio_actividades || null,
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
      <form onSubmit={guardar} className="space-y-4">
        <fieldset className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Datos fiscales
          </legend>
          <Campo etiqueta="Razón social">
            <input
              id={`editar-razon-${empresa.id}`}
              value={ficha.razon_social}
              onChange={(ev) => cambiar({ razon_social: ev.target.value })}
              className={CAMPO}
            />
          </Campo>
          <Campo etiqueta="CUIT">
            <input
              id={`editar-cuit-${empresa.id}`}
              inputMode="numeric"
              value={ficha.cuit}
              onChange={(ev) =>
                cambiar({
                  cuit: ev.target.value.replace(/\D/g, "").slice(0, 11),
                })
              }
              className={`${CAMPO} tabular-nums`}
            />
          </Campo>
          <Campo etiqueta="Condición IVA">
            <select
              id={`editar-condicion-${empresa.id}`}
              value={ficha.condicion_iva}
              onChange={(ev) => cambiar({ condicion_iva: ev.target.value })}
              className={`${CAMPO} bg-white`}
            >
              {CONDICIONES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Campo>
          <Campo etiqueta="Actividad principal" ancho>
            <input
              id={`editar-actividad-${empresa.id}`}
              value={ficha.actividad}
              onChange={(ev) => cambiar({ actividad: ev.target.value })}
              placeholder="Venta al por menor en kioscos y minimercados"
              className={CAMPO}
            />
          </Campo>
          <Campo etiqueta="Inicio de actividades">
            <input
              id={`editar-inicio-${empresa.id}`}
              type="date"
              value={ficha.inicio_actividades ?? ""}
              onChange={(ev) =>
                cambiar({ inicio_actividades: ev.target.value || null })
              }
              className={CAMPO}
            />
          </Campo>
          <Campo etiqueta="Ingresos Brutos: régimen">
            <select
              id={`editar-iibb-regimen-${empresa.id}`}
              value={ficha.iibb_regimen}
              onChange={(ev) => cambiar({ iibb_regimen: ev.target.value })}
              className={`${CAMPO} bg-white`}
            >
              <option value="">—</option>
              <option>Convenio Multilateral</option>
              <option>Contribuyente local</option>
              <option>Régimen simplificado</option>
              <option>Exento</option>
              <option>No inscripto</option>
            </select>
          </Campo>
          <Campo etiqueta="Ingresos Brutos: número">
            <input
              id={`editar-iibb-${empresa.id}`}
              value={ficha.iibb_numero}
              onChange={(ev) => cambiar({ iibb_numero: ev.target.value })}
              className={CAMPO}
            />
          </Campo>
        </fieldset>
        <fieldset className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
          <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
            Domicilio y contacto
          </legend>
          <Campo etiqueta="Domicilio">
            <input
              id={`editar-domicilio-${empresa.id}`}
              value={ficha.domicilio}
              onChange={(ev) => cambiar({ domicilio: ev.target.value })}
              placeholder="Calle y número"
              className={CAMPO}
            />
          </Campo>
          <Campo etiqueta="Localidad">
            <input
              id={`editar-localidad-${empresa.id}`}
              value={ficha.localidad}
              onChange={(ev) => cambiar({ localidad: ev.target.value })}
              className={CAMPO}
            />
          </Campo>
          <Campo etiqueta="Provincia">
            <input
              id={`editar-provincia-${empresa.id}`}
              list="provincias-ficha"
              value={ficha.provincia}
              onChange={(ev) => cambiar({ provincia: ev.target.value })}
              className={CAMPO}
            />
          </Campo>
          <Campo etiqueta="Persona de contacto">
            <input
              id={`editar-contacto-${empresa.id}`}
              value={ficha.contacto}
              onChange={(ev) => cambiar({ contacto: ev.target.value })}
              className={CAMPO}
            />
          </Campo>
          <Campo etiqueta="Teléfono / WhatsApp">
            <input
              id={`editar-telefono-${empresa.id}`}
              type="tel"
              value={ficha.telefono}
              onChange={(ev) => cambiar({ telefono: ev.target.value })}
              placeholder="+54 9 388 …"
              className={CAMPO}
            />
          </Campo>
          <Campo etiqueta="Código postal">
            <input
              id={`editar-cp-${empresa.id}`}
              value={ficha.codigo_postal}
              onChange={(ev) => cambiar({ codigo_postal: ev.target.value })}
              className={CAMPO}
            />
          </Campo>
          <Campo etiqueta="Mail de contacto" ancho>
            <input
              id={`editar-mail-${empresa.id}`}
              type="email"
              value={ficha.email_contacto}
              onChange={(ev) => cambiar({ email_contacto: ev.target.value })}
              className={CAMPO}
            />
          </Campo>
          <Campo etiqueta="Notas" ancho>
            <textarea
              id={`editar-notas-${empresa.id}`}
              value={ficha.notas}
              onChange={(ev) => cambiar({ notas: ev.target.value })}
              rows={2}
              className={CAMPO}
            />
          </Campo>
        </fieldset>
        <datalist id="provincias-ficha">
          {Object.values(JURISDICCIONES).map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
        <button
          type="submit"
          disabled={trabajando}
          className="rounded-md bg-marca px-4 py-2 font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Guardar ficha
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

type Panel = "ficha" | "impuestos" | "unidades" | "accesos";

const TITULO_PANEL: Record<Panel, string> = {
  ficha: "Ficha del cliente",
  impuestos: "Impuestos y cierre de ejercicio",
  unidades: "Unidades de negocio",
  accesos: "Acceso del cliente al sistema",
};

function hoyIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function sumarDiasIso(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function saludo() {
  const h = new Date().getHours();
  return h < 13 ? "Buen día" : h < 20 ? "Buenas tardes" : "Buenas noches";
}

function fechaHoyLarga() {
  const t = new Date().toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function Kpi({
  titulo,
  valor,
  detalle,
  icono,
  tono,
  onClick,
}: {
  titulo: string;
  valor: string | number;
  detalle: string;
  icono: string;
  tono: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-stone-200/80 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-stone-500">{titulo}</span>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg ${tono}`}
        >
          {icono}
        </span>
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight">{valor}</div>
      <div className="mt-1 text-sm text-stone-500">{detalle}</div>
    </button>
  );
}

interface Alerta {
  empresa: Empresa;
  nivel: "rojo" | "ambar";
  texto: string;
  accion: string;
  onClick: () => void;
}

type Filtro = "todos" | "ri" | "mono" | "alertas";

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
  const [creando, setCreando] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState(false);
  const [conAvisos, setConAvisos] = useState(false);
  const [panel, setPanel] = useState<{ tipo: Panel; id: string } | null>(null);
  const [menuDe, setMenuDe] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [planes, setPlanes] = useState<Record<string, PlanPago[]>>({});
  useEffect(() => {
    repo.planesPago().then(setPlanes, () => {});
  }, [repo]);
  const mono = useMonotributistas(repo, empresas);
  useEffect(() => {
    if (!menuDe) return;
    const cerrar = (ev: MouseEvent) => {
      if (!(ev.target as HTMLElement).closest("[data-menu-cliente]"))
        setMenuDe(null);
    };
    document.addEventListener("mousedown", cerrar);
    return () => document.removeEventListener("mousedown", cerrar);
  }, [menuDe]);

  const hoy = hoyIso();
  const semana = useMemo(
    () => vencimientos(empresas, hoy, sumarDiasIso(hoy, 7), planes).lista,
    [empresas, hoy, planes],
  );
  const proximos = useMemo(() => {
    const m = new Map<
      string,
      { fecha: string; impuesto: Impuesto; detalle: string }
    >();
    for (const v of vencimientos(empresas, hoy, sumarDiasIso(hoy, 45), planes)
      .lista)
      if (!m.has(v.empresaId)) m.set(v.empresaId, v);
    return m;
  }, [empresas, hoy, planes]);

  const alertas: Alerta[] = [];
  for (const f of mono.filas) {
    if (!mono.tabla?.length || f.uso < 0.8) continue;
    alertas.push({
      empresa: f.e,
      nivel: f.uso > 1 ? "rojo" : "ambar",
      texto:
        f.uso > 1
          ? `${f.e.razon_social} pasó el tope de la categoría ${f.actual?.letra ?? ""}${f.corresponde ? ` (corresponde ${f.corresponde.letra})` : ""}`
          : `${f.e.razon_social} está al ${(f.uso * 100).toFixed(0)} % del tope de su categoría`,
      accion: "Ver",
      onClick: () => onAbrir(f.e),
    });
  }
  for (const e of empresas) {
    const vencidas = cuotasVencidas(planes[e.id] ?? [], hoy);
    if (vencidas.length)
      alertas.push({
        empresa: e,
        nivel: "ambar",
        texto:
          vencidas.length === 1
            ? `${e.razon_social} no pagó la cuota ${vencidas[0].cuota.numero} del plan ${vencidas[0].plan.numero || ""}`.trim()
            : `${e.razon_social} tiene ${vencidas.length} cuotas de planes de pago vencidas`,
        accion: "Ver plan",
        onClick: () => onAbrir(e),
      });
    if (sinLeer[e.id])
      alertas.push({
        empresa: e,
        nivel: "ambar",
        texto: `${e.razon_social} te mandó ${sinLeer[e.id] === 1 ? "un mensaje" : `${sinLeer[e.id]} mensajes`}`,
        accion: "Leer",
        onClick: () => onMensajes?.(e),
      });
  }
  alertas.sort((a, b) =>
    a.nivel === b.nivel ? 0 : a.nivel === "rojo" ? -1 : 1,
  );
  const conAlerta = new Set(alertas.map((a) => a.empresa.id));
  const nivelDe = (id: string) =>
    alertas.find((a) => a.empresa.id === id && a.nivel === "rojo")
      ? "rojo"
      : conAlerta.has(id)
        ? "ambar"
        : "ok";

  const clientesSemana = new Set(semana.map((v) => v.empresaId)).size;
  const mensajes = Object.values(sinLeer).reduce((t, n) => t + n, 0);
  const cantMono = empresas.filter((e) =>
    esMonotributo(e.condicion_iva),
  ).length;

  const normal = (t: string) =>
    t
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLowerCase();
  const visibles = empresas.filter((e) => {
    if (filtro === "ri" && esMonotributo(e.condicion_iva)) return false;
    if (filtro === "mono" && !esMonotributo(e.condicion_iva)) return false;
    if (filtro === "alertas" && !conAlerta.has(e.id)) return false;
    const q = normal(buscar.trim());
    if (!q) return true;
    return (
      normal(e.razon_social).includes(q) ||
      e.cuit.includes(q.replace(/\D/g, "") || "@")
    );
  });

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
      setNuevoCliente(false);
      setPanel({ tipo: "accesos", id: nueva.id });
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

  const empresaPanel = panel && empresas.find((e) => e.id === panel.id);
  const irAClientes = (f: Filtro) => {
    setFiltro(f);
    document.getElementById("clientes")?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-16 pt-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-stone-500">{fechaHoyLarga()}</p>
          <h1 className="text-3xl font-semibold tracking-tight">
            {saludo()} 👋
          </h1>
          <p className="mt-1 text-stone-600">
            {semana.length ? (
              <>
                Esta semana vencen <b>{semana.length}</b>{" "}
                {semana.length === 1 ? "obligación" : "obligaciones"} de{" "}
                {clientesSemana} {clientesSemana === 1 ? "cliente" : "clientes"}
              </>
            ) : (
              "No hay vencimientos esta semana"
            )}
            {alertas.length ? (
              <>
                {" "}
                y hay <b>{alertas.length}</b>{" "}
                {alertas.length === 1 ? "cosa" : "cosas"} para atender.
              </>
            ) : (
              " y no hay nada urgente. 🎉"
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setConAvisos(true)}
            className="rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-medium hover:bg-stone-50"
          >
            ✉️ Enviar aviso
          </button>
          <button
            type="button"
            onClick={() => setNuevoCliente(true)}
            className="rounded-xl bg-marca px-4 py-2.5 text-sm font-medium text-white hover:opacity-90"
          >
            ＋ Nuevo cliente
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <Kpi
          titulo="Vencen esta semana"
          valor={semana.length}
          detalle={`${clientesSemana} ${clientesSemana === 1 ? "cliente" : "clientes"}`}
          icono="📅"
          tono="bg-marca-claro"
          onClick={() =>
            document
              .getElementById("agenda")
              ?.scrollIntoView({ behavior: "smooth" })
          }
        />
        <Kpi
          titulo="Para atender"
          valor={alertas.length}
          detalle={
            alertas.filter((a) => a.nivel === "rojo").length
              ? `${alertas.filter((a) => a.nivel === "rojo").length} urgente`
              : "nada urgente"
          }
          icono="⚠️"
          tono="bg-red-50"
          onClick={() => irAClientes("alertas")}
        />
        <Kpi
          titulo="Mensajes sin leer"
          valor={mensajes}
          detalle={
            mensajes
              ? `de ${Object.keys(sinLeer).length} ${Object.keys(sinLeer).length === 1 ? "cliente" : "clientes"}`
              : "todo leído"
          }
          icono="💬"
          tono="bg-amber-50"
          onClick={() => irAClientes("alertas")}
        />
        <Kpi
          titulo="Clientes"
          valor={empresas.length}
          detalle={`${empresas.length - cantMono} RI/exentos · ${cantMono} monotributo`}
          icono="👥"
          tono="bg-emerald-50"
          onClick={() => irAClientes("todos")}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <div id="agenda">
          <AgendaVencimientos
            empresas={empresas}
            planes={planes}
            onAbrir={(id) => {
              const e = empresas.find((x) => x.id === id);
              if (e) onAbrir(e);
            }}
          />
        </div>
        <div className="space-y-6">
          <section className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-lg font-semibold">Para atender</h2>
            {alertas.length === 0 ? (
              <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
                ✓ No hay nada pendiente.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {alertas.slice(0, 8).map((a) => (
                  <li
                    key={a.texto}
                    className="flex items-center gap-3 rounded-xl bg-stone-50 p-3"
                  >
                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${a.nivel === "rojo" ? "bg-red-500" : "bg-amber-500"}`}
                    />
                    <span className="flex-1">{a.texto}</span>
                    <button
                      type="button"
                      onClick={a.onClick}
                      className="shrink-0 font-medium text-marca hover:underline"
                    >
                      {a.accion}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <AlertasMonotributo
            filas={mono.filas}
            tabla={mono.tabla}
            onAbrir={onAbrir}
          />
        </div>
      </div>

      <RecordatoriosClientes
        repo={repo}
        empresas={empresas}
        planes={planes}
        onFicha={(id) => setPanel({ tipo: "ficha", id })}
      />

      <section
        id="clientes"
        className="scroll-mt-20 rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm sm:p-6"
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Clientes <span className="text-stone-400">· {empresas.length}</span>
          </h2>
          <input
            id="buscar-cliente"
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            placeholder="🔍 Buscar por nombre o CUIT…"
            className="w-full rounded-full border border-stone-200 bg-stone-50 px-4 py-2 text-sm sm:w-72"
          />
        </div>
        <div className="mb-4 flex flex-wrap gap-2 text-sm">
          {(
            [
              ["todos", "Todos"],
              ["ri", "Responsables inscriptos"],
              ["mono", "Monotributo"],
              ["alertas", `Con algo pendiente (${conAlerta.size})`],
            ] as const
          ).map(([f, texto]) => (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className={`rounded-full px-3 py-1.5 ${filtro === f ? "bg-marca text-white" : "bg-stone-100 text-stone-600 hover:bg-stone-200"}`}
            >
              {texto}
            </button>
          ))}
        </div>
        {empresas.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-stone-500">
            Todavía no cargaste clientes. Empezá con “＋ Nuevo cliente”.
          </p>
        ) : visibles.length === 0 ? (
          <p className="p-6 text-center text-stone-500">
            No hay clientes con ese filtro.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {visibles.map((e) => {
              const nivel = nivelDe(e.id);
              const alerta = alertas.find((a) => a.empresa.id === e.id);
              const prox = proximos.get(e.id);
              const esMono = esMonotributo(e.condicion_iva);
              const filaMono = mono.filas.find((f) => f.e.id === e.id);
              return (
                <div
                  key={e.id}
                  className="relative flex flex-col rounded-xl border border-stone-200 p-4 transition hover:border-marca/40 hover:shadow-md"
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-marca-claro text-sm font-semibold text-marca">
                      {inicialesDe(e.razon_social)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onAbrir(e)}
                        className="block max-w-full truncate text-left font-semibold hover:text-marca"
                      >
                        {e.razon_social}
                      </button>
                      <div className="text-xs text-stone-500">
                        {cuitConGuiones(e.cuit)} ·{" "}
                        <span className="rounded bg-stone-100 px-1.5 py-0.5">
                          {esMono
                            ? `Mono ${e.categoria_monotributo ?? ""}`.trim()
                            : e.condicion_iva === "Exento"
                              ? "Exento"
                              : "RI"}
                        </span>
                      </div>
                    </div>
                    <div className="relative" data-menu-cliente>
                      <button
                        type="button"
                        aria-label={`Más opciones de ${e.razon_social}`}
                        onClick={() => setMenuDe(menuDe === e.id ? null : e.id)}
                        className="rounded-lg px-2 py-0.5 text-lg leading-none text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                      >
                        ⋯
                      </button>
                      {menuDe === e.id && (
                        <div
                          role="menu"
                          className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-stone-200 bg-white p-1.5 text-sm shadow-xl"
                        >
                          {(
                            [
                              ["ficha", "📇 Ficha del cliente"],
                              ["impuestos", "🧾 Impuestos y cierre"],
                              ["accesos", "🔑 Acceso del cliente"],
                              ["unidades", "🏷 Unidades de negocio"],
                            ] as const
                          ).map(([tipo, texto]) => (
                            <button
                              key={tipo}
                              type="button"
                              role="menuitem"
                              onClick={() => {
                                setMenuDe(null);
                                setPanel({ tipo, id: e.id });
                              }}
                              className="block w-full rounded-lg px-3 py-2 text-left hover:bg-stone-100"
                            >
                              {texto}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-start gap-2 text-sm text-stone-600">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${nivel === "rojo" ? "bg-red-500" : nivel === "ambar" ? "bg-amber-500" : "bg-emerald-500"}`}
                    />
                    <span className="min-w-0">
                      {alerta
                        ? alerta.texto
                            .replace(`${e.razon_social} `, "")
                            .replace(/^./, (c) => c.toUpperCase())
                        : prox
                          ? `Próximo: ${ETIQUETA_IMPUESTO[prox.impuesto][0]} el ${prox.fecha.slice(8)}/${prox.fecha.slice(5, 7)}`
                          : filaMono && mono.tabla?.length
                            ? `${(filaMono.uso * 100).toFixed(0)} % del tope anual`
                            : "Todo al día"}
                    </span>
                  </div>
                  <div className="mt-auto flex items-center justify-end gap-2 pt-3">
                    {sinLeer[e.id] ? (
                      <button
                        type="button"
                        onClick={() => onMensajes?.(e)}
                        className="rounded-lg bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-200"
                      >
                        💬 {sinLeer[e.id]}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onAbrir(e)}
                      className="rounded-lg bg-marca px-3.5 py-1.5 text-sm font-medium text-white hover:opacity-90"
                    >
                      Abrir
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {nuevoCliente && (
        <Modal
          titulo="Nuevo cliente"
          subtitulo="Después le das acceso con su mail para que entre al sistema."
          onCerrar={() => setNuevoCliente(false)}
          ancho="max-w-xl"
        >
          <form onSubmit={crear} className="grid gap-4">
            <label className="block text-sm">
              <span className="text-stone-600">Razón social o nombre</span>
              <input
                id="nueva-razon-social"
                value={razonSocial}
                onChange={(e) => setRazonSocial(e.target.value)}
                className="mt-1 block w-full rounded-xl border border-stone-300 px-3 py-2.5"
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
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
                  className="mt-1 block w-full rounded-xl border border-stone-300 px-3 py-2.5 tabular-nums"
                />
              </label>
              <label className="block text-sm">
                <span className="text-stone-600">Condición frente al IVA</span>
                <select
                  id="nueva-condicion"
                  value={condicion}
                  onChange={(e) => setCondicion(e.target.value)}
                  className="mt-1 block w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5"
                >
                  {CONDICIONES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>
            {error && <p className="text-sm text-red-700">{error}</p>}
            <button
              type="submit"
              disabled={creando}
              className="justify-self-end rounded-xl bg-marca px-5 py-2.5 font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {creando ? "Agregando…" : "Agregar cliente"}
            </button>
          </form>
        </Modal>
      )}

      {conAvisos && (
        <Modal
          titulo="Avisos a clientes"
          subtitulo="Recordatorios y pedidos de documentación con texto prearmado."
          onCerrar={() => setConAvisos(false)}
          ancho="max-w-5xl"
        >
          <Avisos repo={repo} empresas={empresas} />
        </Modal>
      )}

      {panel && empresaPanel && (
        <Modal
          titulo={TITULO_PANEL[panel.tipo]}
          subtitulo={`${empresaPanel.razon_social} · CUIT ${cuitConGuiones(empresaPanel.cuit)}`}
          onCerrar={() => setPanel(null)}
        >
          {panel.tipo === "ficha" && (
            <EditarEmpresa
              repo={repo}
              empresa={empresaPanel}
              onActualizada={(nueva) => onActualizada?.(nueva)}
              onBorrada={(id) => {
                setPanel(null);
                onBorrada?.(id);
              }}
              onCerrar={() => setPanel(null)}
            />
          )}
          {panel.tipo === "impuestos" && (
            <ImpuestosEmpresa
              repo={repo}
              empresa={empresaPanel}
              onCambio={(nueva) => onActualizada?.(nueva)}
            />
          )}
          {panel.tipo === "unidades" && (
            <UnidadesEmpresa repo={repo} empresaId={empresaPanel.id} />
          )}
          {panel.tipo === "accesos" && (
            <Invitaciones repo={repo} empresa={empresaPanel} />
          )}
        </Modal>
      )}
    </div>
  );
}
