import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { correoConfigurado, mandarMail } from "@/lib/servidor/mail";

// El estudio le manda un mail a un cliente (al mail de contacto de la ficha y a los usuarios con
// acceso). El aviso queda también en los mensajes de la app.

function clienteAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !servicio) return null;
  return createClient(url, servicio, { auth: { persistSession: false } });
}

async function esEstudio(request: Request, admin: SupabaseClient) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return false;
  const { data } = await admin.auth.getUser(token);
  if (!data.user) return false;
  const { data: perfil } = await admin
    .from("perfiles")
    .select("rol")
    .eq("usuario_id", data.user.id)
    .maybeSingle();
  return perfil?.rol === "estudio";
}

/** Si el envío de mails está configurado (sin decir con qué cuenta). */
export async function GET(request: Request) {
  const admin = clienteAdmin();
  if (!admin || !(await esEstudio(request, admin)))
    return Response.json({ error: "No autorizado." }, { status: 401 });
  return Response.json({ configurado: correoConfigurado() });
}

export async function POST(request: Request) {
  const admin = clienteAdmin();
  if (!admin)
    return Response.json(
      { error: "Falta configurar el servidor." },
      { status: 500 },
    );
  if (!(await esEstudio(request, admin)))
    return Response.json({ error: "No autorizado." }, { status: 401 });
  if (!correoConfigurado())
    return Response.json(
      {
        error:
          "Falta configurar el mail del estudio (GMAIL_USUARIO y GMAIL_CLAVE_APLICACION en Vercel).",
      },
      { status: 400 },
    );
  const cuerpo = (await request.json().catch(() => null)) as {
    empresaId?: string;
    asunto?: string;
    texto?: string;
  } | null;
  if (!cuerpo?.empresaId || !cuerpo.asunto?.trim() || !cuerpo.texto?.trim())
    return Response.json({ error: "Faltan datos del mail." }, { status: 400 });
  const [empresa, invitados] = await Promise.all([
    admin
      .from("empresas")
      .select("email_contacto")
      .eq("id", cuerpo.empresaId)
      .maybeSingle(),
    admin
      .from("invitaciones")
      .select("email")
      .eq("empresa_id", cuerpo.empresaId),
  ]);
  const para = [
    ...new Set(
      [
        empresa.data?.email_contacto,
        ...(invitados.data ?? []).map((i) => i.email),
      ]
        .filter((m): m is string => Boolean(m && /@/.test(m)))
        .map((m) => m.trim().toLowerCase()),
    ),
  ];
  if (!para.length)
    return Response.json(
      { error: "El cliente no tiene mail cargado: agregalo en su ficha." },
      { status: 400 },
    );
  try {
    await mandarMail(para, cuerpo.asunto.trim(), cuerpo.texto.trim());
  } catch (e) {
    return Response.json(
      {
        error: `No se pudo mandar el mail: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 502 },
    );
  }
  await admin.from("mensajes").insert({
    empresa_id: cuerpo.empresaId,
    asunto: cuerpo.asunto.trim(),
    texto: cuerpo.texto.trim(),
  });
  return Response.json({ enviado: true, para });
}
