"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addPatientPayment, type ActionState } from "@/app/(dashboard)/pacientes/history-actions";
import { setWorkDone } from "@/app/(dashboard)/pacientes/treatment-actions";
import { DoneToggle, type Work } from "@/components/treatments/TreatmentPlanPanel";
import { bs } from "@/lib/format";

export type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  note?: string | null;
  receivedAt: string; // ISO
};

export type ApptRow = {
  id: string;
  startsAt: string; // ISO
  dentistName: string | null;
  reason: string | null;
  status: string; // scheduled | finished | no_show
};

const initial: ActionState = {};

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  qr: "QR",
  // Métodos antiguos (ya no se ofrecen) — etiquetados para historial existente.
  card: "Tarjeta",
  transfer: "Transferencia",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function PatientHistoryPanel({
  patientId,
  canClinical,
  canBilling,
  works,
  payments,
  appointments,
  totalQuoted,
  totalPaid,
}: {
  patientId: string;
  canClinical: boolean;
  canBilling: boolean;
  works: Work[];
  payments: PaymentRow[];
  appointments: ApptRow[];
  totalQuoted: number;
  totalPaid: number;
}) {
  const saldo = totalQuoted - totalPaid;

  return (
    <div className="space-y-5">
      {/* Resumen financiero */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Total tratamiento" value={bs(totalQuoted)} />
        <SummaryCard label="Total pagado" value={bs(totalPaid)} tone="green" />
        <SummaryCard label="Saldo pendiente" value={bs(saldo)} tone={saldo > 0 ? "red" : "slate"} />
      </div>

      {/* Visitas / citas con doctor */}
      <div>
        <div className="mb-2 text-xs font-medium uppercase text-slate-400">
          Visitas
        </div>
        <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <div className="divide-y divide-slate-100">
            {appointments.map((a) => {
              const statusLabel =
                a.status === "finished"
                  ? { text: "Atendido", cls: "bg-emerald-100 text-emerald-700" }
                  : a.status === "no_show"
                    ? { text: "No vino", cls: "bg-red-100 text-red-700" }
                    : { text: "Programada", cls: "bg-slate-100 text-slate-600" };
              return (
                <div key={a.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="whitespace-nowrap tabular-nums text-xs text-slate-400">
                    {fmtDate(a.startsAt)}
                  </span>
                  <span className="font-medium text-slate-700">
                    {a.dentistName ?? <span className="text-slate-400">—</span>}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-slate-500">
                    {a.reason ?? <span className="text-slate-400">—</span>}
                  </span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusLabel.cls}`}>
                    {statusLabel.text}
                  </span>
                </div>
              );
            })}
            {appointments.length === 0 && (
              <p className="px-4 py-3 text-sm text-slate-500">Sin visitas registradas.</p>
            )}
          </div>
        </div>
      </div>

      {/* Trabajos del plan con estado ✓/✗ */}
      <div>
        <div className="mb-2 text-xs font-medium uppercase text-slate-400">
          Plan de tratamiento
        </div>
        <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <div className="divide-y divide-slate-100">
            {works.map((w) => (
              <WorkStatusRow
                key={w.id}
                work={w}
                patientId={patientId}
                canWrite={canClinical}
              />
            ))}
            {works.length === 0 && (
              <p className="px-4 py-3 text-sm text-slate-500">Sin trabajos registrados.</p>
            )}
          </div>
        </div>
      </div>

      {/* Pagos */}
      <div>
        <div className="mb-2 text-xs font-medium uppercase text-slate-400">Pagos</div>
        {canBilling && <PaymentForm patientId={patientId} />}
        <div className="mt-2 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <div className="divide-y divide-slate-100">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="tabular-nums text-slate-500">{fmtDate(p.receivedAt)}</span>
                <span className="min-w-0 flex-1 truncate text-slate-600">{p.note ?? "—"}</span>
                <span className="text-slate-500">{METHOD_LABEL[p.method] ?? p.method}</span>
                <span className="tabular-nums font-medium text-emerald-600">{bs(p.amount)}</span>
              </div>
            ))}
            {payments.length === 0 && (
              <p className="px-4 py-3 text-sm text-slate-500">Sin pagos registrados.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "green" | "red";
}) {
  const color =
    tone === "green" ? "text-emerald-600" : tone === "red" ? "text-red-600" : "text-slate-800";
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${color}`}>{value}</div>
    </div>
  );
}

function WorkStatusRow({
  work,
  patientId,
  canWrite,
}: {
  work: Work;
  patientId: string;
  canWrite: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <div className="min-w-0">
        <span className="font-medium">{work.name}</span>
        <span className="ml-2 text-xs text-slate-400">{bs(work.price)}</span>
      </div>
      <div className="flex items-center gap-3">
        <span className={`text-xs ${work.done ? "text-green-600" : "text-slate-400"}`}>
          {work.done ? "Realizado" : "Pendiente"}
        </span>
        <DoneToggle
          done={work.done}
          disabled={!canWrite || pending}
          onToggle={() =>
            start(async () => {
              const res = await setWorkDone(work.id, !work.done, patientId);
              if (res.error) alert(res.error);
              else router.refresh();
            })
          }
        />
      </div>
    </div>
  );
}

function PaymentForm({ patientId }: { patientId: string }) {
  const [state, formAction, pending] = useActionState(addPatientPayment, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
    >
      <input type="hidden" name="patient_id" value={patientId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-slate-500">Monto (Bs)</span>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            className="w-28 rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-slate-500">Método</span>
          <select
            name="method"
            defaultValue="cash"
            className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none"
          >
            <option value="cash">Efectivo</option>
            <option value="qr">QR</option>
          </select>
        </label>
        <label className="flex-1 text-xs">
          <span className="mb-1 block text-slate-500">Motivo de pago</span>
          <input
            ref={noteRef}
            name="note"
            type="text"
            maxLength={120}
            placeholder="ej. Adelanto, Pago endodoncia..."
            className="w-full min-w-[160px] rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
        >
          {pending ? "…" : "Registrar pago"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (noteRef.current) noteRef.current.value = "Adelanto";
            noteRef.current?.focus();
          }}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          + Adelanto
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
