// Envío de mails desde el servidor con la cuenta de Gmail del estudio (contraseña de aplicación).
// Las credenciales van solo en las variables de entorno de Vercel: GMAIL_USUARIO y
// GMAIL_CLAVE_APLICACION.

export function correoConfigurado() {
  return Boolean(
    process.env.GMAIL_USUARIO && process.env.GMAIL_CLAVE_APLICACION,
  );
}

function escapar(t: string) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** El mismo texto, con el encabezado del estudio, para que el mail se vea prolijo. */
export function htmlDeTexto(asunto: string, texto: string) {
  const parrafos = escapar(texto)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Arial,Helvetica,sans-serif;background:#f6f4f1;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e7e5e4">
    <div style="background:#591101;color:#fff;padding:18px 24px">
      <div style="font-size:18px;font-weight:bold">DC Consultora</div>
      <div style="font-size:13px;opacity:.8">${escapar(asunto)}</div>
    </div>
    <div style="padding:22px 24px;color:#1c1917;font-size:15px;line-height:1.5">${parrafos}</div>
  </div>
</div>`;
}

/** Manda el mail; false si no está configurado o no hay destinatarios. */
export async function mandarMail(
  para: string[],
  asunto: string,
  texto: string,
) {
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
    html: htmlDeTexto(asunto, texto),
  });
  return true;
}
