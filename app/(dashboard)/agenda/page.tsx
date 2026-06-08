import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { AgendaShell, type AgendaView } from "@/components/agenda/AgendaShell";
import { RealtimeAppointments } from "@/components/agenda/RealtimeAppointments";
import { requireFeature } from "@/lib/guard";
import { boliviaTodayISO } from "@/lib/format";
import { gridRange } from "@/lib/agenda";

const isView = (v: string | undefined): v is AgendaView =>
  v === "day" || v === "week" || v === "month";

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; view?: string }>;
}) {
  await requireFeature("agenda");
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : boliviaTodayISO();
  const view: AgendaView = isView(sp.view) ? sp.view : "month";

  // Rango = grilla de 6 semanas del mes visible, así la vista Semana en el borde
  // de mes no queda vacía.
  const { start, end } = gridRange(new Date(date + "T00:00:00"));

  const supabase = await createClient();
  const profile = await getProfile();
  const writable = can(profile?.role, "appointments:write");

  const [{ data: appts }, { data: patients }, { data: doctors }] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, starts_at, ends_at, status, dentist_name, patient_name, patient_id, reason, consult_price, deposit, deposit_method, patients(full_name, national_id)",
      )
      .gte("starts_at", start.toISOString())
      .lt("starts_at", end.toISOString())
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true }),
    supabase.from("patients").select("id, full_name, national_id").order("full_name"),
    supabase.from("doctors").select("id, full_name").eq("active", true).order("full_name"),
  ]);

  return (
    <div className="space-y-6">
      <RealtimeAppointments />
      <h1 className="text-2xl font-bold">Agenda</h1>
      <AgendaShell
        patients={patients ?? []}
        appts={(appts as never) ?? []}
        date={date}
        view={view}
        canWrite={writable}
        doctors={doctors ?? []}
      />
    </div>
  );
}
