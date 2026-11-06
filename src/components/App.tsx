"use client";

import type { Session } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { Ingreso } from "@/components/acceso/Ingreso";
import { AdminEmpresas } from "@/components/empresas/AdminEmpresas";
import { Importador } from "@/components/importador/Importador";
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
  const [error, setError] = useState<string | null>(null);

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
        if (p?.rol === "estudio" && lista.length === 0) setVerEmpresas(true);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, [repo, usuarioId]);

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

  const encabezado = (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {empresas.length > 1 && (
        <select
          id="empresa-elegida"
          aria-label="Empresa"
          value={empresaId ?? ""}
          onChange={(e) => elegir(e.target.value)}
          className="max-w-56 rounded-md border border-white/30 bg-white/10 px-2 py-1.5 text-white"
        >
          {empresas.map((e) => (
            <option key={e.id} value={e.id} className="text-stone-900">
              {e.razon_social}
            </option>
          ))}
        </select>
      )}
      {esEstudio && (
        <button
          type="button"
          onClick={() => setVerEmpresas(true)}
          className="rounded-md px-3 py-1.5 font-medium opacity-80 hover:bg-white/10 hover:opacity-100"
        >
          Empresas
        </button>
      )}
      <button
        type="button"
        onClick={salir}
        title={sesion.user.email}
        className="rounded-md px-3 py-1.5 opacity-80 hover:bg-white/10 hover:opacity-100"
      >
        Salir
      </button>
    </div>
  );

  if (esEstudio && (verEmpresas || !empresa)) {
    return (
      <div className="min-h-screen">
        <header className="bg-marca text-white">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="text-lg font-semibold">
              DC Consultora · Sistema Contable
            </span>
            <div className="flex items-center gap-2 text-sm">
              {empresa && (
                <button
                  type="button"
                  onClick={() => setVerEmpresas(false)}
                  className="rounded-md px-3 py-1.5 font-medium opacity-80 hover:bg-white/10 hover:opacity-100"
                >
                  Volver a {empresa.razon_social}
                </button>
              )}
              <button
                type="button"
                onClick={salir}
                className="rounded-md px-3 py-1.5 opacity-80 hover:bg-white/10 hover:opacity-100"
              >
                Salir
              </button>
            </div>
          </div>
        </header>
        <AdminEmpresas
          repo={repo}
          empresas={empresas}
          onCreada={(e) =>
            setEmpresas(
              [...empresas, e].sort((a, b) =>
                a.razon_social.localeCompare(b.razon_social),
              ),
            )
          }
          onAbrir={(e) => elegir(e.id)}
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
      key={empresa.id}
      conexion={{ repo, empresa, rol: perfil.rol, encabezado }}
    />
  );
}
