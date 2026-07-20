import { redirect } from "next/navigation";
import { Building2, CheckCircle2, PauseCircle, Users, Camera, Database, HardDrive, AlertTriangle, DatabaseBackup } from "lucide-react";
import { isPlatformAdmin } from "@/lib/superadmin";
import { createAdminClient } from "@/lib/supabase/admin";
import { FEATURES, normalizeFeatures, photoQuota } from "@/lib/features";
import {
  getSupabaseStorageStats,
  formatBytes,
  usageLevel,
  type UsageLevel,
  SUPABASE_FREE_DB_BYTES,
  SUPABASE_FREE_STORAGE_BYTES,
  R2_FREE_PHOTO_BYTES,
} from "@/lib/storage";
import { NewClinicForm } from "@/components/superadmin/NewClinicForm";
import { R2RestoreButton } from "@/components/superadmin/R2RestoreButton";
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

  let clinicsQuery = admin
    .from("clinics")
    .select("id, name, plan, features, active, max_users, max_patients, created_at, settings");
  if (sort === "antiguas") clinicsQuery = clinicsQuery.order("created_at", { ascending: true });
  else if (sort === "nombre") clinicsQuery = clinicsQuery.order("name", { ascending: true });
  else clinicsQuery = clinicsQuery.order("created_at", { ascending: false }); // recientes

  // Todas estas lecturas son independientes entre sí → en paralelo para no
  // encadenar ~7 viajes a la base (antes corrían en secuencia, una por await).
  // Las que tocan tablas/funciones que podrían no existir aún en prod (storage
  // stats, backup_runs) resuelven con error suave, no rechazan el Promise.all.
  const [
    { data: clinics },
    { data: profiles },
    { data: authList },
    { data: platformAdmins },
    { data: allPhotos },
    { data: allPatients },
    supaStats,
    { data: backupRows },
  ] = await Promise.all([
    clinicsQuery,
    admin.from("profiles").select("id, clinic_id, full_name, role, active"),
    admin.auth.admin.listUsers({ perPage: 1000 }),
    admin.from("platform_admins").select("user_id"),
    admin.from("patient_photos").select("clinic_id, size_bytes"),
    admin.from("patients").select("clinic_id"),
    getSupabaseStorageStats(),
    admin
      .from("backup_runs")
      .select("clinic_id, status, size_bytes, created_at, storage_key")
      .order("created_at", { ascending: false }),
  ]);

  // Emails desde auth.users (service_role tiene acceso completo)
  const emailMap = new Map<string, string>();
  for (const u of authList?.users ?? []) {
    emailMap.set(u.id, u.email ?? "");
  }

  // Excluir platform admins en modo vista previa del listado de usuarios de la clínica
  const platformAdminIds = new Set((platformAdmins ?? []).map((p) => p.user_id));

  const usersByClinic = new Map<string, ClinicUser[]>();
  for (const p of profiles ?? []) {
    if (platformAdminIds.has(p.id)) continue;
    const email = emailMap.get(p.id) ?? "";
    const list = usersByClinic.get(p.clinic_id) ?? [];
    list.push({
      id: p.id,
      full_name: p.full_name,
      role: p.role,
      email,
      active: (p as { active?: boolean }).active ?? true,
    });
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

  // Contador real de fotos por clínica + almacenamiento total de la plataforma.
  // Una sola consulta (clinic_id, size_bytes) para no hacer N queries; el
  // superadmin ve el contador de cada clínica y el total contra el free tier.
  const photoCounts = new Map<string, number>();
  let totalPhotoBytes = 0;
  let totalPhotos = 0;
  for (const ph of allPhotos ?? []) {
    const cid = ph.clinic_id as string;
    photoCounts.set(cid, (photoCounts.get(cid) ?? 0) + 1);
    totalPhotoBytes += Number(ph.size_bytes) || 0;
    totalPhotos += 1;
  }
  const totalPhotoGB = totalPhotoBytes / 1024 ** 3;

  // Conteo real de pacientes por clínica, para el tope de upsell.
  const patientCounts = new Map<string, number>();
  for (const p of allPatients ?? []) {
    const cid = p.clinic_id as string;
    patientCounts.set(cid, (patientCounts.get(cid) ?? 0) + 1);
  }

  // Alertas de almacenamiento: recursos que cruzaron el 80% de su límite gratuito.
  // Se muestran como banner arriba del todo (canal de aviso "en-app").
  const usageItems: { label: string; used: number; limit: number }[] = [
    ...(supaStats
      ? [
          { label: "Base de datos (Supabase)", used: supaStats.databaseBytes, limit: SUPABASE_FREE_DB_BYTES },
          { label: "Storage (Supabase)", used: supaStats.storageBytes, limit: SUPABASE_FREE_STORAGE_BYTES },
        ]
      : []),
    { label: "Fotos (Cloudflare R2)", used: totalPhotoBytes, limit: R2_FREE_PHOTO_BYTES },
  ];
  const usageAlerts = usageItems
    .map((it) => ({ ...it, level: usageLevel(it.used, it.limit) }))
    .filter((it) => it.level !== "ok");
  const worstLevel: UsageLevel = usageAlerts.some((a) => a.level === "danger")
    ? "danger"
    : usageAlerts.length > 0
      ? "warn"
      : "ok";

  // Último respaldo automático por clínica (de backupRows, ya cargado arriba).
  // Si la migración 0068 aún no está en prod, backupRows es null y el mapa queda
  // vacío (la sección muestra "sin respaldo aún").
  const lastBackup = new Map<
    string,
    { status: string; created_at: string; size_bytes: number | null; storage_key: string | null }
  >();
  for (const b of backupRows ?? []) {
    const cid = b.clinic_id as string;
    if (!cid || lastBackup.has(cid)) continue; // ya tengo el más reciente
    lastBackup.set(cid, {
      status: b.status as string,
      created_at: b.created_at as string,
      size_bytes: (b.size_bytes as number | null) ?? null,
      storage_key: (b.storage_key as string | null) ?? null,
    });
  }

  const rows: ClinicRow[] = (clinics ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    plan: c.plan,
    features: normalizeFeatures(c.features),
    photoQuota: photoQuota(c.features),
    photoUsed: photoCounts.get(c.id) ?? 0,
    active: c.active !== false,
    max_users: c.max_users ?? 10,
    max_patients: (c as { max_patients: number | null }).max_patients ?? null,
    patientCount: patientCounts.get(c.id) ?? 0,
    created_at: c.created_at,
    users: usersByClinic.get(c.id) ?? [],
    settings: (c.settings as Record<string, unknown>) ?? {},
  }));

  // Clínicas que llegaron al 90% de su tope de fotos: candidatas a ampliación
  // (upsell). Solo las que tienen el addon de fotos y un tope definido.
  const nearQuota = rows.filter(
    (c) => c.features.fotos && c.photoQuota > 0 && c.photoUsed >= c.photoQuota * 0.9,
  );

  const total = rows.length;
  const activeCount = rows.filter((c) => c.active).length;
  const suspendedCount = total - activeCount;
  // Solo usuarios activos: los desactivados no ocupan cupo ni cuentan aquí.
  const totalUsers = rows.reduce(
    (sum, c) => sum + c.users.filter((u) => u.active).length,
    0,
  );

  const stats = [
    { label: "Clínicas", value: total, icon: Building2, tone: "text-clinic-fg bg-clinic/10" },
    { label: "Activas", value: activeCount, icon: CheckCircle2, tone: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10" },
    { label: "Suspendidas", value: suspendedCount, icon: PauseCircle, tone: "text-amber-600 bg-amber-50 dark:bg-amber-500/10" },
    { label: "Usuarios", value: totalUsers, icon: Users, tone: "text-slate-600 bg-slate-100 dark:bg-slate-500/10" },
    {
      label: `Fotos · ${totalPhotoGB.toFixed(2)} GB / 10 GB`,
      value: totalPhotos,
      icon: Camera,
      tone:
        totalPhotoGB >= 8
          ? "text-red-600 bg-red-50 dark:bg-red-500/10"
          : "text-sky-600 bg-sky-50 dark:bg-sky-500/10",
    },
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

      {/* Banner de alerta de almacenamiento (canal "en-app") */}
      {usageAlerts.length > 0 && (
        <div
          className={`rounded-xl p-4 ring-1 ${
            worstLevel === "danger"
              ? "bg-red-50 ring-red-200 dark:bg-red-500/10 dark:ring-red-500/30"
              : "bg-amber-50 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30"
          }`}
        >
          <div
            className={`flex items-center gap-2 text-sm font-semibold ${
              worstLevel === "danger" ? "text-red-700 dark:text-red-300" : "text-amber-800 dark:text-amber-300"
            }`}
          >
            <AlertTriangle className="h-4 w-4" />
            {worstLevel === "danger"
              ? "Almacenamiento cerca del límite — riesgo de tener que pagar"
              : "Almacenamiento alto — conviene vigilar"}
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {usageAlerts.map((a) => (
              <li
                key={a.label}
                className={
                  a.level === "danger"
                    ? "text-red-700 dark:text-red-200"
                    : "text-amber-800 dark:text-amber-200"
                }
              >
                <span className="font-medium">{a.label}:</span>{" "}
                {formatBytes(a.used)} de {formatBytes(a.limit)} (
                {((a.used / a.limit) * 100).toFixed(0)}%)
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
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

      {/* Almacenamiento de Supabase (free tier) — avisa antes de tener que pagar */}
      {supaStats && (
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-700">
            <Database className="h-4 w-4 text-clinic-fg" />
            Almacenamiento de Supabase
            <span className="ml-1 text-xs font-normal text-slate-400">
              (las fotos de pacientes van aparte, en Cloudflare R2)
            </span>
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <StorageBar
              icon={Database}
              label="Base de datos"
              used={supaStats.databaseBytes}
              limit={SUPABASE_FREE_DB_BYTES}
            />
            <StorageBar
              icon={HardDrive}
              label="Storage (archivos)"
              used={supaStats.storageBytes}
              limit={SUPABASE_FREE_STORAGE_BYTES}
            />
          </div>
        </section>
      )}

      {/* Respaldos automáticos por clínica (cron semanal → R2) */}
      {rows.length > 0 && (
        <details className="group rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 p-5 [&::-webkit-details-marker]:hidden">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <DatabaseBackup className="h-4 w-4 text-clinic-fg" />
              Respaldos automáticos
              <span className="ml-1 text-xs font-normal text-slate-400">
                (semanal · verificados · en Cloudflare R2)
              </span>
            </h2>
            {rows.some((c) => lastBackup.get(c.id)?.status === "error") ? (
              <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-600 dark:bg-red-500/10">
                Hay fallos
              </span>
            ) : rows.every((c) => lastBackup.has(c.id)) ? (
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:bg-emerald-500/10">
                Todas al día
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                {rows.filter((c) => lastBackup.has(c.id)).length}/{rows.length} con respaldo
              </span>
            )}
          </summary>
          <div className="border-t border-slate-100">
            <ul className="divide-y divide-slate-100 text-sm">
              {rows.map((c) => {
                const b = lastBackup.get(c.id);
                return (
                  <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <span className="min-w-0 truncate font-medium text-slate-700">{c.name}</span>
                    {!b ? (
                      <span className="text-xs text-slate-400">Sin respaldo aún</span>
                    ) : (
                      <span className="flex flex-wrap items-center justify-end gap-2 text-xs">
                        <span className="text-slate-500">
                          {new Date(b.created_at).toLocaleString("es-BO", {
                            timeZone: "America/La_Paz",
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </span>
                        {b.size_bytes != null && (
                          <span className="text-slate-400">{formatBytes(b.size_bytes)}</span>
                        )}
                        {b.status === "ok" ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-600 dark:bg-emerald-500/10">
                            OK
                          </span>
                        ) : (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-600 dark:bg-red-500/10">
                            Error
                          </span>
                        )}
                        {b.status === "ok" && b.storage_key && (
                          <R2RestoreButton storageKey={b.storage_key} clinicName={c.name} />
                        )}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </details>
      )}

      {/* Alerta de upsell: clínicas cerca de su tope de fotos */}
      {nearQuota.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-4 ring-1 ring-amber-200 dark:bg-amber-500/10 dark:ring-amber-500/30">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <Camera className="h-4 w-4" />
            {nearQuota.length} clínica{nearQuota.length !== 1 ? "s" : ""} cerca de su tope de fotos
          </div>
          <ul className="mt-2 flex flex-wrap gap-2">
            {nearQuota.map((c) => (
              <li
                key={c.id}
                className="rounded-full bg-white px-3 py-1 text-xs text-amber-800 ring-1 ring-amber-200 dark:bg-night/40 dark:text-amber-200 dark:ring-amber-500/40"
              >
                {c.name}: {c.photoUsed.toLocaleString("es-BO")}/{c.photoQuota.toLocaleString("es-BO")}
              </li>
            ))}
          </ul>
        </div>
      )}

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

// Barra de uso de un recurso de Supabase contra su límite del free tier. Cambia
// de color al acercarse (≥75% ámbar, ≥90% rojo) para avisar antes de tener que pagar.
function StorageBar({
  icon: Icon,
  label,
  used,
  limit,
}: {
  icon: typeof Database;
  label: string;
  used: number;
  limit: number;
}) {
  const pct = limit > 0 ? Math.min(100, (used / limit) * 100) : 0;
  const danger = pct >= 90;
  const warn = pct >= 80 && !danger;
  const barTone = danger ? "bg-red-500" : warn ? "bg-amber-500" : "bg-clinic";
  const pctTone = danger
    ? "text-red-600"
    : warn
      ? "text-amber-600"
      : "text-slate-500";

  return (
    <div className="rounded-lg bg-slate-50 p-4 dark:bg-night/40">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Icon className="h-4 w-4 text-slate-400" />
          {label}
        </span>
        <span className={`text-xs font-semibold ${pctTone}`}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-night">
        <div className={`h-full rounded-full ${barTone}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-slate-500">
        {formatBytes(used)} de {formatBytes(limit)}
        {danger && <span className="ml-1 font-medium text-red-600">· cerca del límite</span>}
        {warn && <span className="ml-1 font-medium text-amber-600">· vigilar</span>}
      </p>
    </div>
  );
}
