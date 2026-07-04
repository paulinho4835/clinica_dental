import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { NewPatientForm } from "@/components/patients/NewPatientForm";
import { PatientSearch } from "@/components/patients/PatientSearch";
import {
  IncomingIntakesPanel,
  type IntakeItem,
} from "@/components/patients/IncomingIntakesPanel";
import { parseAnamnesis } from "@/lib/schemas/anamnesis";
import { parseIntake } from "@/lib/schemas/patient-intake";
import { requireFeature } from "@/lib/guard";
import { getInitials, normalizeSearch } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";

const AVATAR_COLORS = [
  "bg-violet-100 text-violet-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
];

function getAvatarColor(name: string) {
  const code = name.charCodeAt(0) + (name.charCodeAt(1) || 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

export default async function PatientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireFeature("pacientes");
  const supabase = await createClient();
  const profile = await getProfile();
  // Los doctores no ven el teléfono del paciente (dato de contacto reservado).
  const isDoctor =
    profile?.role === "odontologo_general" || profile?.role === "especialista";

  const q = (await searchParams).q?.trim() ?? "";

  let query = supabase
    .from("patients")
    .select("id, full_name, national_id, phone, medical_alerts")
    .order("full_name");

  if (q) {
    query = query.ilike("search_text", `%${normalizeSearch(q)}%`);
  }

  const { data: patients } = await query;

  // Registros entrantes (auto-registro de pacientes nuevos vía WhatsApp).
  const canRegister = can(profile?.role, "patients:write");
  const intakesReady: IntakeItem[] = [];
  const intakesAwaiting: IntakeItem[] = [];
  let clinicName = "la clínica";
  if (canRegister) {
    const [{ data: rawIntakes }, { data: clinicRow }] = await Promise.all([
      supabase
        .from("anamnesis_invitations")
        .select(
          "id, contact_name, contact_phone, completed_at, expires_at, submitted_personal, submitted_data, submitted_allergies, submitted_alerts, source",
        )
        .eq("kind", "new")
        .is("reviewed_at", null)
        .order("created_at", { ascending: false }),
      profile?.clinicId
        ? supabase.from("clinics").select("name").eq("id", profile.clinicId).single()
        : Promise.resolve({ data: null }),
    ]);
    clinicName = (clinicRow as { name?: string } | null)?.name ?? "la clínica";
    const now = Date.now();
    for (const r of rawIntakes ?? []) {
      const item: IntakeItem = {
        id: r.id as string,
        contactName: (r.contact_name as string | null) ?? null,
        contactPhone: (r.contact_phone as string | null) ?? null,
        completedAt: (r.completed_at as string | null) ?? null,
        source: (r.source as string | null) ?? "manual",
        personal: r.submitted_personal ? parseIntake(r.submitted_personal) : null,
        proposed: r.completed_at
          ? {
              data: parseAnamnesis(r.submitted_data),
              allergies: (r.submitted_allergies as string[] | null) ?? [],
              alerts: (r.submitted_alerts as string[] | null) ?? [],
            }
          : null,
      };
      if (item.completedAt) intakesReady.push(item);
      else if (new Date(r.expires_at as string).getTime() > now)
        intakesAwaiting.push(item);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pacientes"
        subtitle={
          patients && patients.length > 0
            ? `${patients.length} paciente${patients.length !== 1 ? "s" : ""} registrado${patients.length !== 1 ? "s" : ""}`
            : undefined
        }
      />
      {canRegister && <NewPatientForm />}

      {canRegister && (
        <IncomingIntakesPanel
          clinicName={clinicName}
          ready={intakesReady}
          awaiting={intakesAwaiting}
        />
      )}

      <PatientSearch initial={q} />

      <div className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        {patients?.map((p) => (
          <Link
            key={p.id}
            href={`/pacientes/${p.id}`}
            className="flex items-center justify-between px-4 py-3 hover:bg-slate-50"
          >
            <div className="flex items-center gap-3">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${getAvatarColor(p.full_name)}`}
              >
                {getInitials(p.full_name)}
              </span>
              <div>
                <div className="font-medium">{p.full_name}</div>
                <div className="text-xs text-slate-500">
                  {p.national_id ? `CI: ${p.national_id}` : "Sin CI"}
                  {!isDoctor && (
                    <>
                      {" · "}
                      {p.phone ?? "Sin teléfono"}
                    </>
                  )}
                </div>
              </div>
            </div>
            {p.medical_alerts?.length > 0 && (
              <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                ⚠ {p.medical_alerts.join(", ")}
              </span>
            )}
          </Link>
        ))}
        {!patients?.length && (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center">
            <span className="text-4xl">🦷</span>
            <p className="font-medium text-slate-600">
              {q ? `Sin resultados para "${q}"` : "Aún no hay pacientes registrados"}
            </p>
            {!q && (
              <p className="text-sm text-slate-400">
                Crea el primer paciente con el botón de arriba.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
