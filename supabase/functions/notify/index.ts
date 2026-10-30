// Deploy with verify_jwt=false. This endpoint instead requires an independent worker secret.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
const env = (key: string) => Deno.env.get(key) || "";
const hash = async (text: string) =>
  new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
async function authorized(value: string) {
  const secret = env("NOTIFY_SECRET");
  if (secret.length < 32) return false;
  const [a, b] = await Promise.all([hash(value), hash(secret)]);
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}
type Job = {
  id: string;
  lease: string;
  kind: string;
  order_id: string;
  email: string;
  event_title: string;
  link_token: string;
  email_sent: boolean;
  telegram_sent: boolean;
};
Deno.serve(async (request) => {
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  if (!(await authorized(request.headers.get("x-notify-secret") || "")))
    return new Response("Unauthorized", { status: 401 });
  const site = env("SITE_URL").replace(/\/$/, ""),
    mailkey = env("MAILJET_API_KEY"),
    mailsecret = env("MAILJET_SECRET_KEY"),
    from = env("MAIL_FROM") || "notificaciones@onesecurezone.com";
  if (!site.startsWith("https://") || !mailkey || !mailsecret || !from)
    return new Response("Worker configuration incomplete", { status: 503 });
  const client = createClient(
    env("SUPABASE_URL"),
    env("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } },
  );
  const { data, error } = await client.rpc("claim_notifications");
  if (error) return new Response("Could not claim jobs", { status: 500 });
  let completed = 0,
    failed = 0;
  for (const job of (data || []) as Job[]) {
    try {
      const subject =
        job.kind === "approved"
          ? "Tu entrada está lista"
          : job.kind === "rejected"
            ? "Revisa el estado de tu pago"
            : "Recibimos tu comprobante";
      if (!job.email_sent) {
        const link = `${site}/ticket#${job.link_token}`;
        const escape = (value: string) =>
          value.replace(
            /[&<>"']/g,
            (c) =>
              ({
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#39;",
              })[c]!,
          );
        const detail =
          job.kind === "approved"
            ? "Tu pago fue validado y tu entrada está lista para descargar."
            : job.kind === "rejected"
              ? "Consulta el motivo de la revisión en tu entrada."
              : "Estamos revisando tu comprobante. No necesitas registrarte para consultar tu entrada.";
        const html = `<!doctype html><html lang="es"><body style="margin:0;background:#0b0911;color:#f5f2ff;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:40px 16px"><table role="presentation" width="520" style="max-width:100%;background:#171120;border:1px solid #3a274e;border-radius:18px" cellpadding="32"><tr><td align="center"><div style="font-size:42px;font-weight:900;color:#fff">osz <span style="font-size:14px;letter-spacing:4px;color:#d8afff">EVENTS</span></div><p style="color:#cda3ff">${escape(job.event_title)}</p><h1 style="font-size:28px;color:#fff">${subject}</h1><p style="color:#c7bdd3;line-height:1.7">${detail}</p><p style="margin:36px 0"><a href="${escape(link)}" style="display:inline-block;background:#873dd0;color:#fff;text-decoration:none;padding:18px 26px;border-radius:10px;font-weight:bold">VER MI ENTRADA DIGITAL</a></p><p style="font-size:12px;color:#b8a6cb;line-height:1.7">No compartas este enlace ni tu QR. Tu entrada es personal y de un único ingreso. El registro es opcional.</p></td></tr></table></td></tr></table></body></html>`;
        const response = await fetch("https://api.mailjet.com/v3.1/send", {
          method: "POST",
          signal: AbortSignal.timeout(15000),
          headers: {
            Authorization: `Basic ${btoa(`${mailkey}:${mailsecret}`)}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            Messages: [
              {
                From: { Email: from, Name: "OSZ Events" },
                To: [{ Email: job.email }],
                Subject: `OSZ Events · ${subject}`,
                TextPart: `${subject}\n${job.event_title}\n${detail}\n${link}\nNo compartas el enlace ni tu QR.`,
                HTMLPart: html,
                TrackClicks: "disabled",
                TrackOpens: "disabled",
                CustomID: `osz-${job.id}`,
              },
            ],
          }),
        });
        const sent = await response.json();
        if (!response.ok || sent.Messages?.[0]?.Status !== "success")
          throw new Error("Mail provider error");
        const ack = await client.rpc("ack_notification", {
          p_id: job.id,
          p_lease: job.lease,
          p_channel: "email",
        });
        if (ack.error) throw ack.error;
      }
      if (!job.telegram_sent) {
        const token = env("TELEGRAM_BOT_TOKEN"),
          chat = env("TELEGRAM_CHAT_ID");
        // Optional notifications contain no voucher, DNI or bearer QR. Approvals remain inside the MFA-protected app.
        if (token && chat && job.kind === "payment_submitted") {
          const response = await fetch(
            `https://api.telegram.org/bot${token}/sendMessage`,
            {
              method: "POST",
              signal: AbortSignal.timeout(15000),
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: chat,
                text: `OSZ Events: comprobante pendiente\n${job.event_title}\nRevisar con MFA: ${site}/manage`,
                link_preview_options: { is_disabled: true },
              }),
            },
          );
          const result = await response.json();
          if (!response.ok || !result.ok)
            throw new Error("Telegram provider error");
        }
        const ack = await client.rpc("ack_notification", {
          p_id: job.id,
          p_lease: job.lease,
          p_channel: "telegram",
        });
        if (ack.error) throw ack.error;
      }
      completed++;
    } catch {
      failed++;
    } // Never log tokens, email addresses or payment information.
  }
  return Response.json({ completed, failed });
});
