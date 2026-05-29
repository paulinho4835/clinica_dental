import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { NewAppointmentForm } from "@/components/agenda/NewAppointmentForm";
import { StatusSelect } from "@/components/agenda/StatusSelect";

export default async function AgendaPage() {
  const supabase = await createClient();
  const profile = await getProfile();
  const writable = can(profile?.role, "appointments:write");

  const [{ data: appts }, { data: patients }, { data: dentists }, { data: operatories }] =
    await Promise.all([
      supabase
        .from("appointments")
        .select("id, starts_at, status, reason, patients(full_name), profiles(full_name), operatories(name)")
        .order("starts_at", { ascending: true }),
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
      <h1 className="text-2xl font-bold">Agenda</h1>

      {writable && (
        <NewAppointmentForm
          patients={patients ?? []}
          dentists={dentists ?? []}
          operatories={operatories ?? []}
        />
      )}

      {!appts?.length ? (
        <p className="text-slate-500">Sin citas. (Crea citas para verlas aquí.)</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="py-2">Hora</th>
              <th>Paciente</th>
              <th>Odontólogo</th>
              <th>Sillón</th>
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
                    {new Date(a.starts_at).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })}
                  </td>
                  <td>{patient?.full_name ?? "—"}</td>
                  <td>{dentist?.full_name ?? "—"}</td>
                  <td>{op?.name ?? "—"}</td>
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
