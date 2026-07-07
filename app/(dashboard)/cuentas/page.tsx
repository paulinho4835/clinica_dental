import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireNavAccess } from "@/lib/guard";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getPlatformAdminIds } from "@/lib/platformAdmins";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { Users } from "lucide-react";
import {
  PatientHistoryPanel,
  type PaymentRow,
  type WorkDebtRow,
} from "@/components/history/PatientHistoryPanel";

export default async function CuentasPacientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; p?: string }>;
}) {
  await requireNavAccess("cuentas");
  const { q = "", p: selectedId } = await searchParams;

  const supabase = await createClient();
  const profile = await getProfile();
  const canBilling = can(profile?.role, "billing:write");
  // Editar/eliminar pagos: acciones sensibles reservadas a administradores.
  const canManagePayments = profile?.role === "admin";

  // Lista de pacientes (búsqueda opcional). Aislamiento por clínica explícito
  // (defensa en profundidad) además de la RLS.
  let patientsQuery = supabase
    .from("patients")
    .select("id, full_name, phone, national_id")
    .eq("clinic_id", profile!.clinicId)
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
  let workRows: WorkDebtRow[] = [];
  let totalQuoted = 0;
  let totalPaid = 0;

  // Doctores y recepcionistas para el formulario de pago.
  const platformAdminIds = await getPlatformAdminIds();

  // Solo usuarios activos: a un desactivado no se le asignan pagos nuevos.
  let doctorsQuery = supabase
    .from("profiles")
    .select("id, full_name")
    .in("role", ["odontologo_general", "especialista", "admin", "colega"])
    .eq("clinic_id", profile!.clinicId)
    .eq("active", true)
    .order("full_name");
  if (platformAdminIds.length > 0) {
    doctorsQuery = doctorsQuery.not("id", "in", `(${platformAdminIds.join(",")})`);
  }

  // Las recepcionistas viven en clinic_receptionists (no en profiles); columna `name`.
  let recepcionistasQuery = supabase
    .from("clinic_receptionists")
    .select("id, name")
    .eq("clinic_id", profile!.clinicId)
    .eq("active", true)
    .order("name");

  const [{ data: doctors }, { data: recepcionistasRaw }] = await Promise.all([
    doctorsQuery,
    recepcionistasQuery,
  ]);

  // PatientHistoryPanel espera { id, full_name }: mapeamos name -> full_name.
  const recepcionistas = (recepcionistasRaw ?? []).map((r) => ({
    id: r.id as string,
    full_name: r.name as string,
  }));

  if (selectedId) {
    const { data: pat } = await supabase
      .from("patients")
      .select("id, full_name")
      .eq("id", selectedId)
      .single();

    if (pat) {
      selectedPatient = pat as { id: string; full_name: string };

      const [{ data: payments }, { data: works }] = await Promise.all([
        supabase
          .from("payments")
          .select(
            "id, amount, method, note, received_at, doctor:profiles!payments_doctor_id_fkey(full_name), collected_by:clinic_receptionists!payments_collected_by_id_fkey(name)",
          )
          .eq("patient_id", selectedId)
          .order("received_at", { ascending: false }),
        supabase
          .from("doctor_works")
          .select("id, description, cost, performed_at, doctor:profiles!doctor_works_doctor_id_fkey(full_name)")
          .eq("patient_id", selectedId)
          .order("performed_at", { ascending: false }),
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
          ((p.collected_by as { name?: string } | null)?.name) ?? null,
      }));

      workRows = (works ?? []).map((w) => ({
        id: w.id as string,
        description: w.description as string,
        cost: Number(w.cost),
        performedAt: w.performed_at as string,
        doctorName: ((w.doctor as { full_name?: string } | null)?.full_name) ?? null,
      }));

      totalPaid = paymentRows.reduce((s, p) => s + p.amount, 0);
      totalQuoted = workRows.reduce((s, w) => s + w.cost, 0);
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
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            />
          </form>

          <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
            {(patients ?? []).length === 0 ? (
              <EmptyState
                icon={<Users className="h-6 w-6" />}
                title={q ? `Sin resultados para “${q}”` : "Aún no hay pacientes"}
                description={
                  q
                    ? "Prueba con otro nombre, CI o teléfono."
                    : "Registra pacientes para ver sus cuentas aquí."
                }
              />
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
                canBilling={canBilling}
                canManagePayments={canManagePayments}
                payments={paymentRows}
                works={workRows}
                doctors={doctors ?? []}
                recepcionistas={recepcionistas ?? []}
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
