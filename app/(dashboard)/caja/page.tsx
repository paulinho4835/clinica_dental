import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PaymentForm } from "@/components/caja/PaymentForm";
import { CashSessionPanel } from "@/components/caja/CashSessionPanel";
import { requireFeature } from "@/lib/guard";

export default async function CashPage() {
  await requireFeature("caja");
  const supabase = await createClient();
  const profile = await getProfile();

  const [{ data: payments }, { data: commissions }, { data: expenses }, { data: patients }, { data: openSession }] = await Promise.all([
    supabase.from("payments")
      .select("amount, method, kind, received_at, patients(full_name)")
      .order("received_at", { ascending: false }).limit(20),
    supabase.from("commissions")
      .select("amount, status, profiles(full_name)")
      .order("created_at", { ascending: false }).limit(20),
    supabase.from("expenses")
      .select("category, amount, spent_at, vendor")
      .order("spent_at", { ascending: false }).limit(20),
    supabase.from("patients").select("id, full_name").order("full_name"),
    supabase.from("cash_sessions")
      .select("id, opened_at, opening_float")
      .is("closed_at", null)
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const totalPay = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const totalComm = (commissions ?? []).filter((c) => c.status === "pending").reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Caja y finanzas</h1>

      {can(profile?.role, "billing:write") && (
        <>
          <CashSessionPanel session={openSession ?? null} />
          <PaymentForm patients={patients ?? []} />
        </>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label="Ingresos (últimos)" value={`$${totalPay.toFixed(2)}`} />
        <Stat label="Comisiones por pagar" value={`$${totalComm.toFixed(2)}`} />
      </div>

      <Section title="Pagos recientes">
        {payments?.map((p, i) => (
          <Row key={i}
            left={(p.patients as { full_name?: string } | null)?.full_name ?? "—"}
            mid={`${p.method} · ${p.kind}`}
            right={`$${Number(p.amount).toFixed(2)}`} />
        ))}
      </Section>

      <Section title="Comisiones de odontólogos">
        {commissions?.map((c, i) => (
          <Row key={i}
            left={(c.profiles as { full_name?: string } | null)?.full_name ?? "—"}
            mid={c.status}
            right={`$${Number(c.amount).toFixed(2)}`} />
        ))}
      </Section>

      <Section title="Gastos (solo admin)">
        {expenses?.map((e, i) => (
          <Row key={i} left={e.category} mid={e.vendor ?? "—"} right={`$${Number(e.amount).toFixed(2)}`} />
        ))}
        {!expenses?.length && <p className="px-1 py-2 text-sm text-slate-500">Sin gastos visibles (RLS: requiere rol admin).</p>}
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
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

function Row({ left, mid, right }: { left: string; mid: string; right: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-2 text-sm">
      <span className="font-medium">{left}</span>
      <span className="text-slate-500">{mid}</span>
      <span className="tabular-nums">{right}</span>
    </div>
  );
}
