"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";

export interface ItemMenu<D> {
  texto: string;
  destino: D;
}

export interface EntradaMenu<D> {
  texto: string;
  /** Un destino directo (sin desplegable). */
  destino?: D;
  /** Desplegable con grupos titulados. */
  grupos?: [string, ItemMenu<D>[]][];
  activo: boolean;
  extra?: ReactNode;
}

/** Menú del encabezado: botones directos y desplegables por área. */
export function MenuPrincipal<D>({
  entradas,
  onIr,
}: {
  entradas: EntradaMenu<D>[];
  onIr: (d: D) => void;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  // Los menús de la derecha se abren hacia la izquierda, para no salirse de la pantalla.
  const [haciaIzquierda, setHaciaIzquierda] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const cerrar = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAbierto(null);
    };
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(null);
    document.addEventListener("mousedown", cerrar);
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("mousedown", cerrar);
      document.removeEventListener("keydown", tecla);
    };
  }, [abierto]);

  return (
    <nav ref={ref} className="flex flex-wrap gap-1 text-sm">
      {entradas.map((e) => {
        const grupos = e.grupos?.filter(([, items]) => items.length) ?? [];
        if (e.grupos && grupos.length === 0) return null;
        const clase = `rounded-md px-3 py-1.5 font-medium ${e.activo || abierto === e.texto ? "bg-white/20" : "opacity-80 hover:bg-white/10 hover:opacity-100"}`;
        if (!e.grupos)
          return (
            <button
              key={e.texto}
              type="button"
              onClick={() => {
                setAbierto(null);
                if (e.destino !== undefined) onIr(e.destino);
              }}
              className={clase}
            >
              {e.texto}
              {e.extra}
            </button>
          );
        return (
          <div key={e.texto} className="relative">
            <button
              type="button"
              aria-expanded={abierto === e.texto}
              aria-haspopup="true"
              onClick={(ev) => {
                const r = ev.currentTarget.getBoundingClientRect();
                setHaciaIzquierda(r.left + r.width / 2 > window.innerWidth / 2);
                setAbierto(abierto === e.texto ? null : e.texto);
              }}
              className={clase}
            >
              {e.texto}
              <span aria-hidden className="ml-1 text-xs opacity-70">
                ▾
              </span>
            </button>
            {abierto === e.texto && (
              <div
                role="menu"
                className={`absolute ${haciaIzquierda ? "right-0" : "left-0"} z-40 mt-1 grid w-max max-w-[calc(100vw-2rem)] gap-x-8 gap-y-4 rounded-xl border border-stone-200 bg-white p-4 text-stone-800 shadow-xl ${grupos.length > 2 ? "sm:grid-cols-2" : ""}`}
              >
                {grupos.map(([titulo, items]) => (
                  <div key={titulo} className="min-w-48">
                    <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-stone-500">
                      {titulo}
                    </div>
                    <ul>
                      {items.map((i) => (
                        <li key={i.texto}>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setAbierto(null);
                              onIr(i.destino);
                            }}
                            className="w-full rounded-md px-2 py-1.5 text-left hover:bg-marca-claro hover:text-marca"
                          >
                            {i.texto}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
