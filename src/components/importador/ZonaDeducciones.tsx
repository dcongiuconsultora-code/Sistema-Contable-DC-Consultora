"use client";

import { useEffect, useRef, useState } from "react";
import { leerArchivo, leerTexto } from "@/lib/arca/leer-archivo";
import { importarMisRetenciones, importarSircreb, type ResultadoDeducciones } from "@/lib/arca/retenciones";

export interface ArchivoDeducciones {
  nombre: string;
  resultado: ResultadoDeducciones;
}

interface Props {
  archivos: ArchivoDeducciones[];
  onArchivos: (a: ArchivoDeducciones[]) => void;
  /** Archivos cargados desde afuera (por ejemplo, los de ejemplo). */
  archivosExternos?: File[] | null;
}

async function procesar(archivo: File): Promise<ResultadoDeducciones> {
  if (archivo.name.toLowerCase().endsWith(".txt")) return importarSircreb(await leerTexto(archivo));
  return importarMisRetenciones(await leerArchivo(archivo));
}

export function ZonaDeducciones({ archivos, onArchivos, archivosExternos }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  async function agregar(nuevos: File[]) {
    setCargando(true);
    setError(null);
    const leidos: ArchivoDeducciones[] = [];
    const fallas: string[] = [];
    for (const archivo of nuevos) {
      try {
        leidos.push({ nombre: archivo.name, resultado: await procesar(archivo) });
      } catch (e) {
        fallas.push(`${archivo.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    // Un archivo con el mismo nombre reemplaza al anterior.
    const nombres = new Set(leidos.map((l) => l.nombre));
    onArchivos([...archivos.filter((a) => !nombres.has(a.nombre)), ...leidos]);
    setError(fallas.length ? fallas.join("\n") : null);
    setCargando(false);
  }

  useEffect(() => {
    if (archivosExternos?.length) agregar(archivosExternos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivosExternos]);

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <h2 className="font-semibold">Retenciones y percepciones</h2>
        <p className="text-sm text-stone-500">
          Mis Retenciones de ARCA (.xls) y retenciones bancarias de IIBB de SIFERE – SIRCREB (.txt). Podés subir varios.
        </p>
      </div>

      <button
        type="button"
        onClick={() => input.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setArrastrando(true);
        }}
        onDragLeave={() => setArrastrando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastrando(false);
          agregar([...e.dataTransfer.files]);
        }}
        className={`flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-sm transition ${
          arrastrando ? "border-marca bg-marca-claro" : "border-stone-300 hover:border-marca hover:bg-stone-50"
        }`}
      >
        <span className="font-medium text-marca">{cargando ? "Leyendo…" : "Agregar archivos"}</span>
        <span className="mt-1 text-stone-500">o arrastralos acá (.xls, .xlsx o .txt)</span>
      </button>
      <input
        ref={input}
        type="file"
        multiple
        accept=".xls,.xlsx,.csv,.txt"
        className="hidden"
        onChange={(e) => {
          agregar([...(e.target.files ?? [])]);
          e.target.value = "";
        }}
      />

      {error && <p className="mt-3 whitespace-pre-line rounded-md bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {archivos.length > 0 && (
        <ul className="mt-3 divide-y divide-stone-100 text-sm">
          {archivos.map((a) => (
            <li key={a.nombre} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <div className="truncate font-medium">{a.nombre}</div>
                <div className="text-stone-500">
                  {a.resultado.origen} · {a.resultado.deducciones.length} registros
                  {a.resultado.errores.length > 0 && (
                    <span className="text-red-700"> · {a.resultado.errores.length} líneas con problemas</span>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onArchivos(archivos.filter((x) => x.nombre !== a.nombre))}
                className="shrink-0 rounded-md px-2 py-1 text-stone-500 hover:bg-stone-100 hover:text-stone-900"
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
