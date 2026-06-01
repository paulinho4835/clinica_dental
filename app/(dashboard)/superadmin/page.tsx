import { redirect } from "next/navigation";
import { isPlatformAdmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { FEATURES, normalizeFeatures } from "@/lib/features";
import { NewClinicForm } from "@/components/superadmin/NewClinicForm";
import { FeatureToggle } from "@/components/superadmin/FeatureToggle";
import { PlanSelect } from "@/components/superadmin/PlanSelect";

export default async function SuperadminPage() {
  if (!(await isPlatformAdmin())) redirect("/agenda");

  const admin = createAdminClient();
  // Orden estable y predecible: por nombre, con id como desempate. Evita que
  // la lista "salte" al refrescar (created_at empata entre clínicas sembradas
  // a la vez y Postgres no garantiza orden ante empate).
  const { data: clinics } = await admin
    .from("clinics")
    .select("id, name, plan, features, created_at")
    .order("name", { ascending: true })
    .order("id", { ascending: true });

  // Conteo de usuarios por clínica (para mostrar tamaño).
  const { data: profiles } = await admin.from("profiles").select("clinic_id");
  const userCount = new Map<string, number>();
  for (const p of profiles ?? []) {
    userCount.set(p.clinic_id, (userCount.get(p.clinic_id) ?? 0) + 1);
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
          return (
            <div
              key={c.id}
              className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-semibold text-clinic-fg">{c.name}</div>
                  <div className="text-xs text-slate-500">
                    {userCount.get(c.id) ?? 0} usuario(s)
                  </div>
                </div>
                <PlanSelect clinicId={c.id} plan={c.plan} />
              </div>
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
            </div>
          );
        })}
      </section>
    </div>
  );
}
