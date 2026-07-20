"use client";

import { useActionState, useEffect, useRef, useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import {
  addPatientPayment,
  deletePatientPayment,
  updatePatientPayment,
  type ActionState,
} from "@/app/(dashboard)/pacientes/history-actions";
import { Modal } from "@/components/ui/Modal";
import { setWorkDone } from "@/app/(dashboard)/pacientes/treatment-actions";
import { DoneToggle, type Work, type Dentist } from "@/components/treatments/TreatmentPlanPanel";
import { TreatmentProgressBar } from "@/components/treatments/TreatmentProgressBar";
import { Badge } from "@/components/ui/Badge";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/toast";
import { money } from "@/lib/format";
import type { PlanItemRow } from "@/lib/treatments/planItems";

export type PaymentRow = {
  id: string;
  amount: number;
  method: string;
  note?: string | null;
  receivedAt: string; // ISO
  doctorName?: string | null;
  collectedByName?: string | null;
};

export type WorkDebtRow = {
  id: string;
  description: string;
  cost: number;
  performedAt: string; // date string YYYY-MM-DD
  doctorName: string | null;
};

export type ApptRow = {
  id: string;
  startsAt: string; // ISO
  dentistName: string | null;
  reason: string | null;
  status: string; // scheduled | finished | no_show
};

type Recepcionista = { id: string; full_name: string };

const initial: ActionState = {};

const PAY_GRID = "grid grid-cols-[10rem_minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,0.8fr)_6rem_7rem] items-center gap-x-3";

const METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  qr: "QR",
  card: "Tarjeta",
  transfer: "Transferencia",
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleString("es-BO", {
    timeZone: "America/La_Paz",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const fmtDay = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });

export function VisitasPanel({ appointments }: { appointments: ApptRow[] }) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <div className="divide-y divide-slate-100">
        {appointments.map((a) => {
          const statusLabel =
            a.status === "finished"
              ? { text: "Atendido", tone: "success" as const }
              : a.status === "no_show"
                ? { text: "No vino", tone: "danger" as const }
                : { text: "Programada", tone: "neutral" as const };
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
              <Badge tone={statusLabel.tone}>{statusLabel.text}</Badge>
            </div>
          );
        })}
        {appointments.length === 0 && (
          <p className="px-4 py-3 text-sm text-slate-500">Sin visitas registradas.</p>
        )}
      </div>
    </div>
  );
}

export function WorkStatusPanel({
  patientId,
  canWrite,
  works,
  currency,
}: {
  patientId: string;
  canWrite: boolean;
  works: Work[];
  currency: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <div className="divide-y divide-slate-100">
        {works.map((w) => (
          <WorkStatusRow key={w.id} work={w} patientId={patientId} canWrite={canWrite} currency={currency} />
        ))}
        {works.length === 0 && (
          <p className="px-4 py-3 text-sm text-slate-500">Sin trabajos registrados.</p>
        )}
      </div>
    </div>
  );
}

const METHOD_FILTERS = [
  { value: "", label: "Todos" },
  { value: "cash", label: "Efectivo" },
  { value: "qr", label: "QR" },
  { value: "card", label: "Tarjeta" },
];

export function PatientHistoryPanel({
  patientId,
  canBilling,
  canManagePayments = false,
  payments,
  works,
  planItems = [],
  doctors,
  recepcionistas,
  totalQuoted,
  totalPaid,
  currency,
}: {
  patientId: string;
  canBilling: boolean;
  canManagePayments?: boolean;
  payments: PaymentRow[];
  works?: WorkDebtRow[];
  // Tratamientos del plan con su progreso de pago (misma fuente que Pagos a
  // personal usa para la comisión del doctor: treatment_items + payments).
  planItems?: PlanItemRow[];
  doctors: Dentist[];
  recepcionistas?: Recepcionista[];
  totalQuoted: number;
  totalPaid: number;
  currency: string;
}) {
  const saldo = totalQuoted - totalPaid;
  const [methodFilter, setMethodFilter] = useState<string>("");
  const [showWorks, setShowWorks] = useState(false);

  const visiblePayments = methodFilter
    ? payments.filter((p) => p.method === methodFilter)
    : payments;

  return (
    <div className="space-y-5">
      {/* Resumen financiero */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Total facturado" value={money(totalQuoted, currency)} />
        <SummaryCard label="Total pagado" value={money(totalPaid, currency)} tone="green" />
        <SummaryCard label="Saldo pendiente" value={money(saldo, currency)} tone={saldo > 0 ? "red" : "slate"} />
      </div>

      {/* Tratamientos y progreso de pago — misma barra y mismos números que
          Pagos a personal, para que ambos módulos coincidan siempre. */}
      {planItems.length > 0 && (
        <div>
          <span className="mb-2 block text-xs font-medium uppercase text-slate-400">
            Tratamientos
          </span>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
            {planItems.map((item) => (
              <div key={item.id} className="flex flex-col gap-1 px-4 py-2.5 text-sm">
                <div className="flex items-center gap-3">
                  <span className="min-w-0 flex-1 truncate text-slate-700">{item.name}</span>
                  {item.doctorName && (
                    <span className="hidden truncate text-xs text-slate-400 sm:block">
                      {item.doctorName}
                    </span>
                  )}
                </div>
                <TreatmentProgressBar paid={item.paidAmount} total={item.price} size="md" currency={currency} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trabajos realizados (deuda) */}
      {works && works.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowWorks((v) => !v)}
            className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase text-slate-400 hover:text-slate-600"
          >
            <span>{showWorks ? "▼" : "▶"}</span>
            Trabajos registrados ({works.length}) — detalle de lo facturado
          </button>
          {showWorks && (
            <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
              <div className="divide-y divide-slate-100">
                {works.map((w) => (
                  <div key={w.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                    <span className="w-24 shrink-0 whitespace-nowrap tabular-nums text-xs text-slate-400">
                      {fmtDay(w.performedAt)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-slate-700">{w.description}</span>
                    {w.doctorName && (
                      <span className="hidden truncate text-xs text-slate-400 sm:block">{w.doctorName}</span>
                    )}
                    <span className="shrink-0 tabular-nums font-medium text-slate-800">{money(w.cost, currency)}</span>
                  </div>
                ))}
              </div>
              <div className="flex justify-end border-t border-slate-100 px-4 py-2.5">
                <span className="text-xs text-slate-500">
                  Total facturado: <span className="font-semibold text-slate-800">{money(totalQuoted, currency)}</span>
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pagos recibidos */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium uppercase text-slate-400">Pagos recibidos</span>
          <div className="flex gap-1">
            {METHOD_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setMethodFilter(f.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  methodFilter === f.value
                    ? "bg-clinic text-white"
                    : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {canBilling && (
          <PaymentForm
            patientId={patientId}
            doctors={doctors}
            recepcionistas={recepcionistas}
            planItems={planItems}
            currency={currency}
          />
        )}
        <div className="mt-2 overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <div className="min-w-[44rem]">
              <div className={`${PAY_GRID} px-4 py-2 text-xs font-medium uppercase tracking-wide text-slate-500`}>
                <span>Fecha</span>
                <span>Concepto</span>
                <span>Doctor</span>
                <span>Cobrado por</span>
                <span>Método</span>
                <span className="text-right">Monto</span>
              </div>
              <div className="divide-y divide-slate-100">
                {visiblePayments.map((p) => (
                  <div key={p.id} className={`${PAY_GRID} border-t border-slate-100 px-4 py-2.5 text-sm transition hover:bg-slate-50/70`}>
                    <span className="whitespace-nowrap tabular-nums text-xs text-slate-400">{fmtDate(p.receivedAt)}</span>
                    <span className="truncate text-slate-600">{p.note ?? <span className="text-slate-400">—</span>}</span>
                    <span className="truncate text-slate-600">{p.doctorName ?? <span className="text-slate-400">—</span>}</span>
                    <span className="truncate text-slate-500">{p.collectedByName ?? <span className="text-slate-400">—</span>}</span>
                    <span className="text-slate-500 whitespace-nowrap">{METHOD_LABEL[p.method] ?? p.method}</span>
                    <span className="flex items-center justify-end gap-1 whitespace-nowrap">
                      <span className="tabular-nums font-medium text-emerald-600">{money(p.amount, currency)}</span>
                      {canManagePayments && (
                        <>
                          <EditPaymentRowButton payment={p} />
                          <DeletePaymentRowButton id={p.id} amount={p.amount} currency={currency} />
                        </>
                      )}
                    </span>
                  </div>
                ))}
                {visiblePayments.length === 0 && (
                  <p className="px-4 py-3 text-sm text-slate-500">
                    {methodFilter ? `Sin pagos con ${METHOD_LABEL[methodFilter]}.` : "Sin pagos registrados."}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Corrección de un pago mal registrado (solo admin): monto, método, concepto
// y fecha. El doctor NO se edita aquí a propósito — su comisión vive en Mis
// trabajos sin vínculo con el pago; cambiarlo aquí solo desincronizaría ambos.
function EditPaymentRowButton({ payment }: { payment: PaymentRow }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  // Fecha original del pago en Bolivia (YYYY-MM-DD) para el input date.
  const originalDate = new Date(payment.receivedAt).toLocaleDateString("en-CA", {
    timeZone: "America/La_Paz",
  });

  const [amount, setAmount] = useState(String(payment.amount));
  const [method, setMethod] = useState(payment.method);
  const [note, setNote] = useState(payment.note ?? "");
  const [date, setDate] = useState(originalDate);
  const router = useRouter();

  function reset() {
    setAmount(String(payment.amount));
    setMethod(payment.method);
    setNote(payment.note ?? "");
    setDate(originalDate);
  }

  function save() {
    start(async () => {
      const res = await updatePatientPayment(payment.id, {
        amount,
        method,
        note: note || null,
        // Solo mandar la fecha si el admin la cambió: así no se pierde la
        // hora original del pago cuando la fecha quedó igual.
        received_date: date !== originalDate ? date : null,
      });
      if (res.error) {
        toast(res.error, "error");
        return;
      }
      setOpen(false);
      router.refresh();
      if (res.warning) toast(res.warning, "info");
      else toast("Pago actualizado", "success");
    });
  }

  const inputCls =
    "w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic";

  return (
    <>
      <button
        type="button"
        onClick={() => { reset(); setOpen(true); }}
        aria-label="Editar pago"
        title="Editar pago"
        className="rounded-md p-1 text-slate-300 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Editar pago"
        subtitle="El cambio quedará registrado en Auditoría."
        size="sm"
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs">
              <span className="mb-1 block text-slate-500">Monto (Bs)</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={inputCls}
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-slate-500">Método</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className={inputCls}
              >
                <option value="cash">Efectivo</option>
                <option value="qr">QR</option>
                <option value="card">Tarjeta</option>
                {payment.method === "transfer" && (
                  <option value="transfer">Transferencia</option>
                )}
              </select>
            </label>
          </div>
          <label className="block text-xs">
            <span className="mb-1 block text-slate-500">Fecha del pago</span>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={inputCls}
            />
          </label>
          <label className="block text-xs">
            <span className="mb-1 block text-slate-500">Concepto</span>
            <input
              type="text"
              maxLength={120}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ej. Cuota ortodoncia…"
              className={inputCls}
            />
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-600 hover:bg-slate-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={pending || !amount || Number(amount) <= 0}
              className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function DeletePaymentRowButton({ id, amount, currency }: { id: string; amount: number; currency: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  async function handle() {
    const ok = await confirm({
      title: "Eliminar pago",
      message: `¿Eliminar el pago de ${money(amount, currency)}? Se descontará del total pagado del paciente. No se puede deshacer.`,
      confirmText: "Sí, eliminar",
      cancelText: "Volver",
      tone: "danger",
    });
    if (!ok) return;
    start(async () => {
      const res = await deletePatientPayment(id);
      if (res.error) {
        toast(res.error, "error");
        return;
      }
      router.refresh();
      if (res.warning) toast(res.warning, "info");
      else toast("Pago eliminado", "success");
    });
  }

  return (
    <button
      type="button"
      onClick={handle}
      disabled={pending}
      aria-label="Eliminar pago"
      title="Eliminar pago"
      className="rounded-md p-1 text-slate-300 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
    >
      <Trash2 className="h-3.5 w-3.5" />
    </button>
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
  currency,
}: {
  work: Work;
  patientId: string;
  canWrite: boolean;
  currency: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-sm">
      <div className="min-w-0">
        <span className="font-medium">{work.name}</span>
        <span className="ml-2 text-xs text-slate-400">{money(work.price, currency)}</span>
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

function PaymentForm({
  patientId,
  doctors,
  recepcionistas,
  planItems,
  currency,
}: {
  patientId: string;
  doctors: Dentist[];
  recepcionistas?: Recepcionista[];
  // Tratamientos del plan (precio/pagado), ya cargados por el Server Component
  // padre — evita un segundo fetch al mismo endpoint que usa /pagos.
  planItems: PlanItemRow[];
  currency: string;
}) {
  const [state, formAction, pending] = useActionState(addPatientPayment, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const noteRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [amount, setAmount] = useState("");
  const [pct, setPct] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [collectedById, setCollectedById] = useState("");
  const [itemId, setItemId] = useState("");

  const amountN = Number(amount) || 0;
  const pctN = Number(pct) || 0;
  const commission = Math.round(amountN * pctN) / 100;

  const hasRecepcionistas = recepcionistas && recepcionistas.length > 0;

  // Fecha de hoy en formato YYYY-MM-DD para el default del input date
  const today = new Date().toLocaleDateString("en-CA"); // en-CA da YYYY-MM-DD

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setAmount("");
      setPct("");
      setDoctorId("");
      setCollectedById("");
      setItemId("");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
    >
      <input type="hidden" name="patient_id" value={patientId} />
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="mb-1 block text-slate-500">Fecha del pago</span>
          <input
            name="received_at"
            type="date"
            defaultValue={today}
            required
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-slate-500">Monto (Bs)</span>
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0.01"
            required
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </label>
        <label className="text-xs">
          <span className="mb-1 block text-slate-500">Método</span>
          <select
            name="method"
            defaultValue="cash"
            className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none"
          >
            <option value="cash">Efectivo</option>
            <option value="qr">QR</option>
            <option value="card">Tarjeta</option>
          </select>
        </label>

        {doctors.length > 0 && (
          <label className="text-xs">
            <span className="mb-1 block text-slate-500">Doctor (opcional)</span>
            <select
              name="doctor_id"
              value={doctorId}
              onChange={(e) => { setDoctorId(e.target.value); if (!e.target.value) setPct(""); }}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none"
            >
              <option value="">— Sin asignar —</option>
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>{d.full_name}</option>
              ))}
            </select>
          </label>
        )}
        {!doctorId && <input type="hidden" name="commission_pct" value="0" />}
        {doctorId && (
          <label className="text-xs">
            <span className="mb-1 block text-slate-500">Comisión (%)</span>
            <input
              name="commission_pct"
              type="number"
              step="0.1"
              min="0"
              max="100"
              placeholder="ej. 40"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="w-20 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
            />
          </label>
        )}

        {hasRecepcionistas && (
          <label className="text-xs">
            <span className="mb-1 block text-slate-500">Cobrado por *</span>
            <select
              name="collected_by_id"
              required
              value={collectedById}
              onChange={(e) => setCollectedById(e.target.value)}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none"
            >
              <option value="">— Selecciona recepcionista —</option>
              {recepcionistas!.map((r) => (
                <option key={r.id} value={r.id}>{r.full_name}</option>
              ))}
            </select>
          </label>
        )}

        {planItems.length > 0 && (
          <label className="text-xs">
            <span className="mb-1 block text-slate-500">Aplicar a tratamiento (opcional)</span>
            <select
              name="treatment_item_id"
              value={itemId}
              onChange={(e) => {
                const id = e.target.value;
                setItemId(id);
                const item = planItems.find((p) => p.id === id);
                if (item) {
                  const restante = Math.max(0, item.price - item.paidAmount);
                  if (!amount && restante > 0) setAmount(String(restante));
                  if (noteRef.current && !noteRef.current.value) noteRef.current.value = item.name;
                }
              }}
              className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none"
            >
              <option value="">— Sin asignar —</option>
              {planItems.map((p) => {
                const restante = Math.max(0, p.price - p.paidAmount);
                return (
                  <option key={p.id} value={p.id}>
                    {p.name} {restante > 0 ? `(debe ${money(restante, currency)})` : "(saldado)"}
                  </option>
                );
              })}
            </select>
          </label>
        )}

        <label className="flex-1 text-xs">
          <span className="mb-1 block text-slate-500">Concepto del pago</span>
          <input
            ref={noteRef}
            name="note"
            type="text"
            maxLength={120}
            placeholder="ej. Cuota ortodoncia, Adelanto endodoncia…"
            className="w-full min-w-[180px] rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </label>
      </div>
      {doctorId && pctN > 0 && amountN > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-clinic/5 px-3 py-2 text-sm ring-1 ring-clinic/20">
          <span className="text-slate-500">Comisión del doctor ({pctN}% de {money(amountN, currency)}):</span>
          <span className="font-semibold text-clinic tabular-nums">{money(commission, currency)}</span>
          <span className="ml-auto text-xs text-slate-400">Se registrará en Mis trabajos</span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="submit"
          disabled={pending || (hasRecepcionistas && !collectedById)}
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
        <button
          type="button"
          onClick={() => {
            if (noteRef.current) noteRef.current.value = "Cuota";
            noteRef.current?.focus();
          }}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          + Cuota
        </button>
      </div>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
