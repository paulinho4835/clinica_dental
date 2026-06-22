import { requireNavAccess } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getPlatformAdminIds } from "@/lib/platformAdmins";
import { boliviaTodayISO, bs, fmtBoliviaTime } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { EmptyState } from "@/components/ui/EmptyState";
import { Banknote, Receipt } from "lucide-react";
import { StaffPaymentForm } from "@/components/pagos/StaffPaymentForm";
import { PagosFilter } from "@/components/pagos/PagosFilter";
import { DeletePaymentButton } from "@/components/pagos/DeletePaymentButton";
import { DisbursedToggle } from "@/components/pagos/DisbursedToggle";
import { PrintPagosButton, type PrintPaymentRow } from "@/components/pagos/PrintPagosButton";

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  qr: "QR",
  card: "Tarjeta",
  transfer: "Transferencia",
};

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  odontologo_general: "Odontólogo",
  especialista: "Especialista",
  recepcionista: "Recepcionista",
  colega: "Colega",
  asistente: "Asistente",
};

const GRID =
  "grid grid-cols-[7rem_minmax(0,1fr)_7rem_minmax(0,1.2fr)_7rem_8rem_8rem_2.5rem] items-center gap-x-4";

type WorkDetail = {
  description: string;
  patient_name: string | null;
  performed_at: string;
  commission_amount: number;
  lab_commission_amount: number;
};

type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  concept: string | null;
  paid_at: string;
  created_at: string;
  disbursed: boolean;
  employee: { id: string; full_name: string; role: string } | null;
  works: WorkDetail[];
};

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtShortDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "2-digit",
  });
}

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<{ employee?: string; month?: string }>;
}) {
  await requireNavAccess("pagos");
  const supabase = await createClient();
  const profile = await getProfile();

  const params = await searchParams;
  const today = boliviaTodayISO();
  const currentMonth = today.slice(0, 7);
  const selectedMonth = params.month ?? currentMonth;
  const selectedEmployee = params.employee ?? "all";

  const isAllMonths = selectedMonth === "all";

  const [year, month] = isAllMonths ? [0, 0] : selectedMonth.split("-").map(Number);
  const monthStart = isAllMonths ? "" : `${selectedMonth}-01`;
  const nextMonthStart = isAllMonths ? "" : new Date(year, month, 1).toISOString().slice(0, 10);

  const platformAdminIds = await getPlatformAdminIds();
  let empQuery = supabase
    .from("profiles")
    .select("id, full_name, role")
    .eq("clinic_id", profile!.clinicId)
    .order("full_name");
  if (platformAdminIds.length > 0) {
    empQuery = empQuery.not("id", "in", `(${platformAdminIds.join(",")})`);
  }

  let paymentsQuery = supabase
    .from("staff_payments")
    .select(
      "id, amount, method, concept, paid_at, created_at, disbursed, employee:profiles!staff_payments_employee_id_fkey(id, full_name, role)",
    )
    .order("paid_at", { ascending: false })
    .order("created_at", { ascending: false });

  if (!isAllMonths) {
    paymentsQuery = paymentsQuery.gte("paid_at", monthStart).lt("paid_at", nextMonthStart);
  }

  if (selectedEmployee !== "all") {
    paymentsQuery = paymentsQuery.eq("employee_id", selectedEmployee);
  }

  const [{ data: employees }, { data: rawPayments }] = await Promise.all([
    empQuery,
    paymentsQuery,
  ]);

  const baseRows = (rawPayments ?? []).map((p) => ({
    id: p.id as string,
    amount: Number(p.amount),
    method: p.method as string,
    concept: p.concept as string | null,
    paid_at: p.paid_at as string,
    created_at: p.created_at as string,
    disbursed: Boolean(p.disbursed),
    employee: (Array.isArray(p.employee) ? p.employee[0] : p.employee) as { id: string; full_name: string; role: string } | null,
  }));

  // Traer los works asociados a los pagos visibles
  const paymentIds = baseRows.map((r) => r.id);
  let worksByPayment = new Map<string, WorkDetail[]>();

  if (paymentIds.length > 0) {
    const { data: worksRaw } = await supabase
      .from("doctor_works")
      .select("staff_payment_id, description, patient_name, performed_at, commission_amount, lab_commission_amount")
      .in("staff_payment_id", paymentIds)
      .order("performed_at", { ascending: false });

    for (const w of worksRaw ?? []) {
      const pid = w.staff_payment_id as string;
      if (!worksByPayment.has(pid)) worksByPayment.set(pid, []);
      worksByPayment.get(pid)!.push({
        description: w.description as string,
        patient_name: w.patient_name as string | null,
        performed_at: w.performed_at as string,
        commission_amount: Number(w.commission_amount),
        lab_commission_amount: Number(w.lab_commission_amount),
      });
    }
  }

  const rows: PaymentRow[] = baseRows.map((r) => ({
    ...r,
    works: worksByPayment.get(r.id) ?? [],
  }));

  const totalMonth = rows.filter((p) => p.disbursed).reduce((s, p) => s + p.amount, 0);
  const totalPending = rows.filter((p) => !p.disbursed).reduce((s, p) => s + p.amount, 0);

  const byEmployee = rows.reduce<Record<string, { name: string; role: string; total: number; count: number; pending: number }>>(
    (acc, p) => {
      const key = p.employee?.id ?? "unknown";
      if (!acc[key]) {
        acc[key] = {
          name: p.employee?.full_name ?? "—",
          role: p.employee?.role ?? "",
          total: 0,
          count: 0,
          pending: 0,
        };
      }
      if (p.disbursed) acc[key].total += p.amount;
      else acc[key].pending += p.amount;
      acc[key].count += 1;
      return acc;
    },
    {},
  );
  const employeeSummary = Object.values(byEmployee).sort((a, b) => b.total - a.total);

  const monthLabel = isAllMonths
    ? "Todos los meses"
    : new Date(monthStart + "T12:00:00").toLocaleDateString("es-BO", {
        month: "long",
        year: "numeric",
      });

  const printRows: PrintPaymentRow[] = rows.map((r) => ({
    id: r.id,
    employeeName: r.employee?.full_name ?? "—",
    employeeRole: r.employee?.role ?? "",
    amount: r.amount,
    method: r.method,
    concept: r.concept,
    paid_at: r.paid_at,
    disbursed: r.disbursed,
    works: r.works,
  }));

  return (
    <div className="space-y-8">
      <PageHeader
        title="Pagos a personal"
        subtitle="Registra y controla los pagos realizados a doctores, recepcionistas y personal de la clínica."
      />

      <StaffPaymentForm employees={employees ?? []} today={today} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat
          label={`Desembolsado — ${monthLabel}`}
          value={bs(totalMonth)}
          icon={<Banknote className="h-5 w-5" />}
          valueClassName="text-emerald-600"
        />
        {totalPending > 0 && (
          <Stat
            label="Pendiente de desembolso"
            value={bs(totalPending)}
            icon={<Receipt className="h-5 w-5" />}
            valueClassName="text-amber-600"
          />
        )}
        <Stat
          label="Pagos registrados"
          value={String(rows.length)}
          icon={<Receipt className="h-5 w-5" />}
        />
      </div>

      {/* Resumen por empleado */}
      {employeeSummary.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium text-slate-500 uppercase tracking-wide">
            Resumen — {monthLabel}
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {employeeSummary.map((e) => (
              <div
                key={e.name}
                className="rounded-lg bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-slate-700">{e.name}</div>
                    <div className="text-xs text-slate-400">
                      {ROLE_LABEL[e.role] ?? e.role} · {e.count} pago{e.count !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <span className="tabular-nums font-semibold text-emerald-600">{bs(e.total)}</span>
                </div>
                {e.pending > 0 && (
                  <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1">
                    <span className="text-xs text-slate-400">Pendiente</span>
                    <span className="tabular-nums text-xs font-medium text-amber-600">{bs(e.pending)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Filtros + tabla */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <PagosFilter
            employees={employees ?? []}
            selectedEmployee={selectedEmployee}
            selectedMonth={selectedMonth}
          />
          <PrintPagosButton rows={printRows} monthLabel={monthLabel} />
        </div>

        <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <div className="min-w-[52rem]">
            <div className={`${GRID} px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500`}>
              <span>Fecha</span>
              <span>Trabajador</span>
              <span>Rol</span>
              <span>Concepto</span>
              <span>Método</span>
              <span className="text-right">Monto</span>
              <span>Desembolso</span>
              <span />
            </div>
            <div className="divide-y divide-slate-100">
              {rows.map((p) => (
                <div key={p.id}>
                  {/* Fila principal del pago */}
                  <div
                    className={`${GRID} px-4 py-2.5 text-sm transition hover:bg-slate-50/70 ${p.works.length > 0 ? "" : "border-b border-slate-100 last:border-b-0"}`}
                  >
                    <div className="whitespace-nowrap tabular-nums text-xs text-slate-400">
                      <div>{fmtDate(p.paid_at)}</div>
                      <div className="text-slate-300">{fmtBoliviaTime(p.created_at)}</div>
                    </div>
                    <span className="truncate font-medium text-slate-700">
                      {p.employee?.full_name ?? "—"}
                    </span>
                    <span className="truncate text-slate-500 text-xs">
                      {ROLE_LABEL[p.employee?.role ?? ""] ?? p.employee?.role ?? "—"}
                    </span>
                    <span className="truncate text-slate-600">
                      {p.concept ?? <span className="text-slate-400">—</span>}
                    </span>
                    <span className="text-slate-500 whitespace-nowrap">
                      {METHOD_LABEL[p.method] ?? p.method}
                    </span>
                    <span className="text-right tabular-nums font-semibold text-emerald-600 whitespace-nowrap">
                      {bs(p.amount)}
                    </span>
                    <div>
                      <DisbursedToggle id={p.id} disbursed={p.disbursed} />
                    </div>
                    <div className="flex justify-end">
                      <DeletePaymentButton id={p.id} />
                    </div>
                  </div>

                  {/* Sub-filas: trabajos incluidos en este pago */}
                  {p.works.length > 0 && (
                    <div className="border-b border-slate-100 bg-slate-50/50 px-4 pb-2.5 last:border-b-0">
                      <div className="ml-[7.5rem] space-y-0.5">
                        {p.works.map((w, i) => {
                          const comm = w.commission_amount + w.lab_commission_amount;
                          return (
                            <div
                              key={i}
                              className="flex items-center gap-3 rounded px-2 py-1 text-xs text-slate-500"
                            >
                              <span className="w-10 shrink-0 tabular-nums text-slate-400">
                                {fmtShortDate(w.performed_at)}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-slate-600">
                                {w.description || "—"}
                              </span>
                              {w.patient_name && (
                                <span className="max-w-[8rem] truncate text-slate-400">
                                  {w.patient_name}
                                </span>
                              )}
                              <span className="tabular-nums font-medium text-clinic whitespace-nowrap">
                                {bs(comm)}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {rows.length === 0 && (
                <EmptyState
                  icon={<Receipt className="h-6 w-6" />}
                  title="Sin pagos en este período"
                  description="Ajusta el rango de fechas o registra un pago a personal."
                />
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
