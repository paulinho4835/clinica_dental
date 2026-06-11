import { Users, BarChart3, Banknote, TrendingUp, UserCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PaymentForm } from "@/components/caja/PaymentForm";
import { requireNavAccess } from "@/lib/guard";
import { bs, boliviaTodayISO } from "@/lib/format";
import { Stat } from "@/components/ui/Stat";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { DateFilter } from "@/components/caja/DateFilter";
import { DoctorFilter } from "@/components/caja/DoctorFilter";

export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; doctor?: string }>;
}) {
  await requireNavAccess("caja");
  const supabase = await createClient();
  const profile = await getProfile();
  const { date: dateParam, doctor: doctorParam } = await searchParams;

  // Inicio de hoy en Bolivia (UTC-4) expresado en UTC para filtrar la DB.
  const boliviaDate = boliviaTodayISO();
  const selectedDate = dateParam ?? boliviaDate;
  const isToday = selectedDate === boliviaDate;

  // Rango del día seleccionado en UTC (Bolivia = UTC-4, día inicia a las 04:00 UTC)
  const dayStartUTC = new Date(`${selectedDate}T04:00:00.000Z`);
  const dayEndUTC = new Date(dayStartUTC.getTime() + 24 * 60 * 60 * 1000);

  // Para los KPIs siempre usamos hoy
  const todayStartUTC = new Date(`${boliviaDate}T04:00:00.000Z`);
  const tomorrowStartUTC = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000);

  const [{ data: allDoctors }, { data: paymentsToday }, { data: patients }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name")
      .in("role", ["odontologo_general", "especialista", "admin"])
      .order("full_name"),
    supabase
      .from("payments")
      .select("amount, patient_id")
      .gte("received_at", todayStartUTC.toISOString())
      .lt("received_at", tomorrowStartUTC.toISOString()),
    supabase.from("patients").select("id, full_name, national_id").order("full_name"),
  ]);

  const doctors = allDoctors ?? [];

  // Pagos del día seleccionado, filtrados opcionalmente por doctor
  let paymentsQuery = supabase
    .from("payments")
    .select("amount, method, kind, note, received_at, doctor_id, commission_pct, patients(full_name), doctor:profiles!payments_doctor_id_fkey(full_name)")
    .gte("received_at", dayStartUTC.toISOString())
    .lt("received_at", dayEndUTC.toISOString())
    .order("received_at", { ascending: true });

  if (doctorParam) {
    paymentsQuery = paymentsQuery.eq("doctor_id", doctorParam);
  }

  const { data: payments } = await paymentsQuery;

  const selectedDoctor = doctorParam
    ? doctors.find((d) => d.id === doctorParam) ?? null
    : null;

  const totalPay = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const totalCommission = (payments ?? []).reduce((s, p) => s + (Number(p.amount) * (Number(p.commission_pct) || 0)) / 100, 0);
  const todayTotal = (paymentsToday ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const todayPatients = new Set((paymentsToday ?? []).map((p) => p.patient_id)).size;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Caja y finanzas"
        action={
          <ButtonLink href="/caja/dashboard">
            <BarChart3 className="h-4 w-4" /> Ver dashboard
          </ButtonLink>
        }
      />

      {can(profile?.role, "billing:write") && (
        <PaymentForm patients={patients ?? []} doctors={doctors} />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Pacientes hoy" value={String(todayPatients)} icon={<Users className="h-5 w-5" />} />
        <Stat label="Recaudado hoy" value={bs(todayTotal)} icon={<Banknote className="h-5 w-5" />} valueClassName="text-emerald-600" />
        <Stat label="Ingresos (últimos 20)" value={bs(totalPay)} icon={<TrendingUp className="h-5 w-5" />} valueClassName="text-clinic" />
      </div>

      <section>
        {/* Encabezado con título + filtros */}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-lg font-semibold">
              Pagos del {isToday ? "día" : selectedDate}
            </h2>
            {selectedDoctor && (
              <span className="flex items-center gap-1 rounded-full bg-clinic/10 px-2.5 py-0.5 text-xs font-medium text-clinic">
                <UserCircle className="h-3.5 w-3.5" />
                {selectedDoctor.full_name}
              </span>
            )}
            {totalPay > 0 && (
              <span className="text-base font-semibold tabular-nums text-emerald-600">
                {bs(totalPay)}
              </span>
            )}
          </div>

          {/* Controles de filtro: doctor + fecha */}
          <div className="flex flex-wrap items-center gap-2">
            <DoctorFilter doctors={doctors} selectedDoctorId={doctorParam ?? ""} />
            <DateFilter selectedDate={selectedDate} todayDate={boliviaDate} />
          </div>
        </div>

        <div className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <div className="min-w-[50rem]">
              <div className={`${PAY_GRID} px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500`}>
                <span>Hora</span>
                <span>Paciente</span>
                <span>Motivo de pago</span>
                <span>Doctor</span>
                <span className="text-right">Comisión</span>
                <span className="text-right">Monto</span>
              </div>
              {(payments ?? []).map((p, i) => (
                <PaymentRow
                  key={i}
                  receivedAt={p.received_at}
                  patient={(p.patients as { full_name?: string } | null)?.full_name ?? "—"}
                  note={(p as { note?: string | null }).note}
                  doctorName={(p.doctor as { full_name?: string } | null)?.full_name ?? null}
                  method={p.method}
                  commissionPct={Number(p.commission_pct || 0)}
                  amount={Number(p.amount)}
                />
              ))}
              {!payments?.length && (
                <p className="px-4 py-3 text-sm text-slate-500">
                  {selectedDoctor
                    ? `Sin pagos registrados para ${selectedDoctor.full_name} ${isToday ? "hoy" : `el ${selectedDate}`}.`
                    : `Sin pagos registrados ${isToday ? "hoy" : `el ${selectedDate}`}.`}
                </p>
              )}
            </div>
          </div>

          {/* Subtotal al pie, solo cuando hay registros */}
          {(payments ?? []).length > 0 && (
            <div className="flex items-center justify-between bg-slate-50 px-4 py-3 text-sm font-semibold">
              <span className="text-slate-500">
                {selectedDoctor ? `Subtotal — ${selectedDoctor.full_name}` : "Total del período"}
              </span>
              <div className="flex items-center gap-6">
                {selectedDoctor && (
                  <span className="text-slate-500">
                    Comisiones: <span className="text-clinic tabular-nums">{bs(totalCommission)}</span>
                  </span>
                )}
                <span className="tabular-nums text-emerald-700">Total: {bs(totalPay)}</span>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// Plantilla de columnas compartida: encabezado y filas usan los mismos anchos fijos.
const PAY_GRID = "grid grid-cols-[11rem_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_6rem_8rem] items-center gap-x-4";

const METHOD_LABEL: Record<string, string> = { cash: "Efectivo", qr: "QR", card: "Tarjeta", transfer: "Transf." };

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-BO", { timeZone: "America/La_Paz", hour: "2-digit", minute: "2-digit" });
}

function PaymentRow({ receivedAt, patient, note, doctorName, method, amount, commissionPct }: {
  receivedAt: string;
  patient: string;
  note?: string | null;
  doctorName?: string | null;
  method: string;
  amount: number;
  commissionPct: number;
}) {
  const commission = (amount * commissionPct) / 100;
  return (
    <div className={`${PAY_GRID} border-t border-slate-100 px-4 py-2.5 text-sm transition hover:bg-slate-50/70`}>
      <span className="whitespace-nowrap tabular-nums text-xs text-slate-400">{fmtTime(receivedAt)}</span>
      <span className="truncate font-medium">{patient}</span>
      <span className="truncate text-slate-600">{note ?? <span className="text-slate-400">—</span>}</span>
      <span className="truncate text-slate-600">{doctorName ?? <span className="text-slate-400">—</span>}</span>
      <div className="flex flex-col items-end leading-tight">
        {commission > 0 ? (
          <>
            <span className="tabular-nums font-medium text-clinic">{bs(commission)}</span>
            <span className="text-[10px] text-slate-400">{commissionPct}%</span>
          </>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </div>
      <div className="flex flex-col items-end leading-tight">
        <span className="tabular-nums font-medium">{bs(amount)}</span>
        <span className="text-xs text-slate-400">{METHOD_LABEL[method] ?? method}</span>
      </div>
    </div>
  );
}
