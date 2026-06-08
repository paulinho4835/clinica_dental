import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { DoctorsPanel, type Doctor } from "@/components/ajustes/DoctorsPanel";

export default async function SettingsPage() {
  const supabase = await createClient();
  const profile = await getProfile();
  const canWrite = can(profile?.role, "settings:write");

  const { data: doctors } = await supabase
    .from("doctors")
    .select("id, full_name, specialty, active")
    .order("full_name");

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Registro de Doctores</h1>

      <section>
        <p className="mb-3 text-sm text-slate-500">
          Lista de doctores disponibles para asignar en citas, planes de tratamiento y pagos.
        </p>
        <DoctorsPanel doctors={(doctors ?? []) as Doctor[]} canWrite={canWrite} />
      </section>
    </div>
  );
}
