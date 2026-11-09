import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Deduccion } from "@/lib/arca/retenciones";
import type { Comprobante, Operacion } from "@/lib/arca/tipos";
import type { ResumenBancario } from "@/lib/bancos/tipos";
import type { SaldosIniciales } from "@/lib/contabilidad/indicadores";
import type { Movimiento } from "@/lib/movimientos/tipos";
import type { TicketExtraido } from "@/lib/tickets/esquema";
import type { ConfigUnidades, Unidad } from "@/lib/unidades/unidades";
import { INDICES_FACPCE, type Indices } from "@/lib/inflacion/indices";
import type { CorreccionesAxi } from "@/lib/impuestos/axi";
import type { Asiento } from "@/lib/contabilidad/diario";
import { nombreCuenta } from "@/lib/plan/plan";
import type { Inventario } from "@/lib/inventarios/inventarios";
import type { Plantilla } from "@/lib/avisos/avisos";
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
  /** Mes en que cierra el ejercicio (1 a 12). */
  mes_cierre?: number;
  /** Impuestos para los vencimientos; null = los de su condición frente al IVA. */
  impuestos?: string[] | null;
}

/** Lo que el estudio completa al cerrar un ejercicio. */
export interface DatosCierre {
  existenciaFinal?: Record<string, number>;
  actividad?: string;
  domicilio?: string;
  ejercicioNumero?: string;
  /** Correcciones del estudio al ajuste por inflación impositivo. */
  axi?: CorreccionesAxi;
}

export interface Mensaje {
  id: string;
  /** Solo los avisos del estudio tienen asunto. */
  asunto?: string | null;
  texto: string;
  deEstudio: boolean;
  creadoEn: string;
  leido: boolean;
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
  unidad?: string;
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
  unidades: ConfigUnidades;
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
      .select("id, razon_social, cuit, condicion_iva, mes_cierre, impuestos")
      .order("razon_social");
    fallar(error, "leer las empresas");
    return data ?? [];
  }

  async crearEmpresa(e: Omit<Empresa, "id">): Promise<Empresa> {
    const { data, error } = await this.db
      .from("empresas")
      .insert(e)
      .select("id, razon_social, cuit, condicion_iva, mes_cierre, impuestos")
      .single();
    fallar(error, "crear la empresa");
    return data!;
  }

  async actualizarEmpresa(
    id: string,
    cambios: Partial<Pick<Empresa, "mes_cierre" | "impuestos">>,
  ) {
    const { error } = await this.db
      .from("empresas")
      .update(cambios)
      .eq("id", id);
    fallar(error, "guardar los datos de la empresa");
  }

  // Cierre de ejercicio e índices ----------------------------------------------------------------

  async cierre(empresaId: string, fecha: string): Promise<DatosCierre | null> {
    const { data, error } = await this.db
      .from("cierres_ejercicio")
      .select("datos")
      .eq("empresa_id", empresaId)
      .eq("cierre", fecha)
      .maybeSingle();
    fallar(error, "leer el cierre del ejercicio");
    return (data?.datos as DatosCierre) ?? null;
  }

  /** Datos del último cierre guardado (para no volver a escribir la carátula cada año). */
  async ultimoCierre(empresaId: string): Promise<DatosCierre | null> {
    const { data, error } = await this.db
      .from("cierres_ejercicio")
      .select("datos")
      .eq("empresa_id", empresaId)
      .order("cierre", { ascending: false })
      .limit(1)
      .maybeSingle();
    fallar(error, "leer el último cierre");
    return (data?.datos as DatosCierre) ?? null;
  }

  async guardarCierre(empresaId: string, fecha: string, datos: DatosCierre) {
    const { error } = await this.db.from("cierres_ejercicio").upsert({
      empresa_id: empresaId,
      cierre: fecha,
      datos,
      actualizado_en: new Date().toISOString(),
    });
    fallar(error, "guardar el cierre del ejercicio");
  }

  /** Índices FACPCE: los que trae la app más los que se subieron después. */
  async indices(): Promise<Indices> {
    const { data, error } = await this.db
      .from("indices_inflacion")
      .select("mes, valor");
    fallar(error, "leer los índices de inflación");
    const todos = { ...INDICES_FACPCE };
    for (const f of data ?? []) todos[f.mes] = Number(f.valor);
    return todos;
  }

  async guardarIndices(indices: Indices) {
    const filas = Object.entries(indices)
      .filter(
        ([mes, valor]) => Math.abs((INDICES_FACPCE[mes] ?? 0) - valor) > 1e-4,
      )
      .map(([mes, valor]) => ({ mes, valor }));
    if (!filas.length) return 0;
    const { error } = await this.db.from("indices_inflacion").upsert(filas);
    fallar(error, "guardar los índices");
    return filas.length;
  }

  /** El estudio crea (o renueva) la contraseña de un usuario invitado; devuelve la contraseña. */
  async crearClave(email: string): Promise<string> {
    const { data } = await this.db.auth.getSession();
    const respuesta = await fetch("/api/usuarios/clave", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${data.session?.access_token ?? ""}`,
      },
      body: JSON.stringify({ email }),
    });
    const cuerpo = (await respuesta.json().catch(() => ({}))) as {
      clave?: string;
      error?: string;
    };
    if (!respuesta.ok || !cuerpo.clave)
      throw new Error(cuerpo.error ?? "No se pudo crear la contraseña.");
    return cuerpo.clave;
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
      unidades,
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
      this.configUnidades(empresaId),
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
      unidades,
    };
  }

  // Inventarios ---------------------------------------------------------------------------------

  async inventarios(empresaId: string): Promise<Inventario[]> {
    const { data, error } = await this.db
      .from("inventarios")
      .select("id, fecha, unidad_id, descripcion, lineas")
      .eq("empresa_id", empresaId)
      .order("fecha", { ascending: false });
    fallar(error, "leer los inventarios");
    return (data ?? []).map((f) => ({
      id: f.id,
      fecha: f.fecha,
      unidad: f.unidad_id,
      descripcion: f.descripcion,
      lineas: f.lineas,
    }));
  }

  async guardarInventario(empresaId: string, inv: Inventario): Promise<string> {
    const { data, error } = await this.db
      .from("inventarios")
      .upsert({
        ...(inv.id ? { id: inv.id } : {}),
        empresa_id: empresaId,
        fecha: inv.fecha,
        unidad_id: inv.unidad ?? null,
        descripcion: inv.descripcion,
        lineas: inv.lineas,
        actualizado_en: new Date().toISOString(),
      })
      .select("id")
      .single();
    fallar(error, "guardar el inventario");
    return data!.id;
  }

  async borrarInventario(id: string) {
    const { error } = await this.db.from("inventarios").delete().eq("id", id);
    fallar(error, "borrar el inventario");
  }

  // Asientos manuales ---------------------------------------------------------------------------

  async asientosManuales(empresaId: string): Promise<Asiento[]> {
    const filas = await todas<{
      id: string;
      fecha: string;
      descripcion: string;
      lineas: Asiento["lineas"];
      unidad_id: string | null;
    }>(
      (desde, hasta) =>
        this.db
          .from("asientos_manuales")
          .select("id, fecha, descripcion, lineas, unidad_id")
          .eq("empresa_id", empresaId)
          .order("fecha")
          .range(desde, hasta),
      "leer los asientos manuales",
    );
    return filas.map((f) => ({
      id: f.id,
      fecha: f.fecha,
      origen: "Manual" as const,
      descripcion: f.descripcion,
      lineas: f.lineas.map((l) => ({ ...l, nombre: nombreCuenta(l.cuenta) })),
      unidad: f.unidad_id,
    }));
  }

  async guardarAsiento(empresaId: string, a: Asiento): Promise<string> {
    const { data, error } = await this.db
      .from("asientos_manuales")
      .upsert({
        ...(a.id ? { id: a.id } : {}),
        empresa_id: empresaId,
        fecha: a.fecha,
        descripcion: a.descripcion,
        lineas: a.lineas.map(({ cuenta, debe, haber, detalle }) => ({
          cuenta,
          debe,
          haber,
          ...(detalle ? { detalle } : {}),
        })),
        unidad_id: a.unidad ?? null,
      })
      .select("id")
      .single();
    fallar(error, "guardar el asiento");
    return data!.id;
  }

  async borrarAsiento(id: string) {
    const { error } = await this.db
      .from("asientos_manuales")
      .delete()
      .eq("id", id);
    fallar(error, "borrar el asiento");
  }

  // Mensajes entre el cliente y el estudio ------------------------------------------------------

  async mensajes(empresaId: string): Promise<Mensaje[]> {
    const { data, error } = await this.db
      .from("mensajes")
      .select("id, asunto, texto, de_estudio, creado_en, leido")
      .eq("empresa_id", empresaId)
      .order("creado_en")
      .limit(500);
    fallar(error, "leer los mensajes");
    return (data ?? []).map((m) => ({
      id: m.id,
      asunto: m.asunto,
      texto: m.texto,
      deEstudio: m.de_estudio,
      creadoEn: m.creado_en,
      leido: m.leido,
    }));
  }

  async enviarMensaje(empresaId: string, texto: string) {
    const { error } = await this.db
      .from("mensajes")
      .insert({ empresa_id: empresaId, texto: texto.trim() });
    fallar(error, "enviar el mensaje");
  }

  /** Aviso del estudio a una empresa: queda en sus mensajes, con constancia de lectura. */
  async enviarAviso(empresaId: string, asunto: string, texto: string) {
    const { error } = await this.db.from("mensajes").insert({
      empresa_id: empresaId,
      asunto: asunto.trim(),
      texto: texto.trim(),
    });
    fallar(error, "enviar el aviso");
  }

  /** Avisos enviados (los más nuevos primero), con si el cliente ya los leyó. */
  async avisosEnviados(): Promise<
    {
      id: string;
      empresaId: string;
      asunto: string;
      creadoEn: string;
      leido: boolean;
    }[]
  > {
    const { data, error } = await this.db
      .from("mensajes")
      .select("id, empresa_id, asunto, creado_en, leido")
      .not("asunto", "is", null)
      .eq("de_estudio", true)
      .order("creado_en", { ascending: false })
      .limit(200);
    fallar(error, "leer los avisos enviados");
    return (data ?? []).map((m) => ({
      id: m.id,
      empresaId: m.empresa_id,
      asunto: m.asunto,
      creadoEn: m.creado_en,
      leido: m.leido,
    }));
  }

  async plantillas(): Promise<Plantilla[]> {
    const { data, error } = await this.db
      .from("plantillas_aviso")
      .select("id, nombre, asunto, cuerpo")
      .order("nombre");
    fallar(error, "leer los modelos de aviso");
    return data ?? [];
  }

  async guardarPlantilla(p: Plantilla): Promise<string> {
    const { data, error } = await this.db
      .from("plantillas_aviso")
      .upsert({
        ...(p.id ? { id: p.id } : {}),
        nombre: p.nombre,
        asunto: p.asunto,
        cuerpo: p.cuerpo,
        actualizado_en: new Date().toISOString(),
      })
      .select("id")
      .single();
    fallar(error, "guardar el modelo");
    return data!.id;
  }

  async borrarPlantilla(id: string) {
    const { error } = await this.db
      .from("plantillas_aviso")
      .delete()
      .eq("id", id);
    fallar(error, "borrar el modelo");
  }

  /** Mails de los usuarios invitados a cada empresa (para mandarles el aviso por correo). */
  async mailsPorEmpresa(): Promise<Record<string, string[]>> {
    const { data, error } = await this.db
      .from("invitaciones")
      .select("email, empresa_id");
    fallar(error, "leer los mails de los clientes");
    const r: Record<string, string[]> = {};
    for (const f of data ?? []) (r[f.empresa_id] ??= []).push(f.email);
    return r;
  }

  /** Marca como leídos los mensajes que escribió la otra parte (la base no deja marcar los propios). */
  async marcarLeidos(empresaId: string, deEstudio: boolean) {
    const { error } = await this.db
      .from("mensajes")
      .update({ leido: true })
      .eq("empresa_id", empresaId)
      .eq("de_estudio", deEstudio)
      .eq("leido", false);
    fallar(error, "marcar los mensajes como leídos");
  }

  /** Cuántos mensajes de la otra parte faltan leer, por empresa. */
  async noLeidos(soyEstudio: boolean): Promise<Record<string, number>> {
    const { data, error } = await this.db
      .from("mensajes")
      .select("empresa_id")
      .eq("de_estudio", !soyEstudio)
      .eq("leido", false)
      .limit(1000);
    fallar(error, "contar los mensajes sin leer");
    const cuenta: Record<string, number> = {};
    for (const m of data ?? [])
      cuenta[m.empresa_id] = (cuenta[m.empresa_id] ?? 0) + 1;
    return cuenta;
  }

  // Unidades de negocio ------------------------------------------------------------------------

  async unidades(empresaId: string): Promise<Unidad[]> {
    const { data, error } = await this.db
      .from("unidades_negocio")
      .select("id, nombre, puntos_venta, cuentas_bancarias")
      .eq("empresa_id", empresaId)
      .order("orden")
      .order("nombre");
    fallar(error, "leer las unidades de negocio");
    return (data ?? []).map((u) => ({
      id: u.id,
      nombre: u.nombre,
      puntosVenta: u.puntos_venta ?? [],
      cuentasBancarias: u.cuentas_bancarias ?? [],
    }));
  }

  async configUnidades(empresaId: string): Promise<ConfigUnidades> {
    const [unidades, proveedores] = await Promise.all([
      this.unidades(empresaId),
      this.db
        .from("proveedores_unidad")
        .select("cuit, unidad_id")
        .eq("empresa_id", empresaId),
    ]);
    fallar(proveedores.error, "leer los proveedores por unidad");
    return {
      unidades,
      proveedores: Object.fromEntries(
        (proveedores.data ?? []).map((p) => [p.cuit, p.unidad_id]),
      ),
    };
  }

  async guardarUnidad(
    empresaId: string,
    u: Omit<Unidad, "id"> & { id?: string },
  ) {
    const { error } = await this.db.from("unidades_negocio").upsert({
      ...(u.id ? { id: u.id } : {}),
      empresa_id: empresaId,
      nombre: u.nombre.trim(),
      puntos_venta: u.puntosVenta,
      cuentas_bancarias: u.cuentasBancarias,
    });
    fallar(error, "guardar la unidad de negocio");
  }

  async borrarUnidad(id: string) {
    const { error } = await this.db
      .from("unidades_negocio")
      .delete()
      .eq("id", id);
    fallar(error, "borrar la unidad de negocio");
  }

  /** Indica a qué unidad le vende un proveedor; null la quita. */
  async asignarProveedor(
    empresaId: string,
    cuit: string,
    unidadId: string | null,
  ) {
    const { error } = unidadId
      ? await this.db
          .from("proveedores_unidad")
          .upsert({ empresa_id: empresaId, cuit, unidad_id: unidadId })
      : await this.db
          .from("proveedores_unidad")
          .delete()
          .eq("empresa_id", empresaId)
          .eq("cuit", cuit);
    fallar(error, "asignar el proveedor a la unidad");
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
      .select("id, datos, foto, por_qr, unidad_id")
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
      unidad: t.unidad_id ?? undefined,
    }));
  }

  async guardarTicket(
    empresaId: string,
    ticket: {
      id: string;
      datos: TicketExtraido;
      porQr: boolean;
      unidad?: string;
    },
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
      unidad_id: ticket.unidad ?? null,
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
