import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { DoctorsPanel, type Doctor } from "@/components/ajustes/DoctorsPanel";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  recepcionista: "Recepcionista",
  odontologo_general: "Odontólogo general",
  especialista: "Especialista",
  asistente: "Asistente",
};

export default async function SettingsPage() {
  const supabase = await createClient();
  const profile = await getProfile();
  const canWrite = can(profile?.role, "settings:write");

  const [{ data: members }, { data: doctors }] = await Promise.all([
    supabase.from("profiles").select("full_name, role").order("full_name"),
    supabase.from("doctors").select("id, full_name, specialty, active").order("full_name"),
  ]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Ajustes</h1>

      {/* Usuarios del sistema */}
      <section>
        <h2 className="mb-2 text-lg font-semibold">Usuarios y roles</h2>
        <p className="mb-3 text-sm text-slate-500">
          Solo el rol <strong>admin</strong> puede crear o modificar usuarios (RLS lo aplica en la DB).
        </p>
        <div className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          {members?.map((m, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-3 text-sm">
              <span className="font-medium">{m.full_name}</span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {ROLE_LABEL[m.role] ?? m.role}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Doctores de la clínica */}
      <section>
        <h2 className="mb-1 text-lg font-semibold">Doctores</h2>
        <p className="mb-3 text-sm text-slate-500">
          Lista de doctores disponibles para asignar en el plan de tratamiento.
          No requieren cuenta de usuario en el sistema.
        </p>
        <DoctorsPanel doctors={(doctors ?? []) as Doctor[]} canWrite={canWrite} />
      </section>
    </div>
  );
}
