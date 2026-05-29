import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { NewAppointmentForm } from "@/components/agenda/NewAppointmentForm";
import { StatusSelect } from "@/components/agenda/StatusSelect";
import { DayNav } from "@/components/agenda/DayNav";
import { RealtimeAppointments } from "@/components/agenda/RealtimeAppointments";

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; dentist?: string }>;
}) {
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayISO();
  const dentistId = sp.dentist ?? "";

  // Rango [00:00, 24:00) del día seleccionado.
  const dayStart = new Date(date + "T00:00:00");
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);

  const supabase = await createClient();
  const profile = await getProfile();
  const writable = can(profile?.role, "appointments:write");

  let apptQuery = supabase
    .from("appointments")
    .select("id, starts_at, status, reason, dentist_id, patients(full_name), profiles(full_name), operatories(name)")
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString())
    .order("starts_at", { ascending: true });
  if (dentistId) apptQuery = apptQuery.eq("dentist_id", dentistId);

  const [{ data: appts }, { data: patients }, { data: dentists }, { data: operatories }] =
    await Promise.all([
      apptQuery,
      supabase.from("patients").select("id, full_name").order("full_name"),
      supabase
        .from("profiles")
        .select("id, full_name")
        .in("role", ["odontologo_general", "especialista"])
        .order("full_name"),
      supabase.from("operatories").select("id, name").order("name"),
    ]);

  return (
    <div className="space-y-6">
      {/* Refresca el tablero en vivo ante cualquier cambio de citas. */}
      <RealtimeAppointments />

      <h1 className="text-2xl font-bold">Agenda</h1>

      <DayNav date={date} dentistId={dentistId} dentists={dentists ?? []} />

      {writable && (
        <NewAppointmentForm
          patients={patients ?? []}
          dentists={dentists ?? []}
          operatories={operatories ?? []}
        />
      )}

      {!appts?.length ? (
        <p className="text-slate-500">Sin citas para este día.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2">Hora</th>
              <th>Paciente</th>
              <th>Odontólogo</th>
              <th>Sillón</th>
              <th>Motivo</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {appts.map((a) => {
              const patient = a.patients as { full_name?: string } | null;
              const dentist = a.profiles as { full_name?: string } | null;
              const op = a.operatories as { name?: string } | null;
              return (
                <tr key={a.id}>
                  <td className="py-2 tabular-nums">
                    {new Date(a.starts_at).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}
                  </td>
                  <td>{patient?.full_name ?? "—"}</td>
                  <td>{dentist?.full_name ?? "—"}</td>
                  <td>{op?.name ?? "—"}</td>
                  <td className="text-slate-500">{a.reason ?? "—"}</td>
                  <td>
                    <StatusSelect id={a.id} status={a.status} disabled={!writable} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
