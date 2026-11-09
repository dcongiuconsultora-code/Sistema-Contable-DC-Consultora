import { randomInt } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// El estudio le crea (o le renueva) la contraseña a un usuario de un cliente invitado.
// Necesita SUPABASE_SERVICE_ROLE_KEY en las variables del servidor; nunca llega al navegador.

const LETRAS = "abcdefghjkmnpqrstuvwxyz";
const NUMEROS = "23456789";

/** Contraseña fácil de dictar: tres grupos, por ejemplo "kmt-48r-pqe". */
function claveNueva() {
  const grupo = () =>
    Array.from(
      { length: 3 },
      (_, i) =>
        (i === 1 ? NUMEROS : LETRAS)[
          randomInt(i === 1 ? NUMEROS.length : LETRAS.length)
        ],
    ).join("");
  return `${grupo()}-${grupo()}-${grupo()}-${grupo()}`;
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servicio = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !servicio)
    return Response.json(
      {
        error:
          "El servidor no tiene configurado el acceso para crear usuarios.",
      },
      { status: 500 },
    );
  const admin = createClient(url, servicio, {
    auth: { persistSession: false },
  });

  // Solo el estudio: se verifica la sesión de quien llama.
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token)
    return Response.json({ error: "Falta iniciar sesión." }, { status: 401 });
  const { data: quien, error: errorSesion } = await admin.auth.getUser(token);
  if (errorSesion || !quien.user)
    return Response.json({ error: "La sesión no es válida." }, { status: 401 });
  const { data: perfil } = await admin
    .from("perfiles")
    .select("rol")
    .eq("usuario_id", quien.user.id)
    .maybeSingle();
  if (perfil?.rol !== "estudio")
    return Response.json(
      { error: "Solo el estudio puede crear contraseñas." },
      { status: 403 },
    );

  const { email } = (await request.json().catch(() => ({}))) as {
    email?: string;
  };
  const mail = email?.trim().toLowerCase();
  if (!mail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail))
    return Response.json(
      { error: "Ese mail no parece válido." },
      { status: 400 },
    );

  // Solo para mails que el estudio ya invitó a alguna empresa.
  const { data: invitacion } = await admin
    .from("invitaciones")
    .select("email")
    .eq("email", mail)
    .limit(1)
    .maybeSingle();
  if (!invitacion)
    return Response.json(
      { error: "Primero dale acceso a una empresa con ese mail." },
      { status: 400 },
    );

  const clave = claveNueva();
  const { data: existentes, error: errorLista } = await admin.rpc(
    "usuario_por_email",
    {
      buscado: mail,
    },
  );
  if (errorLista)
    return Response.json(
      { error: `No se pudo buscar el usuario: ${errorLista.message}` },
      { status: 500 },
    );
  const existente = (existentes as { id: string }[] | null)?.[0];
  const { error } = existente
    ? // Si había pedido un link y no lo abrió, el mail quedó sin confirmar y no podría entrar.
      await admin.auth.admin.updateUserById(existente.id, {
        password: clave,
        email_confirm: true,
      })
    : await admin.auth.admin.createUser({
        email: mail,
        password: clave,
        email_confirm: true,
      });
  if (error)
    return Response.json(
      { error: `No se pudo guardar la contraseña: ${error.message}` },
      { status: 500 },
    );
  return Response.json({ clave, nuevo: !existente });
}
