import { redirect } from "next/navigation";
import { Building2, CheckCircle2, PauseCircle, Users } from "lucide-react";
import { isPlatformAdmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { FEATURES, normalizeFeatures } from "@/lib/features";
import { NewClinicForm } from "@/components/superadmin/NewClinicForm";
import { ClinicList, type ClinicRow } from "@/components/superadmin/ClinicList";
import type { ClinicUser } from "@/components/superadmin/ClinicUsers";

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
    .select("id, name, plan, features, active, max_users, created_at");
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

  // Excluir platform admins en modo vista previa del listado de usuarios de la clínica
  const { data: platformAdmins } = await admin
    .from("platform_admins")
    .select("user_id");
  const platformAdminIds = new Set((platformAdmins ?? []).map((p) => p.user_id));

  const usersByClinic = new Map<string, ClinicUser[]>();
  for (const p of profiles ?? []) {
    if (platformAdminIds.has(p.id)) continue;
    const email = emailMap.get(p.id) ?? "";
    const list = usersByClinic.get(p.clinic_id) ?? [];
    list.push({ id: p.id, full_name: p.full_name, role: p.role, email });
    usersByClinic.set(p.clinic_id, list);
  }

  const modules = FEATURES.filter((f) => !f.core && !f.optIn).map((f) => ({
    key: f.key,
    label: f.label,
  }));
  const addons = FEATURES.filter((f) => !f.core && f.optIn).map((f) => ({
    key: f.key,
    label: f.label,
  }));

  const rows: ClinicRow[] = (clinics ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    plan: c.plan,
    features: normalizeFeatures(c.features),
    active: c.active !== false,
    max_users: c.max_users ?? 10,
    created_at: c.created_at,
    users: usersByClinic.get(c.id) ?? [],
  }));

  const total = rows.length;
  const activeCount = rows.filter((c) => c.active).length;
  const suspendedCount = total - activeCount;
  const totalUsers = rows.reduce((sum, c) => sum + c.users.length, 0);

  const stats = [
    { label: "Clínicas", value: total, icon: Building2, tone: "text-clinic-fg bg-clinic/10" },
    { label: "Activas", value: activeCount, icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10" },
    { label: "Suspendidas", value: suspendedCount, icon: PauseCircle, tone: "text-amber-600 bg-amber-50 dark:bg-amber-500/10" },
    { label: "Usuarios", value: totalUsers, icon: Users, tone: "text-slate-600 bg-slate-100" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Panel de plataforma</h1>
        <p className="text-sm text-slate-500">
          Gestión de clínicas, módulos y planes. Operas TODAS las clínicas; los
          clientes solo ven la suya.
        </p>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm ring-1 ring-slate-200"
          >
            <span className={`flex h-10 w-10 items-center justify-center rounded-lg ${s.tone}`}>
              <s.icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="text-2xl font-bold leading-none">{s.value}</div>
              <div className="mt-1 truncate text-xs text-slate-500">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Nueva clínica (colapsable) */}
      <details className="group rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-6 [&::-webkit-details-marker]:hidden">
          <h2 className="text-lg font-semibold">Nueva clínica</h2>
          <span className="rounded-full bg-clinic px-3 py-1 text-xs font-medium text-white transition group-open:bg-slate-100 group-open:text-slate-500">
            <span className="group-open:hidden">+ Crear clínica</span>
            <span className="hidden group-open:inline">Cerrar</span>
          </span>
        </summary>
        <div className="border-t border-slate-100 p-6 pt-5">
          <NewClinicForm />
        </div>
      </details>

      <ClinicList
        clinics={rows}
        modules={modules}
        addons={addons}
        sort={sort}
        sorts={SORTS}
      />
    </div>
  );
}
