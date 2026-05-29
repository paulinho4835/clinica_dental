"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addPlanItem,
  createPlan,
  setItemStatus,
  type ActionState,
} from "@/app/(dashboard)/pacientes/treatment-actions";

export type Procedure = { id: string; name: string; base_price: number };
export type Dentist = { id: string; full_name: string };
export type Item = {
  id: string;
  tooth_fdi: string | null;
  price: number;
  status: string;
  procedure: { name?: string } | null;
  dentist: { full_name?: string } | null;
};
export type Phase = { id: string; title: string; phase_no: number; items: Item[] };
export type Plan = { id: string; status: string; phases: Phase[] };

const STATUS_LABEL: Record<string, string> = {
  proposed: "Propuesto",
  approved: "Aprobado",
  in_progress: "En curso",
  done: "Realizado",
  cancelled: "Cancelado",
};

const initial: ActionState = {};

export function TreatmentPlanPanel({
  patientId,
  canWrite,
  plans,
  procedures,
  dentists,
}: {
  patientId: string;
  canWrite: boolean;
  plans: Plan[];
  procedures: Procedure[];
  dentists: Dentist[];
}) {
  const router = useRouter();
  const [creating, startCreate] = useTransition();

  return (
    <div className="space-y-4">
      {canWrite && (
        <button
          disabled={creating}
          onClick={() =>
            startCreate(async () => {
              const res = await createPlan(patientId);
              if (res.error) alert(res.error);
              else router.refresh();
            })
          }
          className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
        >
          + Nuevo plan de tratamiento
        </button>
      )}

      {plans.length === 0 && (
        <p className="text-sm text-slate-500">Sin planes de tratamiento.</p>
      )}

      {plans.map((plan) => {
        const total = plan.phases
          .flatMap((ph) => ph.items)
          .reduce((s, it) => s + Number(it.price), 0);
        const firstPhase = plan.phases[0];
        return (
          <div key={plan.id} className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">
                Plan · {STATUS_LABEL[plan.status] ?? plan.status}
              </span>
              <span className="text-sm tabular-nums text-slate-600">
                Total: ${total.toFixed(2)}
              </span>
            </div>

            {plan.phases.map((ph) => (
              <div key={ph.id} className="mb-3">
                <div className="mb-1 text-xs font-medium uppercase text-slate-400">
                  {ph.title}
                </div>
                <div className="divide-y divide-slate-100">
                  {ph.items.map((it) => (
                    <div key={it.id} className="flex items-center justify-between py-2 text-sm">
                      <div>
                        <span className="font-medium">{it.procedure?.name ?? "—"}</span>
                        {it.tooth_fdi && (
                          <span className="ml-2 text-xs text-slate-500">diente {it.tooth_fdi}</span>
                        )}
                        {it.dentist?.full_name && (
                          <span className="ml-2 text-xs text-slate-400">· {it.dentist.full_name}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="tabular-nums text-slate-600">${Number(it.price).toFixed(2)}</span>
                        <ItemStatus
                          id={it.id}
                          status={it.status}
                          patientId={patientId}
                          disabled={!canWrite}
                        />
                      </div>
                    </div>
                  ))}
                  {ph.items.length === 0 && (
                    <p className="py-2 text-xs text-slate-400">Sin procedimientos.</p>
                  )}
                </div>
              </div>
            ))}

            {canWrite && firstPhase && (
              <AddItemForm
                patientId={patientId}
                phaseId={firstPhase.id}
                procedures={procedures}
                dentists={dentists}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ItemStatus({
  id,
  status,
  patientId,
  disabled,
}: {
  id: string;
  status: string;
  patientId: string;
  disabled: boolean;
}) {
  const [value, setValue] = useState(status);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (disabled) {
    return <span className="text-xs text-slate-500">{STATUS_LABEL[value] ?? value}</span>;
  }

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        start(async () => {
          const res = await setItemStatus(id, next, patientId);
          if (res.error) {
            setValue(status);
            alert(res.error);
          } else {
            router.refresh();
          }
        });
      }}
      className="rounded border border-slate-300 px-2 py-1 text-xs focus:border-clinic focus:outline-none disabled:opacity-50"
    >
      {Object.entries(STATUS_LABEL).map(([v, l]) => (
        <option key={v} value={v}>{l}</option>
      ))}
    </select>
  );
}

function AddItemForm({
  patientId,
  phaseId,
  procedures,
  dentists,
}: {
  patientId: string;
  phaseId: string;
  procedures: Procedure[];
  dentists: Dentist[];
}) {
  const [state, formAction, pending] = useActionState(addPlanItem, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, router]);

  return (
    <form ref={formRef} action={formAction} className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
      <input type="hidden" name="patient_id" value={patientId} />
      <input type="hidden" name="phase_id" value={phaseId} />
      <label className="text-xs">
        <span className="mb-1 block text-slate-500">Procedimiento</span>
        <select name="procedure_id" required defaultValue=""
          data-procedures={JSON.stringify(procedures)}
          onChange={(e) => {
            const proc = procedures.find((p) => p.id === e.target.value);
            const priceInput = e.currentTarget.form?.elements.namedItem("price") as HTMLInputElement | null;
            if (proc && priceInput && !priceInput.value) priceInput.value = String(proc.base_price);
          }}
          className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-clinic focus:outline-none">
          <option value="" disabled>Seleccionar…</option>
          {procedures.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-slate-500">Diente (FDI)</span>
        <input name="tooth_fdi" type="text" placeholder="ej. 16"
          className="w-20 rounded border border-slate-300 px-2 py-1 text-sm focus:border-clinic focus:outline-none" />
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-slate-500">Precio</span>
        <input name="price" type="number" step="0.01" min="0" required
          className="w-24 rounded border border-slate-300 px-2 py-1 text-sm focus:border-clinic focus:outline-none" />
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-slate-500">Odontólogo</span>
        <select name="dentist_id" defaultValue=""
          className="rounded border border-slate-300 px-2 py-1 text-sm focus:border-clinic focus:outline-none">
          <option value="">— Ninguno —</option>
          {dentists.map((d) => (
            <option key={d.id} value={d.id}>{d.full_name}</option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending}
        className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
        {pending ? "…" : "Agregar"}
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
