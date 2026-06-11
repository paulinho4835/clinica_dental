import { Briefcase, Banknote, Percent } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { requireNavAccess } from "@/lib/guard";
import { bs, boliviaTodayISO } from "@/lib/format";
import { Stat } from "@/components/ui/Stat";
import { PageHeader } from "@/components/ui/PageHeader";
import { WorkForm } from "@/components/mis-trabajos/WorkForm";
import { DeleteWorkButton } from "@/components/mis-trabajos/DeleteWorkButton";
import { DoctorFilter } from "@/components/mis-trabajos/DoctorFilter";
import { getPlatformAdminIds } from "@/lib/platformAdmins";

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  qr: "QR",
  card: "Tarjeta",
  transfer: "Transf.",
};

type WorkRow = {
  id: string;
  description: string;
  cost: number;
  commission_pct: number;
  commission_amount: number;
  amount_paid: number;
  payment_method: string | null;
  performed_at: string;
  notes: string | null;
  patient_name: string | null;
  patients: { full_name?: string } | null;
  doctor: { full_name?: string } | null;
};

export default async function MisTrabajosPage({
  searchParams,
}: {
  searchParams: Promise<{ doctor?: string }>;
}) {
  await requireNavAccess("mis_trabajos");
  const supabase = await createClient();
  const profile = await getProfile();
  const isAdmin = profile?.role === "admin";
  const isRecepcionista = profile?.role === "recepcionista";
  // Recepcionista y admin pueden ver/filtrar trabajos de todos los doctores.
  const canPickDoctor = isAdmin || isRecepcionista;
  const today = boliviaTodayISO();

  const doctorParam = canPickDoctor ? ((await searchParams).doctor ?? "") : "";
  const selectedDoctor = canPickDoctor
    ? doctorParam === "all"
      ? "all"
      : doctorParam || (isAdmin ? (profile?.userId ?? "") : "all")
    : "";

  // Recepcionista necesita admin client para ver los trabajos de toda la clínica.
  const worksClient = isRecepcionista ? createAdminClient() : supabase;
  let worksQuery = worksClient
    .from("doctor_works")
    .select(
      "id, description, cost, commission_pct, commission_amount, amount_paid, payment_method, performed_at, notes, patient_name, patients(full_name), doctor:profiles!doctor_works_doctor_id_fkey(full_name)",
    )
    .order("performed_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (isRecepcionista && profile) {
    worksQuery = worksQuery.eq("clinic_id", profile.clinicId);
  }
  if (canPickDoctor && selectedDoctor && selectedDoctor !== "all") {
    worksQuery = worksQuery.eq("doctor_id", selectedDoctor);
  } else if (!canPickDoctor && profile) {
    // Doctores (odontologo_general, especialista): solo ven sus propios trabajos.
    worksQuery = worksQuery.eq("doctor_id", profile.userId);
  }

  const platformAdminIds = canPickDoctor ? await getPlatformAdminIds() : [];

  let doctorsQuery = canPickDoctor
    ? supabase
        .from("profiles")
        .select("id, full_name, role")
        .in("role", ["admin", "odontologo_general", "especialista"])
        .order("full_name")
    : null;
  if (doctorsQuery && platformAdminIds.length > 0) {
    doctorsQuery = doctorsQuery.not("id", "in", `(${platformAdminIds.join(",")})`);
  }

  const [{ data: works }, { data: patients }, { data: doctorProfiles }] = await Promise.all([
    worksQuery,
    supabase.from("patients").select("id, full_name, national_id").order("full_name"),
    doctorsQuery ?? Promise.resolve({ data: null }),
  ]);

  const rows = (works as WorkRow[] | null) ?? [];
  const totalCost = rows.reduce((s, w) => s + Number(w.cost), 0);
  const totalCommission = rows.reduce((s, w) => s + Number(w.commission_amount), 0);
  const totalPaid = rows.reduce((s, w) => s + Number(w.amount_paid), 0);

  // Para admin: su perfil primero; para recepcionista: sin preferencia propia.
  const sortedDoctors = doctorProfiles
    ? [
        ...(doctorProfiles.filter((d) => d.id === profile?.userId) ?? []),
        ...(doctorProfiles.filter((d) => d.id !== profile?.userId) ?? []),
      ]
    : [];

  const selectedName =
    selectedDoctor === "all"
      ? null
      : sortedDoctors.find((d) => d.id === selectedDoctor)?.full_name;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title={canPickDoctor ? "Trabajos y comisiones" : "Mis trabajos"}
          subtitle={
            canPickDoctor
              ? selectedName
                ? `Mostrando trabajos de ${selectedName}.`
                : "Trabajos registrados por todos los doctores de la clínica."
              : "Registra tus trabajos; la comisión se calcula sola."
          }
        />
        {canPickDoctor && sortedDoctors.length > 0 && (
          <DoctorFilter
            doctors={sortedDoctors}
            selected={selectedDoctor}
            currentUserId={profile?.userId ?? ""}
          />
        )}
      </div>

      <WorkForm
        patients={patients ?? []}
        today={today}
        doctors={isRecepcionista ? sortedDoctors : undefined}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          label="Trabajos facturados"
          value={bs(totalCost)}
          icon={<Briefcase className="h-5 w-5" />}
        />
        <Stat
          label="Comisión acumulada"
          value={bs(totalCommission)}
          icon={<Percent className="h-5 w-5" />}
          valueClassName="text-clinic"
        />
        <Stat
          label="Cobrado a pacientes"
          value={bs(totalPaid)}
          icon={<Banknote className="h-5 w-5" />}
          valueClassName="text-emerald-600"
        />
      </div>

      <section>
        <h2 className="mb-2 text-lg font-semibold">
          {rows.length} trabajo{rows.length !== 1 ? "s" : ""}
        </h2>
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <div className="min-w-[52rem]">
            <div className={`${GRID(canPickDoctor)} px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500`}>
              <span>Fecha</span>
              <span>Paciente</span>
              {canPickDoctor && <span>Doctor</span>}
              <span>Trabajo</span>
              <span className="text-right">Costo</span>
              <span className="text-right">Comisión</span>
              <span className="text-right">Cobrado</span>
              <span />
            </div>
            {rows.map((w) => (
              <div
                key={w.id}
                className={`${GRID(canPickDoctor)} border-t border-slate-100 px-4 py-2.5 text-sm transition hover:bg-slate-50/70`}
              >
                <span className="whitespace-nowrap tabular-nums text-xs text-slate-400">
                  {fmtDate(w.performed_at)}
                </span>
                <span className="truncate font-medium">
                  {w.patients?.full_name ?? w.patient_name ?? "—"}
                </span>
                {canPickDoctor && (
                  <span className="truncate text-slate-600">
                    {w.doctor?.full_name ?? "—"}
                  </span>
                )}
                <span className="truncate text-slate-600">
                  {w.description}
                  {w.notes && (
                    <span className="block truncate text-xs text-slate-400">{w.notes}</span>
                  )}
                </span>
                <span className="text-right tabular-nums">{bs(Number(w.cost))}</span>
                <span className="text-right tabular-nums font-medium text-clinic">
                  {bs(Number(w.commission_amount))}
                  <span className="block text-xs font-normal text-slate-400">
                    {Number(w.commission_pct)}%
                  </span>
                </span>
                <div className="flex flex-col items-end leading-tight">
                  <span className="tabular-nums">{bs(Number(w.amount_paid))}</span>
                  {w.payment_method && (
                    <span className="text-xs text-slate-400">
                      {METHOD_LABEL[w.payment_method] ?? w.payment_method}
                    </span>
                  )}
                </div>
                <div className="flex justify-end">
                  <DeleteWorkButton id={w.id} />
                </div>
              </div>
            ))}
            {rows.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">
                Aún no hay trabajos registrados. Usa el botón de arriba para anotar el primero.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

// Columnas: con/sin la de Doctor (visible para admin y recepcionista).
const GRID = (admin: boolean) =>
  admin
    ? "grid grid-cols-[6rem_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_7rem_8rem_8rem_2.5rem] items-center gap-x-4"
    : "grid grid-cols-[6rem_minmax(0,1fr)_minmax(0,1.2fr)_7rem_8rem_8rem_2.5rem] items-center gap-x-4";

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "short",
  });
}
