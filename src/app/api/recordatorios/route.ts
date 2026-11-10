import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  recordatoriosDelDia,
  textoRecordatorio,
} from "@/lib/vencimientos/recordatorios";
import type { PlanPago } from "@/lib/vencimientos/vencimientos";

// Recordatorios de vencimientos: todos los días (programado en vercel.json) le deja a cada cliente
// un aviso en Mensajes con lo que vence en los próximos 3 días y las cuotas de planes impagas.
// Cada vencimiento se avisa una sola vez. Si están configurados GMAIL_USUARIO y
// GMAIL_CLAVE_APLICACION, además le manda un mail. También lo puede disparar el estudio a mano.

function hoyArgentina() {
  return new Date().toLocaleDateString("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
  });
}

async function autorizado(request: Request, admin: SupabaseClient) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return true;
  // Sin CRON_SECRET, el aviso es inofensivo (cada vencimiento se manda una sola vez); igual, si
  // viene una sesión, tiene que ser del estudio.
  if (!token) return !process.env.CRON_SECRET;
  const { data } = await admin.auth.getUser(token);
  if (!data.user) return false;
  const { data: perfil } = await admin
    .from("perfiles")
    .select("rol")
    .eq("usuario_id", data.user.id)
    .maybeSingle();
  return perfil?.rol === "estudio";
}

async function mandarMail(para: string[], asunto: string, texto: string) {
  const usuario = process.env.GMAIL_USUARIO;
  const clave = process.env.GMAIL_CLAVE_APLICACION;
  if (!usuario || !clave || !para.length) return false;
  const nodemailer = await import("nodemailer");
  const transporte = nodemailer.createTransport({
    service: "gmail",
    auth: { user: usuario, pass: clave },
  });
  await transporte.sendMail({
    from: `DC Consultora <${usuario}>`,
    to: para.join(","),
    subject: asunto,
    text: texto,
  });
  return true;
}

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !servicio)
    return Response.json(
      { error: "Falta configurar el servidor." },
      { status: 500 },
    );
  const admin = createClient(url, servicio, {
    auth: { persistSession: false },
  });
  if (!(await autorizado(request, admin)))
    return Response.json({ error: "No autorizado." }, { status: 401 });

  // El estudio puede mandar los de una sola empresa.
  const soloEmpresa = new URL(request.url).searchParams.get("empresa");
  const [empresas, planesFilas, invitaciones] = await Promise.all([
    soloEmpresa
      ? admin
          .from("empresas")
          .select(
            "id, razon_social, cuit, condicion_iva, mes_cierre, impuestos, email_contacto",
          )
          .eq("id", soloEmpresa)
      : admin
          .from("empresas")
          .select(
            "id, razon_social, cuit, condicion_iva, mes_cierre, impuestos, email_contacto",
          ),
    admin.from("planes_pago").select("*"),
    admin.from("invitaciones").select("email, empresa_id"),
  ]);
  if (empresas.error || planesFilas.error || invitaciones.error)
    return Response.json(
      {
        error: (empresas.error ?? planesFilas.error ?? invitaciones.error)!
          .message,
      },
      { status: 500 },
    );

  const planes: Record<string, PlanPago[]> = {};
  for (const f of planesFilas.data ?? [])
    (planes[f.empresa_id] ??= []).push({
      id: f.id,
      organismo: f.organismo,
      numero: f.numero,
      descripcion: f.descripcion,
      cuotas: f.cuotas,
      primeraCuota: f.primera_cuota,
      importeCuota: Number(f.importe_cuota),
      diaVencimiento: f.dia_vencimiento,
      cuotasPagadas: f.cuotas_pagadas ?? [],
      estado: f.estado,
    });

  const hoy = hoyArgentina();
  const porEmpresa = recordatoriosDelDia(empresas.data ?? [], planes, hoy);
  const resumen = {
    hoy,
    empresas: 0,
    avisos: 0,
    mails: 0,
    errores: [] as string[],
  };

  for (const e of empresas.data ?? []) {
    const lista = porEmpresa.get(e.id);
    if (!lista?.length) continue;
    // Solo lo que todavía no se avisó.
    const nuevos = [];
    for (const r of lista) {
      const { data, error } = await admin
        .from("recordatorios_enviados")
        .upsert(
          { empresa_id: e.id, clave: r.clave },
          { onConflict: "empresa_id,clave", ignoreDuplicates: true },
        )
        .select("clave");
      if (error) resumen.errores.push(`${e.razon_social}: ${error.message}`);
      else if (data?.length) nuevos.push(r);
    }
    if (!nuevos.length) continue;
    const asunto = `Recordatorio de vencimientos · ${e.razon_social}`;
    const texto = textoRecordatorio(
      e.razon_social,
      nuevos.map((r) => r.linea),
    );
    const { error } = await admin
      .from("mensajes")
      .insert({ empresa_id: e.id, asunto, texto });
    if (error) {
      resumen.errores.push(`${e.razon_social}: ${error.message}`);
      continue;
    }
    resumen.empresas++;
    resumen.avisos += nuevos.length;
    const para = [
      ...new Set(
        [
          ...(invitaciones.data ?? [])
            .filter((i) => i.empresa_id === e.id)
            .map((i) => i.email),
          e.email_contacto,
        ].filter(Boolean),
      ),
    ];
    try {
      if (await mandarMail(para, asunto, texto)) {
        resumen.mails++;
        await admin
          .from("recordatorios_enviados")
          .update({ por_mail: true })
          .eq("empresa_id", e.id)
          .in(
            "clave",
            nuevos.map((r) => r.clave),
          );
      }
    } catch (err) {
      resumen.errores.push(
        `Mail a ${e.razon_social}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  // A quien llama sin sesión (la tarea programada) no se le muestran nombres de empresas.
  const conSesion = Boolean(request.headers.get("authorization"));
  return Response.json(
    conSesion ? resumen : { ...resumen, errores: resumen.errores.length },
  );
}
