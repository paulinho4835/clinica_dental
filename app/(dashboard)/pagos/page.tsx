import { requireNavAccess } from "@/lib/guard";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { getPlatformAdminIds } from "@/lib/platformAdmins";
import { boliviaTodayISO, bs } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Stat } from "@/components/ui/Stat";
import { Banknote, Receipt } from "lucide-react";
import { StaffPaymentForm } from "@/components/pagos/StaffPaymentForm";
import { PagosFilter } from "@/components/pagos/PagosFilter";
import { DeletePaymentButton } from "@/components/pagos/DeletePaymentButton";
import { DisbursedToggle } from "@/components/pagos/DisbursedToggle";

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
  asistente: "Asistente",
};

const GRID =
  "grid grid-cols-[7rem_minmax(0,1fr)_7rem_minmax(0,1.2fr)_7rem_8rem_8rem_2.5rem] items-center gap-x-4";

type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  concept: string | null;
  paid_at: string;
  disbursed: boolean;
  employee: { id: string; full_name: string; role: string } | null;
};

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
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

  // Rango de fechas del mes seleccionado (solo si no es "todos").
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
      "id, amount, method, concept, paid_at, disbursed, employee:profiles!staff_payments_employee_id_fkey(id, full_name, role)",
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

  const rows: PaymentRow[] = (rawPayments ?? []).map((p) => ({
    id: p.id as string,
    amount: Number(p.amount),
    method: p.method as string,
    concept: p.concept as string | null,
    paid_at: p.paid_at as string,
    disbursed: Boolean(p.disbursed),
    employee: (Array.isArray(p.employee) ? p.employee[0] : p.employee) as { id: string; full_name: string; role: string } | null,
  }));

  const totalMonth = rows.filter((p) => p.disbursed).reduce((s, p) => s + p.amount, 0);
  const totalPending = rows.filter((p) => !p.disbursed).reduce((s, p) => s + p.amount, 0);

  // Resumen por empleado — solo pagos desembolsados (útil para detectar pagos duplicados).
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
        <PagosFilter
          employees={employees ?? []}
          selectedEmployee={selectedEmployee}
          selectedMonth={selectedMonth}
        />

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
                <div
                  key={p.id}
                  className={`${GRID} border-t border-slate-100 px-4 py-2.5 text-sm transition hover:bg-slate-50/70`}
                >
                  <span className="whitespace-nowrap tabular-nums text-xs text-slate-400">
                    {fmtDate(p.paid_at)}
                  </span>
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
              ))}
              {rows.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  Sin pagos registrados para este período.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
