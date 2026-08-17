import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getClinicCurrency } from "@/lib/superadmin";
import { money } from "@/lib/format";
import { HistoricalRegularizationPanel, type HistoricalWorkRow } from "@/components/audit/HistoricalRegularizationPanel";

export async function HistoricalRegularizationSection() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") return null;
  const supabase = await createClient();
  const [{ data: rawWorks }, { data: decisions }, currency] = await Promise.all([
    supabase.from("doctor_works").select("id, patient_id, description, cost, performed_at, commission_amount, lab_commission_amount, commission_paid, commission_paid_amount, staff_payment_id, patient:patients!doctor_works_patient_id_fkey(full_name), doctor:profiles!doctor_works_doctor_id_fkey(full_name)").eq("clinic_id", profile.clinicId).is("treatment_item_id", null).order("performed_at", { ascending: true }),
    supabase.from("audit_log").select("id, action, created_at, diff, actor:profiles!audit_log_actor_id_fkey(full_name)").eq("clinic_id", profile.clinicId).eq("entity", "doctor_work").like("action", "historical_work_%").order("created_at", { ascending: false }).limit(100),
    getClinicCurrency(),
  ]);
  // Los trabajos huérfanos pueden conservarse con patient_id NULL (por
  // ejemplo, pacientes de prueba eliminados). No incluir NULL en el filtro
  // `in(...)`: PostgREST puede rechazar toda la consulta y dejar sin opciones
  // los planes de pacientes válidos.
  const patientIds = [...new Set(
    (rawWorks ?? [])
      .map((w) => w.patient_id as string | null)
      .filter((id): id is string => Boolean(id)),
  )];
  const [{ data: planRows }, { data: payments }] = patientIds.length ? await Promise.all([
    supabase.from("treatment_plans").select("id, patient_id").in("patient_id", patientIds),
    supabase.from("payments").select("id, patient_id, amount, received_at").in("patient_id", patientIds).is("treatment_item_id", null).order("received_at", { ascending: false }),
  ]) : [{ data: [] }, { data: [] }];
  // Se cargan las relaciones en consultas simples para que un fallo de una
  // relación opcional del catálogo no deje vacío el selector completo.
  const planIds = (planRows ?? []).map((p) => p.id as string);
  const { data: phaseRows } = planIds.length
    ? await supabase.from("treatment_phases").select("id, plan_id").in("plan_id", planIds)
    : { data: [] };
  const phaseIds = (phaseRows ?? []).map((p) => p.id as string);
  const { data: itemRows } = phaseIds.length
    ? await supabase.from("treatment_items").select("id, phase_id, price, custom_name, status, procedure_id").in("phase_id", phaseIds)
    : { data: [] };
  const procedureIds = [...new Set((itemRows ?? []).map((i) => i.procedure_id as string | null).filter(Boolean))] as string[];
  const itemIds = (itemRows ?? []).map((i) => i.id as string);
  const workIds = (rawWorks ?? []).map((w) => w.id as string);
  const [{ data: procedureRows }, { data: linkedWorks }, { data: commissionLedger }] = await Promise.all([
    procedureIds.length
      ? supabase.from("procedure_catalog").select("id, name").in("id", procedureIds)
      : Promise.resolve({ data: [] }),
    itemIds.length
      ? supabase.from("doctor_works").select("treatment_item_id").eq("clinic_id", profile.clinicId).in("treatment_item_id", itemIds)
      : Promise.resolve({ data: [] }),
    workIds.length
      ? supabase.from("staff_payment_works").select("work_id, amount").eq("clinic_id", profile.clinicId).in("work_id", workIds)
      : Promise.resolve({ data: [] }),
  ]);
  const planPatientById = new Map((planRows ?? []).map((p) => [p.id as string, p.patient_id as string]));
  const phasePlanById = new Map((phaseRows ?? []).map((p) => [p.id as string, p.plan_id as string]));
  const procedureNameById = new Map((procedureRows ?? []).map((p) => [p.id as string, p.name as string]));
  const linkedWorkCountByItem = new Map<string, number>();
  for (const work of linkedWorks ?? []) {
    const itemId = work.treatment_item_id as string;
    linkedWorkCountByItem.set(itemId, (linkedWorkCountByItem.get(itemId) ?? 0) + 1);
  }
  const ledgerPaidByWork = new Map<string, number>();
  for (const entry of commissionLedger ?? []) {
    const workId = entry.work_id as string;
    ledgerPaidByWork.set(workId, (ledgerPaidByWork.get(workId) ?? 0) + Number(entry.amount));
  }
  const itemsByPatient = new Map<string, HistoricalWorkRow["planItems"]>();
  for (const item of itemRows ?? []) {
    if (item.status === "cancelled") continue;
    const planId = phasePlanById.get(item.phase_id as string);
    const patientId = planId ? planPatientById.get(planId) : null;
    if (!patientId) continue;
    const target = itemsByPatient.get(patientId) ?? [];
    target.push({ id: item.id as string, name: procedureNameById.get(item.procedure_id as string) ?? (item.custom_name as string) ?? "Sin nombre", price: Number(item.price), linkedWorkCount: linkedWorkCountByItem.get(item.id as string) ?? 0 });
    itemsByPatient.set(patientId, target);
  }
  const paymentByPatient = new Map<string, HistoricalWorkRow["payments"]>();
  for (const payment of payments ?? []) {
    const target = paymentByPatient.get(payment.patient_id as string) ?? [];
    target.push({ id: payment.id as string, amount: Number(payment.amount), receivedAt: payment.received_at as string });
    paymentByPatient.set(payment.patient_id as string, target);
  }
  const rows: HistoricalWorkRow[] = (rawWorks ?? []).map((w) => {
    const commissionTotal = Number(w.commission_amount ?? 0) + Number(w.lab_commission_amount ?? 0);
    const commissionPaidAmount = Math.max(Number(w.commission_paid_amount ?? 0), ledgerPaidByWork.get(w.id as string) ?? 0);
    const fullyPaid = Boolean(w.commission_paid) || (commissionTotal > 0 && commissionPaidAmount >= commissionTotal - 0.005);
    const partiallyPaid = !fullyPaid && (commissionPaidAmount > 0 || Boolean(w.staff_payment_id));
    return {
      id: w.id as string, patientId: w.patient_id as string,
      patientName: (w.patient as { full_name?: string } | null)?.full_name ?? "Paciente sin nombre",
      doctorName: (w.doctor as { full_name?: string } | null)?.full_name ?? "Sin doctor",
      description: w.description as string, cost: Number(w.cost), performedAt: w.performed_at as string,
      commissionState: fullyPaid ? "paid" : partiallyPaid ? "partial" : "unpaid",
      commissionPaidAmount, commissionTotal,
      planItems: itemsByPatient.get(w.patient_id as string) ?? [], payments: paymentByPatient.get(w.patient_id as string) ?? [],
    };
  });
  return <>
    <HistoricalRegularizationPanel rows={rows} currency={currency} />
    {(decisions ?? []).length > 0 && <section className="space-y-2">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Decisiones de regularizacion</h2>
      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Decision</th><th className="px-4 py-3">Trabajo</th><th className="px-4 py-3">Responsable</th><th className="px-4 py-3">Motivo</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{(decisions ?? []).map((d) => {
            const diff = (d.diff ?? {}) as { reason?: string; before?: { description?: string; cost?: number }; approved_price?: number };
            const labels: Record<string, string> = { historical_work_link: "Vinculado", historical_work_create: "Creado en plan", historical_work_deleted_duplicate: "Duplicado eliminado" };
            return <tr key={d.id}><td className="whitespace-nowrap px-4 py-3 text-slate-600">{new Date(d.created_at as string).toLocaleString("es-BO")}</td><td className="px-4 py-3 font-medium">{labels[d.action as string] ?? d.action}</td><td className="px-4 py-3">{diff.before?.description ?? "—"}{diff.approved_price != null && <span className="ml-2 text-slate-500">{money(Number(diff.approved_price), currency)}</span>}</td><td className="px-4 py-3">{(d.actor as { full_name?: string } | null)?.full_name ?? "Sistema"}</td><td className="px-4 py-3 text-slate-600">{diff.reason ?? "—"}</td></tr>;
          })}</tbody>
        </table>
      </div>
    </section>}
  </>;
}
