// Edge Function: detecta stock bajo y lotes próximos a caducar; deja avisos en audit_log.
// Invocada nocturnamente por pg_cron. Usa service_role para recorrer todas las clínicas.
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (_req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Stock bajo: current_stock <= min_stock (filtramos en cliente por simplicidad).
  const { data: items } = await supabase
    .from("inventory_items")
    .select("id, clinic_id, name, min_stock, current_stock");
  const low = (items ?? []).filter((i) => Number(i.current_stock) <= Number(i.min_stock));

  // Caducidad dentro de 90 días.
  const limit = new Date();
  limit.setDate(limit.getDate() + 90);
  const { data: expiring } = await supabase
    .from("inventory_batches")
    .select("id, clinic_id, lot, expiry_date")
    .lte("expiry_date", limit.toISOString().slice(0, 10));

  const rows = [
    ...low.map((i) => ({
      clinic_id: i.clinic_id, action: "low_stock", entity: "inventory_items",
      entity_id: i.id, diff: { name: i.name, current: i.current_stock, min: i.min_stock },
    })),
    ...(expiring ?? []).map((b) => ({
      clinic_id: b.clinic_id, action: "expiring_batch", entity: "inventory_batches",
      entity_id: b.id, diff: { lot: b.lot, expiry_date: b.expiry_date },
    })),
  ];

  if (rows.length) await supabase.from("audit_log").insert(rows);

  return new Response(JSON.stringify({ low: low.length, expiring: expiring?.length ?? 0 }), {
    headers: { "content-type": "application/json" },
  });
});
