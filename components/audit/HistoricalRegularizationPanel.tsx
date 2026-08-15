"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Link2, Plus, Trash2 } from "lucide-react";
import { regularizeHistoricalWork } from "@/app/(dashboard)/auditoria/regularization-actions";
import { BOLIVIA_TZ, money } from "@/lib/format";
import { toast } from "@/lib/toast";

export type HistoricalWorkRow = {
  id: string; patientId: string; patientName: string; doctorName: string;
  description: string; cost: number; performedAt: string;
  commissionBlocked: boolean;
  planItems: Array<{ id: string; name: string; price: number }>;
  payments: Array<{ id: string; amount: number; receivedAt: string }>;
};

function clinicDate(value: string): string {
  return new Date(value).toLocaleDateString("es-BO", { timeZone: BOLIVIA_TZ });
}

export function HistoricalRegularizationPanel({ rows, currency }: { rows: HistoricalWorkRow[]; currency: string }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [mode, setMode] = useState<"link" | "create" | "delete_duplicate">("link");
  const [isPending, startTransition] = useTransition();
  const filtered = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("es");
    return q ? rows.filter((r) => `${r.patientName} ${r.description} ${r.doctorName}`.toLocaleLowerCase("es").includes(q)) : rows;
  }, [query, rows]);

  function submit(row: HistoricalWorkRow, form: HTMLFormElement) {
    const fd = new FormData(form);
    const reason = String(fd.get("reason") ?? "");
    const paymentId = String(fd.get("paymentId") ?? "") || null;
    if (mode === "delete_duplicate" && !window.confirm("Se eliminara el registro duplicado. El evento quedara en auditoria. ¿Continuar?")) return;
    const input = mode === "link"
      ? { action: mode, patientId: row.patientId, workId: row.id, treatmentItemId: String(fd.get("treatmentItemId") ?? ""), paymentId, reason } as const
      : mode === "create"
        ? { action: mode, patientId: row.patientId, workId: row.id, name: String(fd.get("name") ?? ""), price: Number(fd.get("price")), paymentId, reason } as const
        : { action: mode, patientId: row.patientId, workId: row.id, reason } as const;
    startTransition(async () => {
      const result = await regularizeHistoricalWork(input);
      if (result.error) return toast(result.error, "error");
      toast("Registro historico regularizado", "success");
      setOpenId(null);
      router.refresh();
    });
  }

  return (
    <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-slate-900"><AlertTriangle className="h-5 w-5 text-amber-600" /> Regularizacion historica</h2>
          <p className="mt-1 text-sm text-slate-600">{rows.length} trabajos sin plan. Sus costos son referencia y no forman parte del saldo hasta ser aprobados.</p>
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar paciente o trabajo..." className="w-72 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm" />
      </div>
      {filtered.length === 0 ? <p className="rounded-lg bg-white p-4 text-sm text-slate-500">No hay registros pendientes.</p> : (
        <div className="space-y-2">
          {filtered.map((row) => (
            <article key={row.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <Link href={`/pacientes/${row.patientId}`} className="font-semibold text-clinic hover:underline">{row.patientName}</Link>
                  <div className="font-medium text-slate-800">{row.description}</div>
                  <div className="text-xs text-slate-500">{clinicDate(row.performedAt)} · {row.doctorName} · referencia {money(row.cost, currency)}</div>
                </div>
                <button onClick={() => setOpenId(openId === row.id ? null : row.id)} className="rounded-md bg-clinic px-3 py-2 font-medium text-white">{openId === row.id ? "Cerrar" : "Resolver"}</button>
              </div>
              {openId === row.id && (
                <form className="mt-3 space-y-3 border-t pt-3" onSubmit={(e) => { e.preventDefault(); submit(row, e.currentTarget); }}>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => setMode("link")} className={`rounded-md px-3 py-2 ${mode === "link" ? "bg-slate-900 text-white" : "bg-slate-100"}`}><Link2 className="mr-1 inline h-4 w-4" />Vincular al plan</button>
                    <button type="button" onClick={() => setMode("create")} className={`rounded-md px-3 py-2 ${mode === "create" ? "bg-slate-900 text-white" : "bg-slate-100"}`}><Plus className="mr-1 inline h-4 w-4" />Crear item aprobado</button>
                    <button type="button" disabled={row.commissionBlocked} onClick={() => setMode("delete_duplicate")} className={`rounded-md px-3 py-2 disabled:opacity-40 ${mode === "delete_duplicate" ? "bg-red-600 text-white" : "bg-red-50 text-red-700"}`}><Trash2 className="mr-1 inline h-4 w-4" />Eliminar duplicado</button>
                  </div>
                  {mode === "link" && <select name="treatmentItemId" required className="w-full rounded-md border px-3 py-2"><option value="">Selecciona un item existente...</option>{row.planItems.map((i) => <option key={i.id} value={i.id}>{i.name} — {money(i.price, currency)}</option>)}</select>}
                  {mode === "create" && <div className="grid gap-2 sm:grid-cols-[1fr_10rem]"><input name="name" required defaultValue={row.description} className="rounded-md border px-3 py-2" /><input name="price" required min="0" step="0.01" type="number" defaultValue={row.cost} className="rounded-md border px-3 py-2" /></div>}
                  {mode !== "delete_duplicate" && row.payments.length > 0 && <select name="paymentId" className="w-full rounded-md border px-3 py-2"><option value="">No vincular pago automaticamente</option>{row.payments.map((p) => <option key={p.id} value={p.id}>{clinicDate(p.receivedAt)} — {money(p.amount, currency)}</option>)}</select>}
                  <textarea name="reason" required minLength={5} placeholder="Motivo y evidencia de la decision..." className="min-h-20 w-full rounded-md border px-3 py-2" />
                  {row.commissionBlocked && <p className="text-xs font-medium text-red-600">Tiene comision abonada: no puede eliminarse hasta revertir el pago al doctor.</p>}
                  <button disabled={isPending || (mode === "link" && row.planItems.length === 0)} className="rounded-md bg-clinic px-4 py-2 font-medium text-white disabled:opacity-50">{isPending ? "Guardando..." : "Confirmar regularizacion"}</button>
                </form>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
