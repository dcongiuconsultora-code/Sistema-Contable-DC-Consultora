import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Deduccion } from "@/lib/arca/retenciones";
import type { Comprobante, Operacion } from "@/lib/arca/tipos";
import type { ResumenBancario } from "@/lib/bancos/tipos";
import type { SaldosIniciales } from "@/lib/contabilidad/indicadores";
import type { Movimiento } from "@/lib/movimientos/tipos";
import type { TicketExtraido } from "@/lib/tickets/esquema";
import {
  comprobanteAFila,
  type DatosResumen,
  deduccionAFila,
  type FilaComprobante,
  type FilaDeduccion,
  type FilaMovimiento,
  type FilaMovimientoBancario,
  filaAComprobante,
  filaADeduccion,
  filaAMovimiento,
  filasAResumen,
  movimientoAFila,
  resumenAFilas,
} from "./mapeo";

export interface Empresa {
  id: string;
  razon_social: string;
  cuit: string;
  condicion_iva: string;
}

export interface Perfil {
  usuario_id: string;
  nombre: string;
  rol: "estudio" | "cliente";
}

export interface TicketGuardado {
  id: string;
  datos: TicketExtraido;
  /** URL temporal para mostrar la foto. */
  foto: string;
  porQr: boolean;
}

export interface ArchivoDeduccionesGuardado {
  id: string;
  nombre: string;
  origen: Deduccion["origen"];
  deducciones: Deduccion[];
}

export interface DatosEmpresa {
  ventas: Comprobante[];
  compras: Comprobante[];
  movimientos: Movimiento[];
  tickets: TicketGuardado[];
  archivosDeducciones: ArchivoDeduccionesGuardado[];
  saldos: SaldosIniciales;
  resumen: ResumenBancario | null;
}

/** null si la app corre sin base de datos (el prototipo). */
export function crearCliente(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && clave ? createClient(url, clave) : null;
}

function fallar(error: { message: string } | null, que: string): void {
  if (error) throw new Error(`No se pudo ${que}: ${error.message}`);
}

/** Las consultas de Supabase devuelven hasta 1000 filas: se piden de a páginas. */
async function todas<T>(
  consulta: (
    desde: number,
    hasta: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  que: string,
) {
  const filas: T[] = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta(desde, desde + 999);
    fallar(error, que);
    filas.push(...(data ?? []));
    if (!data || data.length < 1000) return filas;
  }
}

export class Repositorio {
  constructor(private db: SupabaseClient) {}

  // Usuarios y empresas ------------------------------------------------------------------------

  async perfil(usuarioId: string): Promise<Perfil | null> {
    const { data, error } = await this.db
      .from("perfiles")
      .select("usuario_id, nombre, rol")
      .eq("usuario_id", usuarioId)
      .maybeSingle();
    fallar(error, "leer el perfil");
    return data;
  }

  async empresas(): Promise<Empresa[]> {
    const { data, error } = await this.db
      .from("empresas")
      .select("id, razon_social, cuit, condicion_iva")
      .order("razon_social");
    fallar(error, "leer las empresas");
    return data ?? [];
  }

  async crearEmpresa(e: Omit<Empresa, "id">): Promise<Empresa> {
    const { data, error } = await this.db
      .from("empresas")
      .insert(e)
      .select("id, razon_social, cuit, condicion_iva")
      .single();
    fallar(error, "crear la empresa");
    return data!;
  }

  async invitaciones(empresaId: string): Promise<string[]> {
    const { data, error } = await this.db
      .from("invitaciones")
      .select("email")
      .eq("empresa_id", empresaId)
      .order("email");
    fallar(error, "leer las invitaciones");
    return (data ?? []).map((i) => i.email);
  }

  async invitar(email: string, empresaId: string) {
    const { error } = await this.db
      .from("invitaciones")
      .upsert({ email: email.trim().toLowerCase(), empresa_id: empresaId });
    fallar(error, "invitar");
  }

  async quitarInvitacion(email: string, empresaId: string) {
    const { error } = await this.db
      .from("invitaciones")
      .delete()
      .eq("email", email)
      .eq("empresa_id", empresaId);
    fallar(error, "quitar la invitación");
  }

  // Todo lo de una empresa ---------------------------------------------------------------------

  async cargar(empresaId: string): Promise<DatosEmpresa> {
    const [
      comprobantes,
      movimientos,
      tickets,
      deducciones,
      archivos,
      saldos,
      resumen,
    ] = await Promise.all([
      todas<FilaComprobante>(
        (d, h) =>
          this.db
            .from("comprobantes")
            .select("*")
            .eq("empresa_id", empresaId)
            .order("fecha")
            .range(d, h),
        "leer los comprobantes",
      ),
      todas<FilaMovimiento>(
        (d, h) =>
          this.db
            .from("movimientos")
            .select("*")
            .eq("empresa_id", empresaId)
            .order("fecha", { ascending: false })
            .range(d, h),
        "leer los movimientos",
      ),
      this.tickets(empresaId),
      todas<FilaDeduccion & { archivo_id: string | null }>(
        (d, h) =>
          this.db
            .from("deducciones")
            .select("*")
            .eq("empresa_id", empresaId)
            .order("fecha")
            .range(d, h),
        "leer las retenciones",
      ),
      this.db
        .from("archivos_importados")
        .select("id, nombre, tipo")
        .eq("empresa_id", empresaId)
        .in("tipo", ["mis_retenciones", "sircreb"])
        .order("cargado_en"),
      this.db
        .from("saldos_iniciales")
        .select("fecha, cuenta, importe")
        .eq("empresa_id", empresaId),
      this.ultimoResumen(empresaId),
    ]);
    fallar(archivos.error, "leer los archivos importados");
    fallar(saldos.error, "leer los saldos de inicio");

    const deduccionesPorArchivo = new Map<string, Deduccion[]>();
    for (const f of deducciones) {
      const lista = deduccionesPorArchivo.get(f.archivo_id ?? "") ?? [];
      lista.push(filaADeduccion(f));
      deduccionesPorArchivo.set(f.archivo_id ?? "", lista);
    }
    return {
      ventas: comprobantes
        .filter((c) => c.operacion === "ventas")
        .map((c, i) => filaAComprobante(c, i + 1)),
      compras: comprobantes
        .filter((c) => c.operacion === "compras")
        .map((c, i) => filaAComprobante(c, i + 1)),
      movimientos: movimientos.map(filaAMovimiento),
      tickets,
      archivosDeducciones: (archivos.data ?? []).map((a) => ({
        id: a.id,
        nombre: a.nombre,
        origen: a.tipo === "sircreb" ? "SIRCREB" : "Mis Retenciones",
        deducciones: deduccionesPorArchivo.get(a.id) ?? [],
      })),
      saldos: {
        fecha: saldos.data?.[0]?.fecha ?? "",
        saldos: Object.fromEntries(
          (saldos.data ?? []).map((s) => [s.cuenta, Number(s.importe)]),
        ),
      },
      resumen,
    };
  }

  private async registrarArchivo(
    empresaId: string,
    tipo: string,
    nombre: string,
    datos: object = {},
  ): Promise<string> {
    const { data, error } = await this.db
      .from("archivos_importados")
      .insert({ empresa_id: empresaId, tipo, nombre, datos })
      .select("id")
      .single();
    fallar(error, "registrar el archivo");
    return data!.id;
  }

  /** Guarda los comprobantes de un archivo de Mis Comprobantes. Los que ya estaban no se duplican. */
  async guardarComprobantes(
    empresaId: string,
    operacion: Operacion,
    comprobantes: Comprobante[],
    nombreArchivo: string,
  ) {
    const archivoId = await this.registrarArchivo(
      empresaId,
      operacion === "ventas" ? "emitidos" : "recibidos",
      nombreArchivo,
    );
    const filas = comprobantes.map((c) =>
      comprobanteAFila(c, empresaId, operacion, archivoId),
    );
    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await this.db
        .from("comprobantes")
        .upsert(filas.slice(i, i + 500), {
          onConflict:
            "empresa_id,operacion,tipo_codigo,punto_venta,numero_desde,cuit_contraparte",
        });
      fallar(error, "guardar los comprobantes");
    }
  }

  async guardarDeducciones(
    empresaId: string,
    nombre: string,
    origen: Deduccion["origen"],
    deducciones: Deduccion[],
  ): Promise<string> {
    const archivoId = await this.registrarArchivo(
      empresaId,
      origen === "SIRCREB" ? "sircreb" : "mis_retenciones",
      nombre,
    );
    const filas = deducciones.map((d) =>
      deduccionAFila(d, empresaId, archivoId),
    );
    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await this.db
        .from("deducciones")
        .insert(filas.slice(i, i + 500));
      fallar(error, "guardar las retenciones");
    }
    return archivoId;
  }

  async borrarArchivo(archivoId: string) {
    const { error } = await this.db
      .from("deducciones")
      .delete()
      .eq("archivo_id", archivoId);
    fallar(error, "borrar las retenciones del archivo");
    const r = await this.db
      .from("archivos_importados")
      .delete()
      .eq("id", archivoId)
      .select("id");
    fallar(r.error, "borrar el archivo");
    if (!r.data?.length)
      throw new Error("Solo puede quitar este archivo quien lo subió.");
  }

  // Movimientos del cliente ----------------------------------------------------------------------

  async guardarMovimientos(empresaId: string, movimientos: Movimiento[]) {
    if (movimientos.length === 0) return;
    const { error } = await this.db.from("movimientos").upsert(
      movimientos.map((m) => ({
        ...movimientoAFila(m, empresaId),
        actualizado_en: new Date().toISOString(),
      })),
    );
    fallar(error, "guardar los movimientos");
  }

  async borrarMovimientos(ids: string[]) {
    if (ids.length === 0) return;
    const { error } = await this.db.from("movimientos").delete().in("id", ids);
    fallar(error, "borrar los movimientos");
  }

  // Tickets con foto ---------------------------------------------------------------------------

  private async tickets(empresaId: string): Promise<TicketGuardado[]> {
    const { data, error } = await this.db
      .from("tickets")
      .select("id, datos, foto, por_qr")
      .eq("empresa_id", empresaId)
      .order("creado_en");
    fallar(error, "leer los tickets");
    const filas = data ?? [];
    const rutas = filas.map((t) => t.foto).filter(Boolean) as string[];
    const firmadas = rutas.length
      ? await this.db.storage.from("tickets").createSignedUrls(rutas, 60 * 60)
      : { data: [] };
    const url = new Map(
      (firmadas.data ?? []).map((f) => [f.path, f.signedUrl]),
    );
    return filas.map((t) => ({
      id: t.id,
      datos: t.datos,
      foto: (t.foto && url.get(t.foto)) || "",
      porQr: t.por_qr,
    }));
  }

  async guardarTicket(
    empresaId: string,
    ticket: { id: string; datos: TicketExtraido; porQr: boolean },
    foto: Blob | null,
  ) {
    let ruta: string | undefined;
    if (foto) {
      ruta = `${empresaId}/${ticket.id}.${foto.type === "image/png" ? "png" : foto.type === "image/webp" ? "webp" : "jpg"}`;
      const subida = await this.db.storage
        .from("tickets")
        .upload(ruta, foto, { upsert: true, contentType: foto.type });
      fallar(subida.error, "subir la foto del ticket");
    }
    const { error } = await this.db.from("tickets").upsert({
      id: ticket.id,
      empresa_id: empresaId,
      datos: ticket.datos,
      por_qr: ticket.porQr,
      ...(ruta ? { foto: ruta } : {}),
    });
    fallar(error, "guardar el ticket");
  }

  async borrarTicket(id: string) {
    const { error } = await this.db.from("tickets").delete().eq("id", id);
    fallar(error, "borrar el ticket");
  }

  // Banco ----------------------------------------------------------------------------------------

  private async ultimoResumen(
    empresaId: string,
  ): Promise<ResumenBancario | null> {
    const { data, error } = await this.db
      .from("archivos_importados")
      .select("id, datos")
      .eq("empresa_id", empresaId)
      .eq("tipo", "resumen_bancario")
      .order("cargado_en", { ascending: false })
      .limit(1)
      .maybeSingle();
    fallar(error, "leer el resumen bancario");
    if (!data) return null;
    const filas = await todas<FilaMovimientoBancario>(
      (d, h) =>
        this.db
          .from("movimientos_bancarios")
          .select("*")
          .eq("archivo_id", data.id)
          .order("orden")
          .range(d, h),
      "leer los movimientos del banco",
    );
    return filasAResumen(data.datos as DatosResumen, filas);
  }

  async guardarResumen(
    empresaId: string,
    resumen: ResumenBancario,
    nombre: string,
  ) {
    const { datos } = resumenAFilas(resumen, empresaId, "");
    const archivoId = await this.registrarArchivo(
      empresaId,
      "resumen_bancario",
      nombre,
      datos,
    );
    const { filas } = resumenAFilas(resumen, empresaId, archivoId);
    for (let i = 0; i < filas.length; i += 500) {
      const { error } = await this.db
        .from("movimientos_bancarios")
        .insert(filas.slice(i, i + 500));
      fallar(error, "guardar los movimientos del banco");
    }
  }

  // Saldos de inicio ---------------------------------------------------------------------------

  async guardarSaldos(empresaId: string, s: SaldosIniciales) {
    const borrar = await this.db
      .from("saldos_iniciales")
      .delete()
      .eq("empresa_id", empresaId);
    fallar(borrar.error, "actualizar los saldos de inicio");
    const filas = Object.entries(s.saldos).map(([cuenta, importe]) => ({
      empresa_id: empresaId,
      fecha: s.fecha || "1900-01-01",
      cuenta,
      importe,
    }));
    if (filas.length === 0) return;
    const { error } = await this.db.from("saldos_iniciales").insert(filas);
    fallar(error, "guardar los saldos de inicio");
  }
}
