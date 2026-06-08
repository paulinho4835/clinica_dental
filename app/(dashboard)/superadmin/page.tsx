import Link from "next/link";
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
import { SuspendClinicButton } from "@/components/superadmin/SuspendClinicButton";

const SORTS = [
  { key: "recientes", label: "Más recientes" },
  { key: "antiguas", label: "Más antiguas" },
  { key: "nombre", label: "Nombre (A-Z)" },
] as const;

type SortKey = (typeof SORTS)[number]["key"];

export default async function SuperadminPage({
  searchParams,
}: {
  searchParams: Promise<{ sort?: string }>;
}) {
  if (!(await isPlatformAdmin())) redirect("/agenda");

  const sortParam = (await searchParams).sort;
  const sort: SortKey = SORTS.some((s) => s.key === sortParam)
    ? (sortParam as SortKey)
    : "recientes";

  const admin = createAdminClient();

  let query = admin
    .from("clinics")
    .select("id, name, plan, features, active, created_at");
  if (sort === "antiguas") query = query.order("created_at", { ascending: true });
  else if (sort === "nombre") query = query.order("name", { ascending: true });
  else query = query.order("created_at", { ascending: false }); // recientes

  const { data: clinics } = await query;

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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Clínicas ({clinics?.length ?? 0})
          </h2>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Ordenar:</span>
            {SORTS.map((s) => (
              <Link
                key={s.key}
                href={`/superadmin?sort=${s.key}`}
                scroll={false}
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  sort === s.key
                    ? "bg-clinic text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {s.label}
              </Link>
            ))}
          </div>
        </div>

        {clinics?.map((c) => {
          const features = normalizeFeatures(c.features);
          const users = usersByClinic.get(c.id) ?? [];
          const active = c.active !== false;
          return (
            <div
              key={c.id}
              className={`rounded-lg bg-white p-5 shadow-sm ring-1 ${
                active ? "ring-slate-200" : "ring-amber-300"
              }`}
            >
              {/* Encabezado */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <EditClinicName clinicId={c.id} name={c.name} />
                    {!active && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                        Suspendida
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {users.length} usuario{users.length !== 1 ? "s" : ""}
                    {" · "}
                    {new Date(c.created_at).toLocaleDateString("es-BO")}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <PlanSelect clinicId={c.id} plan={c.plan} />
                  <SuspendClinicButton
                    clinicId={c.id}
                    clinicName={c.name}
                    active={active}
                  />
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
