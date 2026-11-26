"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { CambiarClave } from "@/components/acceso/CambiarClave";
import { Ingreso } from "@/components/acceso/Ingreso";
import { AdminEmpresas } from "@/components/empresas/AdminEmpresas";
import { Importador } from "@/components/importador/Importador";
import { Marca } from "@/components/Marca";
import { inicialesDe, MenuUsuario } from "@/components/MenuUsuario";
import {
  crearCliente,
  type Empresa,
  type Perfil,
  Repositorio,
} from "@/lib/datos/repositorio";

const CLAVE_EMPRESA = "empresa-elegida";

function leerEmpresaGuardada() {
  try {
    return localStorage.getItem(CLAVE_EMPRESA);
  } catch {
    return null;
  }
}

function recordarEmpresa(id: string) {
  try {
    localStorage.setItem(CLAVE_EMPRESA, id);
  } catch {
    // Sin almacenamiento local se elige de nuevo al entrar.
  }
}

/** La pantalla con la que abre la próxima empresa (por ejemplo, ir directo a los mensajes). */
function recordarSeccion(seccion: string) {
  try {
    sessionStorage.setItem("seccion-al-abrir", seccion);
  } catch {
    // Sin almacenamiento abre en el inicio.
  }
}

/** Pantalla completa con un mensaje (cargando, sin acceso, error). */
function Aviso({
  titulo,
  texto,
  children,
}: {
  titulo: string;
  texto?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">{titulo}</h1>
        {texto && <p className="mt-2 text-stone-600">{texto}</p>}
        {children}
      </div>
    </div>
  );
}

export function App() {
  const db = useMemo(() => crearCliente(), []);
  const repo = useMemo(() => (db ? new Repositorio(db) : null), [db]);
  const [sesion, setSesion] = useState<Session | null | undefined>(undefined);
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [empresas, setEmpresas] = useState<Empresa[] | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [verEmpresas, setVerEmpresas] = useState(false);
  const [comoCliente, setComoCliente] = useState(false);
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Mensajes del cliente sin leer, por empresa (solo para el estudio).
  const [sinLeer, setSinLeer] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!db) return;
    db.auth.getSession().then(({ data }) => setSesion(data.session));
    const { data } = db.auth.onAuthStateChange((_evento, s) => setSesion(s));
    return () => data.subscription.unsubscribe();
  }, [db]);

  const usuarioId = sesion?.user.id;
  useEffect(() => {
    if (!repo || !usuarioId) return;
    setError(null);
    Promise.all([repo.perfil(usuarioId), repo.empresas()])
      .then(([p, lista]) => {
        setPerfil(p);
        setEmpresas(lista);
        const guardada = leerEmpresaGuardada();
        setEmpresaId(
          lista.find((e) => e.id === guardada)?.id ?? lista[0]?.id ?? null,
        );
        // El estudio entra a su pantalla: vencimientos, mensajes y empresas.
        if (p?.rol === "estudio") setVerEmpresas(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [repo, usuarioId]);

  const soyEstudio = perfil?.rol === "estudio";
  useEffect(() => {
    if (!repo || !soyEstudio) return;
    const contar = () => repo.noLeidos(true).then(setSinLeer, () => {});
    contar();
    const t = setInterval(contar, 30_000);
    return () => clearInterval(t);
  }, [repo, soyEstudio, empresaId, verEmpresas]);

  // Sin base de datos configurada: la app funciona como prototipo, con datos que no se guardan.
  if (!db || !repo) return <Importador />;
  if (sesion === undefined) return <Aviso titulo="Cargando…" />;
  if (!sesion) return <Ingreso db={db} />;

  const salir = () => {
    db.auth.signOut();
    setPerfil(null);
    setEmpresas(null);
  };
  if (error)
    return (
      <Aviso titulo="No se pudieron cargar tus datos" texto={error}>
        <button
          type="button"
          onClick={salir}
          className="mt-4 rounded-md border border-stone-300 px-4 py-2"
        >
          Salir
        </button>
      </Aviso>
    );
  if (!perfil || !empresas) return <Aviso titulo="Cargando…" />;

  const esEstudio = perfil.rol === "estudio";
  const empresa = empresas.find((e) => e.id === empresaId) ?? null;
  const elegir = (id: string) => {
    setEmpresaId(id);
    recordarEmpresa(id);
    setVerEmpresas(false);
  };

  const hayOtrosSinLeer = Object.keys(sinLeer).some((id) => id !== empresaId);
  const opcionesCuenta = (enEmpresa: boolean) => [
    ...(esEstudio && enEmpresa
      ? [
          {
            texto: "Mi estudio (todos los clientes)",
            icono: "🏠",
            onClick: () => {
              setComoCliente(false);
              setVerEmpresas(true);
            },
          },
        ]
      : []),
    ...(esEstudio && enEmpresa && !comoCliente
      ? [
          {
            texto: "Ver como la ve el cliente",
            icono: "👁",
            onClick: () => setComoCliente(true),
          },
        ]
      : []),
    {
      texto: "Cambiar contraseña",
      icono: "🔑",
      onClick: () => setCambiandoClave(true),
    },
    { texto: "Salir", icono: "↩", onClick: salir },
  ];
  const cuenta = (enEmpresa: boolean) => (
    <>
      <MenuUsuario
        iniciales={
          esEstudio
            ? "DC"
            : inicialesDe(empresa?.razon_social ?? sesion.user.email ?? "")
        }
        titulo={sesion.user.email ?? ""}
        opciones={opcionesCuenta(enEmpresa)}
        punto={esEstudio && hayOtrosSinLeer}
      />
      {cambiandoClave && (
        <CambiarClave db={db} onCerrar={() => setCambiandoClave(false)} />
      )}
    </>
  );

  const encabezado = (
    <div className="flex items-center gap-2 text-sm">
      {empresas.length > 1 && (
        <select
          id="empresa-elegida"
          aria-label="Empresa"
          value={empresaId ?? ""}
          onChange={(e) => elegir(e.target.value)}
          className="hidden max-w-52 rounded-full border border-stone-200 bg-stone-50 px-3 py-1.5 text-stone-800 hover:border-stone-300 sm:block"
        >
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.razon_social}
              {sinLeer[e.id] && e.id !== empresaId
                ? ` (✉ ${sinLeer[e.id]})`
                : ""}
            </option>
          ))}
        </select>
      )}
      {esEstudio && (
        <button
          type="button"
          onClick={() => {
            setComoCliente(false);
            setVerEmpresas(true);
          }}
          className="hidden items-center gap-1.5 rounded-full border border-stone-200 px-3 py-1.5 font-medium text-stone-700 hover:bg-stone-100 sm:inline-flex"
        >
          🏠 Mi estudio
          {hayOtrosSinLeer && (
            <span
              title="Hay mensajes sin leer de otros clientes"
              className="inline-block h-2 w-2 rounded-full bg-amber-400"
            />
          )}
        </button>
      )}
      {cuenta(true)}
    </div>
  );

  if (esEstudio && (verEmpresas || !empresa)) {
    return (
      <div className="min-h-screen">
        <header className="sticky top-0 z-30 border-b border-stone-200/80 bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-2.5">
            <span className="text-marca">
              <Marca claro />
            </span>
            <div className="flex items-center gap-2 text-sm">
              {empresa && (
                <button
                  type="button"
                  onClick={() => setVerEmpresas(false)}
                  className="hidden rounded-full border border-stone-200 px-3 py-1.5 font-medium text-stone-700 hover:bg-stone-100 sm:block"
                >
                  Volver a {empresa.razon_social}
                </button>
              )}
              {cuenta(false)}
            </div>
          </div>
        </header>
        <AdminEmpresas
          repo={repo}
          empresas={empresas}
          sinLeer={sinLeer}
          onActualizada={(e) =>
            setEmpresas(empresas.map((x) => (x.id === e.id ? e : x)))
          }
          onBorrada={(id) => {
            setEmpresas(empresas.filter((x) => x.id !== id));
            if (empresaId === id) setEmpresaId(null);
          }}
          onCreada={(e) =>
            setEmpresas(
              [...empresas.filter((x) => x.id !== e.id), e].sort((a, b) =>
                a.razon_social.localeCompare(b.razon_social),
              ),
            )
          }
          onAbrir={(e) => elegir(e.id)}
          onMensajes={(e) => {
            recordarSeccion("mensajes");
            elegir(e.id);
          }}
        />
      </div>
    );
  }

  if (!empresa) {
    return (
      <Aviso
        titulo="Todavía no tenés una empresa asignada"
        texto={`Entraste como ${sesion.user.email}. Pedile al estudio que te dé acceso a tu empresa con este mail.`}
      >
        <button
          type="button"
          onClick={salir}
          className="mt-4 rounded-md border border-stone-300 px-4 py-2"
        >
          Salir
        </button>
      </Aviso>
    );
  }

  return (
    <Importador
      key={`${empresa.id}-${comoCliente}`}
      conexion={{
        repo,
        empresa,
        rol: comoCliente ? "cliente" : perfil.rol,
        encabezado,
        salirDeVistaCliente: comoCliente
          ? () => setComoCliente(false)
          : undefined,
      }}
    />
  );
}
