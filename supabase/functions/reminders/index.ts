// Edge Function: envía recordatorios de cita pendientes cuya hora ya llegó.
// Invocada por pg_cron (ver migración 0005). Usa service_role para saltar RLS.
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const now = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("appointment_reminders")
    .select("id, channel, appointment_id, appointments(starts_at, patients(full_name, phone))")
    .eq("status", "pending")
    .lte("scheduled_for", now)
    .limit(100);

  if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });

  let sent = 0;
  for (const r of due ?? []) {
    // TODO: integrar proveedor real (WhatsApp/SMS/email). Aquí solo marcamos enviado.
    const ok = await dispatchReminder(r);
    if (ok) {
      await supabase
        .from("appointment_reminders")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", r.id);
      sent++;
    }
  }

  return new Response(JSON.stringify({ processed: due?.length ?? 0, sent }), {
    headers: { "content-type": "application/json" },
  });
});

// deno-lint-ignore no-explicit-any
async function dispatchReminder(_r: any): Promise<boolean> {
  // Placeholder: integrar Twilio / WhatsApp Cloud API / Resend.
  return true;
}
