"use client";

import { useEffect, useRef, useState } from "react";
import { leerArchivo } from "@/lib/arca/leer-archivo";
import { importarMisComprobantes } from "@/lib/arca/parse";
import type { Operacion, ResultadoImportacion } from "@/lib/arca/tipos";
import { cuitConGuiones } from "@/lib/formato";

interface Props {
  operacion: Operacion;
  resultado: ResultadoImportacion | null;
  onResultado: (r: ResultadoImportacion | null, nombreArchivo?: string) => void;
  /** Archivo cargado desde afuera (por ejemplo, los archivos de ejemplo). */
  archivoExterno?: File | null;
}

const TEXTOS: Record<Operacion, { titulo: string; ayuda: string }> = {
  ventas: {
    titulo: "Comprobantes emitidos",
    ayuda: "Ventas · Mis Comprobantes > Emitidos",
  },
  compras: {
    titulo: "Comprobantes recibidos",
    ayuda: "Compras y gastos · Mis Comprobantes > Recibidos",
  },
};

export function ZonaArchivo({
  operacion,
  resultado,
  onResultado,
  archivoExterno,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [nombre, setNombre] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);

  async function procesar(archivo: File) {
    setCargando(true);
    setError(null);
    setNombre(archivo.name);
    try {
      const filas = await leerArchivo(archivo);
      onResultado(importarMisComprobantes(filas, { operacion }), archivo.name);
    } catch (e) {
      onResultado(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    if (archivoExterno) procesar(archivoExterno);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [archivoExterno]);

  const { titulo, ayuda } = TEXTOS[operacion];
  const conAdvertencias =
    resultado?.comprobantes.filter((c) => c.advertencias.length > 0).length ??
    0;

  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="mb-3">
        <h2 className="font-semibold">{titulo}</h2>
        <p className="text-sm text-stone-500">{ayuda}</p>
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
          const archivo = e.dataTransfer.files[0];
          if (archivo) procesar(archivo);
        }}
        className={`flex w-full flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-6 text-sm transition ${
          arrastrando
            ? "border-marca bg-marca-claro"
            : "border-stone-300 hover:border-marca hover:bg-stone-50"
        }`}
      >
        <span className="font-medium text-marca">
          {cargando
            ? "Leyendo…"
            : nombre
              ? "Cambiar archivo"
              : "Elegir archivo"}
        </span>
        <span className="mt-1 text-stone-500">
          {nombre ?? "o arrastralo acá (.xlsx o .csv)"}
        </span>
      </button>
      <input
        ref={input}
        type="file"
        accept=".xlsx,.csv,.txt"
        className="hidden"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          if (archivo) procesar(archivo);
          e.target.value = "";
        }}
      />

      {error && (
        <p className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}

      {resultado && (
        <div className="mt-3 space-y-2 text-sm">
          <p>
            <strong>{resultado.comprobantes.length}</strong> comprobantes leídos
            {resultado.cuitTitular && (
              <> · CUIT {cuitConGuiones(resultado.cuitTitular)}</>
            )}
            {" · "}formato{" "}
            {resultado.formato === "detallado"
              ? "con desglose por alícuota"
              : "simple"}
          </p>
          {resultado.errores.length > 0 && (
            <details className="rounded-md bg-red-50 p-3 text-red-800">
              <summary className="cursor-pointer">
                {resultado.errores.length} filas con problemas
              </summary>
              <ul className="mt-2 list-disc pl-5">
                {resultado.errores.map((e) => (
                  <li key={e.fila}>
                    Fila {e.fila}: {e.mensaje}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {conAdvertencias > 0 && (
            <p className="rounded-md bg-amber-50 p-3 text-amber-900">
              {conAdvertencias} comprobantes para revisar (marcados en el
              libro).
            </p>
          )}
          {resultado.avisos.map((a) => (
            <p key={a} className="text-stone-600">
              ⓘ {a}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
