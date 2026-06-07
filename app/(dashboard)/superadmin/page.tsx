import { redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { FEATURES, normalizeFeatures } from "@/lib/features";
import { NewClinicForm } from "@/components/superadmin/NewClinicForm";
import { FeatureToggle } from "@/components/superadmin/FeatureToggle";
import { PlanSelect } from "@/components/superadmin/PlanSelect";
import { ClinicUsers, type ClinicUser } from "@/components/superadmin/ClinicUsers";
import { AddUserForm } from "@/components/superadmin/AddUserForm";
import { EditClinicName } from "@/components/superadmin/EditClinicName";
import { DeleteClinicButton } from "@/components/superadmin/DeleteClinicButton";

export default async function SuperadminPage() {
  if (!(await isPlatformAdmin())) redirect("/agenda");

  const admin = createAdminClient();

  const { data: clinics } = await admin
    .from("clinics")
    .select("id, name, plan, features, created_at")
    .order("name", { ascending: true })
    .order("id", { ascending: true });

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, clinic_id, full_name, role");

  // Emails desde auth.users (service_role tiene acceso completo)
  const emailMap = new Map<string, string>();
  const { data: authList } = await admin.auth.admin.listUsers({ perPage: 1000 });
  for (const u of authList?.users ?? []) {
    emailMap.set(u.id, u.email ?? "");
  }

  // Agrupar usuarios por clínica
  const usersByClinic = new Map<string, ClinicUser[]>();
  for (const p of profiles ?? []) {
    const list = usersByClinic.get(p.clinic_id) ?? [];
    list.push({
      id: p.id,
      full_name: p.full_name,
      role: p.role,
      email: emailMap.get(p.id) ?? "",
    });
    usersByClinic.set(p.clinic_id, list);
  }

  const toggleable = FEATURES.filter((f) => !f.core);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Panel de plataforma</h1>
        <p className="text-sm text-slate-500">
          Gestión de clínicas, módulos y planes. Operas TODAS las clínicas; los
          clientes solo ven la suya.
        </p>
      </div>

      <section className="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <h2 className="mb-4 text-lg font-semibold">Nueva clínica</h2>
        <NewClinicForm />
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">
          Clínicas ({clinics?.length ?? 0})
        </h2>

        {clinics?.map((c) => {
          const features = normalizeFeatures(c.features);
          const users = usersByClinic.get(c.id) ?? [];
          return (
            <div
              key={c.id}
              className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200"
            >
              {/* Encabezado */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <EditClinicName clinicId={c.id} name={c.name} />
                  <div className="mt-0.5 text-xs text-slate-500">
                    {users.length} usuario{users.length !== 1 ? "s" : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <PlanSelect clinicId={c.id} plan={c.plan} />
                  <DeleteClinicButton clinicId={c.id} clinicName={c.name} />
                </div>
              </div>

              {/* Módulos */}
              <div className="mt-4 flex flex-wrap gap-2">
                {toggleable.map((f) => (
                  <FeatureToggle
                    key={f.key}
                    clinicId={c.id}
                    featureKey={f.key}
                    label={f.label}
                    enabled={features[f.key]}
                  />
                ))}
              </div>

              {/* Usuarios */}
              <div className="mt-4 border-t border-slate-100 pt-4">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  Usuarios
                </h3>
                <ClinicUsers users={users} />
                <AddUserForm clinicId={c.id} />
              </div>
            </div>
          );
        })}

        {!clinics?.length && (
          <p className="text-sm text-slate-500">
            Sin clínicas registradas aún.
          </p>
        )}
      </section>
    </div>
  );
}
