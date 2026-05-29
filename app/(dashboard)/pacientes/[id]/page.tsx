import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { OdontogramEditor } from "@/components/odontogram/OdontogramEditor";
import { ConsentPanel } from "@/components/consents/ConsentPanel";
import {
  TreatmentPlanPanel,
  type Plan,
} from "@/components/treatments/TreatmentPlanPanel";
import type { TeethMap } from "@/lib/odontogram/types";

export default async function PatientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: patient } = await supabase
    .from("patients")
    .select("id, clinic_id, full_name, dob, phone, email, allergies, medical_alerts, anamnesis")
    .eq("id", id)
    .single();

  if (!patient) notFound();

  const { data: odo } = await supabase
    .from("odontograms")
    .select("teeth")
    .eq("patient_id", id)
    .maybeSingle();

  const { data: balanceRow } = await supabase
    .from("account_movements")
    .select("balance_after")
    .eq("patient_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const profile = await getProfile();
  const canClinical = can(profile?.role, "clinical:write");

  const [{ data: rawPlans }, { data: procedures }, { data: dentists }, { data: consents }] =
    await Promise.all([
      supabase
        .from("treatment_plans")
        .select(
          "id, status, treatment_phases(id, title, phase_no, treatment_items(id, tooth_fdi, price, status, procedure:procedure_catalog(name), dentist:profiles(full_name)))",
        )
        .eq("patient_id", id)
        .order("created_at", { ascending: false }),
      supabase
        .from("procedure_catalog")
        .select("id, name, base_price")
        .eq("active", true)
        .order("name"),
      supabase
        .from("profiles")
        .select("id, full_name")
        .in("role", ["odontologo_general", "especialista"])
        .order("full_name"),
      supabase
        .from("informed_consents")
        .select("id, template_code, signed_by_name, signed_at, content_hash")
        .eq("patient_id", id)
        .order("signed_at", { ascending: false }),
    ]);

  // Mapea los nombres anidados de Supabase al shape que espera el panel.
  const plans: Plan[] = (rawPlans ?? []).map((p) => ({
    id: p.id,
    status: p.status,
    phases: ((p.treatment_phases as Record<string, unknown>[]) ?? [])
      .map((ph) => ({
        id: ph.id as string,
        title: ph.title as string,
        phase_no: ph.phase_no as number,
        items: ((ph.treatment_items as Record<string, unknown>[]) ?? []).map((it) => ({
          id: it.id as string,
          tooth_fdi: (it.tooth_fdi as string) ?? null,
          price: Number(it.price),
          status: it.status as string,
          procedure: (it.procedure as { name?: string } | null) ?? null,
          dentist: (it.dentist as { full_name?: string } | null) ?? null,
        })),
      }))
      .sort((a, b) => a.phase_no - b.phase_no),
  }));

  const teeth = (odo?.teeth as TeethMap) ?? {};

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">{patient.full_name}</h1>
        <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-500">
          {patient.dob && <span>Nac.: {patient.dob}</span>}
          {patient.phone && <span>Tel.: {patient.phone}</span>}
          <span>Saldo: ${Number(balanceRow?.balance_after ?? 0).toFixed(2)}</span>
        </div>
        {patient.medical_alerts?.length > 0 && (
          <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            ⚠ Alertas médicas: {patient.medical_alerts.join(", ")}
          </div>
        )}
        {patient.allergies?.length > 0 && (
          <div className="mt-2 text-sm text-amber-700">Alergias: {patient.allergies.join(", ")}</div>
        )}
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Odontograma</h2>
        <OdontogramEditor
          clinicId={patient.clinic_id}
          patientId={patient.id}
          initialTeeth={teeth}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Plan de tratamiento</h2>
        <TreatmentPlanPanel
          patientId={patient.id}
          canWrite={canClinical}
          plans={plans}
          procedures={procedures ?? []}
          dentists={dentists ?? []}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Consentimientos informados</h2>
        <ConsentPanel
          patientId={patient.id}
          canWrite={canClinical}
          consents={consents ?? []}
        />
      </section>
    </div>
  );
}
