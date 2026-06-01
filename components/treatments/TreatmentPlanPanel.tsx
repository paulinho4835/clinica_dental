"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addPlanWork,
  deleteWork,
  type ActionState,
} from "@/app/(dashboard)/pacientes/treatment-actions";
import { bs } from "@/lib/format";

export type Work = {
  id: string;
  name: string;
  price: number;
  done: boolean;
  createdAt: string; // ISO
};

const initial: ActionState = {};

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function TreatmentPlanPanel({
  patientId,
  canWrite,
  works,
}: {
  patientId: string;
  canWrite: boolean;
  works: Work[];
}) {
  const total = works.reduce((s, w) => s + w.price, 0);

  return (
    <div className="space-y-4">
      {canWrite && <AddWorkForm patientId={patientId} />}

      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="hidden grid-cols-[10rem_1fr_7rem_2rem] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium uppercase text-slate-400 sm:grid">
          <span>Fecha</span>
          <span>Trabajo</span>
          <span className="text-right">Precio</span>
          <span />
        </div>
        <div className="divide-y divide-slate-100">
          {works.map((w) => (
            <WorkRow key={w.id} work={w} patientId={patientId} canWrite={canWrite} />
          ))}
          {works.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">Sin trabajos en el plan.</p>
          )}
        </div>
        {works.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{bs(total)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function WorkRow({
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
    <div className="grid grid-cols-2 items-center gap-3 px-4 py-2.5 text-sm sm:grid-cols-[10rem_1fr_7rem_2rem]">
      <span className="order-2 text-xs tabular-nums text-slate-400 sm:order-none sm:text-sm sm:text-slate-600">
        {fmtDateTime(work.createdAt)}
      </span>
      <span className="order-1 font-medium sm:order-none">{work.name}</span>
      <span className="order-3 text-right tabular-nums text-slate-600 sm:order-none">
        {bs(work.price)}
      </span>
      <div className="order-4 text-right sm:order-none">
        {canWrite && (
          <button
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (!confirm("¿Eliminar este trabajo?")) return;
                const res = await deleteWork(work.id, patientId);
                if (res.error) alert(res.error);
                else router.refresh();
              })
            }
            className="text-slate-300 hover:text-red-500"
            title="Eliminar"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// Checkbox de estado — verde con ✓ si realizado, rojo con ✗ si pendiente.
// Clic alterna el estado. Diseñado para leerse claramente como control interactivo.
export function DoneToggle({
  done,
  disabled,
  onToggle,
}: {
  done: boolean;
  disabled?: boolean;
  onToggle?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      title={done ? "Realizado — clic para marcar pendiente" : "Pendiente — clic para marcar realizado"}
      className={`flex h-8 w-8 items-center justify-center rounded-md text-base font-bold shadow-sm transition enabled:cursor-pointer enabled:hover:scale-105 disabled:opacity-60 ${
        done
          ? "bg-green-500 text-white ring-1 ring-green-600"
          : "border-2 border-red-300 bg-white text-red-500 hover:border-red-400"
      }`}
    >
      {done ? "✓" : "✗"}
    </button>
  );
}

function AddWorkForm({ patientId }: { patientId: string }) {
  const [state, formAction, pending] = useActionState(addPlanWork, initial);
  const formRef = useRef<HTMLFormElement>(null);
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
      className="flex flex-wrap items-end gap-2 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
    >
      <input type="hidden" name="patient_id" value={patientId} />
      <label className="flex-1 text-xs">
        <span className="mb-1 block text-slate-500">Trabajo a realizar</span>
        <input
          name="description"
          type="text"
          required
          placeholder="ej. Resina diente 16, limpieza, endodoncia…"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
        />
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-slate-500">Precio (Bs)</span>
        <input
          name="price"
          type="number"
          step="0.01"
          min="0"
          required
          placeholder="0.00"
          className="w-28 rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
      >
        {pending ? "…" : "Agregar"}
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
