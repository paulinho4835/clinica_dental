import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireNavAccess } from "@/lib/guard";
import { PageHeader } from "@/components/ui/PageHeader";
import {
  PatientHistoryPanel,
  type PaymentRow,
} from "@/components/history/PatientHistoryPanel";

export default async function CuentasPacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; p?: string }>;
}) {
  await requireNavAccess("cuentas");
  const { q = "", p: selectedId } = await searchParams;

  const supabase = await createClient();

  // Lista de pacientes (búsqueda opcional).
  let patientsQuery = supabase
    .from("patients")
    .select("id, full_name, phone, national_id")
    .order("full_name")
    .limit(60);

  if (q.trim()) {
    patientsQuery = patientsQuery.or(
      `full_name.ilike.%${q.trim()}%,national_id.ilike.%${q.trim()}%,phone.ilike.%${q.trim()}%`,
    );
  }

  const { data: patients } = await patientsQuery;

  // Detalle financiero del paciente seleccionado.
  let selectedPatient: { id: string; full_name: string } | null = null;
  let paymentRows: PaymentRow[] = [];
  let totalQuoted = 0;
  let totalPaid = 0;

  if (selectedId) {
    const { data: pat } = await supabase
      .from("patients")
      .select("id, full_name")
      .eq("id", selectedId)
      .single();

    if (pat) {
      selectedPatient = pat as { id: string; full_name: string };

      const [{ data: payments }, { data: rawPlans }] = await Promise.all([
        supabase
          .from("payments")
          .select(
            "id, amount, method, note, received_at, doctor:profiles!payments_doctor_id_fkey(full_name), collected_by:profiles!payments_collected_by_id_fkey(full_name)",
          )
          .eq("patient_id", selectedId)
          .order("received_at", { ascending: false }),
        supabase
          .from("treatment_plans")
          .select("id, treatment_phases(treatment_items(id, price, status))")
          .eq("patient_id", selectedId),
      ]);

      paymentRows = (payments ?? []).map((p) => ({
        id: p.id as string,
        amount: Number(p.amount),
        method: p.method as string,
        note: p.note as string | null,
        receivedAt: p.received_at as string,
        doctorName:
          ((p.doctor as { full_name?: string } | null)?.full_name) ?? null,
        collectedByName:
          ((p.collected_by as { full_name?: string } | null)?.full_name) ??
          null,
      }));

      totalPaid = paymentRows.reduce((s, p) => s + p.amount, 0);
      totalQuoted = (rawPlans ?? [])
        .flatMap(
          (plan) => (plan.treatment_phases as Record<string, unknown>[]) ?? [],
        )
        .flatMap(
          (ph) => (ph.treatment_items as Record<string, unknown>[]) ?? [],
        )
        .reduce((s, item) => s + Number(item.price ?? 0), 0);
    }
  }

  const qParam = q.trim() ? `q=${encodeURIComponent(q.trim())}&` : "";

  return (
    <div className="space-y-6">
      <PageHeader title="Cuentas de pacientes" />

      <div className="flex gap-6 items-start">
        {/* Panel izquierdo: búsqueda + lista */}
        <div className="w-72 shrink-0 space-y-3">
          <form method="get">
            <input
              name="q"
              defaultValue={q}
              placeholder="Buscar por nombre, CI o teléfono…"
              autoComplete="off"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            />
          </form>

          <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
            {(patients ?? []).length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">Sin resultados.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {(patients ?? []).map((pat) => (
                  <Link
                    key={pat.id}
                    href={`/cuentas?${qParam}p=${pat.id}`}
                    className={`block px-4 py-3 transition-colors hover:bg-slate-50 ${
                      selectedId === pat.id
                        ? "border-l-2 border-clinic bg-clinic/5"
                        : ""
                    }`}
                  >
                    <div className="text-sm font-medium text-slate-800">
                      {pat.full_name}
                    </div>
                    {(pat.national_id || pat.phone) && (
                      <div className="mt-0.5 text-xs text-slate-400">
                        {pat.national_id && <span>{pat.national_id}</span>}
                        {pat.national_id && pat.phone && <span> · </span>}
                        {pat.phone && <span>{pat.phone}</span>}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Panel derecho: detalle de cuenta */}
        <div className="min-w-0 flex-1">
          {!selectedPatient ? (
            <div className="flex h-64 items-center justify-center rounded-lg bg-white text-sm text-slate-400 ring-1 ring-slate-200">
              Selecciona un paciente para ver su cuenta
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">
                  {selectedPatient.full_name}
                </h2>
                <Link
                  href={`/pacientes/${selectedPatient.id}`}
                  className="text-xs text-clinic hover:underline"
                >
                  Ver ficha clínica →
                </Link>
              </div>
              <PatientHistoryPanel
                patientId={selectedPatient.id}
                canBilling={false}
                payments={paymentRows}
                doctors={[]}
                totalQuoted={totalQuoted}
                totalPaid={totalPaid}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
