import { Users, BarChart3, Banknote, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PaymentForm } from "@/components/caja/PaymentForm";
import { requireFeature } from "@/lib/guard";
import { bs } from "@/lib/format";
import { Stat } from "@/components/ui/Stat";
import { ButtonLink } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";

export default async function CashPage() {
  await requireFeature("caja");
  const supabase = await createClient();
  const profile = await getProfile();

  // Inicio de hoy en Bolivia (UTC-4) expresado en UTC para filtrar la DB.
  const boliviaDate = new Date().toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
  const todayStartUTC = new Date(`${boliviaDate}T04:00:00.000Z`);
  const tomorrowStartUTC = new Date(todayStartUTC.getTime() + 24 * 60 * 60 * 1000);

  const [{ data: payments }, { data: paymentsToday }, { data: patients }, { data: doctors }] = await Promise.all([
    supabase.from("payments")
      .select("amount, method, kind, note, received_at, patients(full_name), doctor:doctors(full_name)")
      .order("received_at", { ascending: false }).limit(20),
    supabase.from("payments")
      .select("amount, patient_id")
      .gte("received_at", todayStartUTC.toISOString())
      .lt("received_at", tomorrowStartUTC.toISOString()),
    supabase.from("patients").select("id, full_name, national_id").order("full_name"),
    supabase.from("doctors").select("id, full_name").eq("active", true).order("full_name"),
  ]);

  const totalPay = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
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
        <PaymentForm patients={patients ?? []} doctors={doctors ?? []} />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Pacientes hoy" value={String(todayPatients)} icon={<Users className="h-5 w-5" />} />
        <Stat label="Recaudado hoy" value={bs(todayTotal)} icon={<Banknote className="h-5 w-5" />} valueClassName="text-emerald-600" />
        <Stat label="Ingresos (últimos 20)" value={bs(totalPay)} icon={<TrendingUp className="h-5 w-5" />} valueClassName="text-clinic" />
      </div>

      <Section title="Pagos recientes">
        <div className="overflow-x-auto">
          <div className="min-w-[44rem]">
            <div className={`${PAY_GRID} px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500`}>
              <span>Fecha</span>
              <span>Paciente</span>
              <span>Motivo de pago</span>
              <span>Doctor</span>
              <span className="text-right">Monto</span>
            </div>
            {[...(payments ?? [])].reverse().map((p, i) => (
              <PaymentRow
                key={i}
                receivedAt={p.received_at}
                patient={(p.patients as { full_name?: string } | null)?.full_name ?? "—"}
                note={(p as { note?: string | null }).note}
                doctorName={(p.doctor as { full_name?: string } | null)?.full_name ?? null}
                method={p.method}
                amount={Number(p.amount)}
              />
            ))}
            {!payments?.length && (
              <p className="px-4 py-3 text-sm text-slate-500">Sin pagos registrados.</p>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-lg font-semibold">{title}</h2>
      <div className="divide-y divide-slate-100 rounded-lg bg-white shadow-sm ring-1 ring-slate-200">{children}</div>
    </section>
  );
}


// Plantilla de columnas compartida: encabezado y filas usan los mismos anchos fijos
// para que todo quede alineado (Fecha · Paciente · Motivo · Monto).
const PAY_GRID = "grid grid-cols-[11rem_minmax(0,1fr)_minmax(0,1.2fr)_minmax(0,1fr)_8rem] items-center gap-x-4";

const METHOD_LABEL: Record<string, string> = { cash: "Efectivo", qr: "QR", card: "Tarjeta", transfer: "Transf." };

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString("es-BO", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function PaymentRow({ receivedAt, patient, note, doctorName, method, amount }: {
  receivedAt: string;
  patient: string;
  note?: string | null;
  doctorName?: string | null;
  method: string;
  amount: number;
}) {
  return (
    <div className={`${PAY_GRID} border-t border-slate-100 px-4 py-2.5 text-sm transition hover:bg-slate-50/70`}>
      <span className="whitespace-nowrap tabular-nums text-xs text-slate-400">{fmtDate(receivedAt)}</span>
      <span className="truncate font-medium">{patient}</span>
      <span className="truncate text-slate-600">{note ?? <span className="text-slate-400">—</span>}</span>
      <span className="truncate text-slate-600">{doctorName ?? <span className="text-slate-400">—</span>}</span>
      <div className="flex flex-col items-end leading-tight">
        <span className="tabular-nums font-medium">{bs(amount)}</span>
        <span className="text-xs text-slate-400">{METHOD_LABEL[method] ?? method}</span>
      </div>
    </div>
  );
}
