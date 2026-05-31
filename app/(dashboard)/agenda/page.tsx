import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { AgendaCalendar } from "@/components/agenda/AgendaCalendar";
import { RealtimeAppointments } from "@/components/agenda/RealtimeAppointments";
import { requireFeature } from "@/lib/guard";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  await requireFeature("agenda");
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayISO();

  // Rango del mes visible [primer día, primer día del mes siguiente).
  const base = new Date(date + "T00:00:00");
  const monthStart = new Date(base.getFullYear(), base.getMonth(), 1);
  const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 1);

  const supabase = await createClient();
  const profile = await getProfile();
  const writable = can(profile?.role, "appointments:write");

  const [{ data: appts }, { data: patients }] = await Promise.all([
    supabase
      .from("appointments")
      .select(
        "id, starts_at, ends_at, status, dentist_name, patient_name, patient_id, reason, consult_price, deposit, deposit_method, patients(full_name, national_id)",
      )
      .gte("starts_at", monthStart.toISOString())
      .lt("starts_at", monthEnd.toISOString())
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true }),
    supabase.from("patients").select("id, full_name, national_id").order("full_name"),
  ]);

  return (
    <div className="space-y-6">
      {/* Refresca el calendario en vivo ante cualquier cambio de citas. */}
      <RealtimeAppointments />

      <h1 className="text-2xl font-bold">Agenda</h1>

      <AgendaCalendar
        patients={patients ?? []}
        appts={(appts as never) ?? []}
        month={date}
        canWrite={writable}
      />
    </div>
  );
}
