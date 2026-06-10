"use client";

import { useActionState, useEffect, useRef, useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addPlanWork,
  deleteWork,
  type ActionState,
} from "@/app/(dashboard)/pacientes/treatment-actions";
import { bs } from "@/lib/format";

export type Dentist = { id: string; full_name: string };

export type Work = {
  id: string;
  name: string;
  price: number;
  done: boolean;
  createdAt: string; // ISO
  dentistId?: string | null;
  dentistName?: string | null;
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
  dentists,
  recetasEnabled,
}: {
  patientId: string;
  canWrite: boolean;
  works: Work[];
  dentists: Dentist[];
  recetasEnabled?: boolean;
}) {
  const total = works.reduce((s, w) => s + w.price, 0);

  return (
    <div className="space-y-4">
      {canWrite && <AddWorkForm patientId={patientId} dentists={dentists} />}

      {recetasEnabled && (
        <div className="flex items-center justify-end">
          <a
            href={`/pacientes/${patientId}/imprimir`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/>
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Presupuesto
          </a>
        </div>
      )}

      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="hidden grid-cols-[10rem_1fr_9rem_7rem_2rem] gap-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium uppercase text-slate-400 sm:grid">
          <span>Fecha</span>
          <span>Trabajo</span>
          <span>Doctor</span>
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
    <div className="grid grid-cols-2 items-center gap-3 px-4 py-2.5 text-sm sm:grid-cols-[10rem_1fr_9rem_7rem_2rem]">
      <span className="order-2 text-xs tabular-nums text-slate-400 sm:order-none sm:text-sm sm:text-slate-600">
        {fmtDateTime(work.createdAt)}
      </span>
      <span className="order-1 font-medium sm:order-none">{work.name}</span>
      <span className="order-3 truncate text-slate-500 sm:order-none">
        {work.dentistName ?? <span className="text-slate-300">—</span>}
      </span>
      <span className="order-4 text-right tabular-nums text-slate-600 sm:order-none">
        {bs(work.price)}
      </span>
      <div className="order-5 text-right sm:order-none">
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

function AddWorkForm({ patientId, dentists }: { patientId: string; dentists: Dentist[] }) {
  const [state, formAction, pending] = useActionState(addPlanWork, initial);
  const router = useRouter();

  // Controlled fields — description and price reset on success; doctor persists.
  const [descVal, setDescVal] = useState("");
  const [priceVal, setPriceVal] = useState("");
  const [doctorId, setDoctorId] = useState("");

  useEffect(() => {
    if (state.ok) {
      // Clear only work description and price; keep doctor selected.
      setDescVal("");
      setPriceVal("");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
    >
      <input type="hidden" name="patient_id" value={patientId} />
      <label className="flex-1 text-xs" style={{ minWidth: "160px" }}>
        <span className="mb-1 block text-slate-500">Trabajo a realizar</span>
        <input
          name="description"
          type="text"
          required
          value={descVal}
          onChange={(e) => setDescVal(e.target.value)}
          placeholder="ej. Resina diente 16, limpieza, endodoncia…"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
        />
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-slate-500">Doctor</span>
        <select
          name="doctor_id"
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
          className="rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none"
        >
          <option value="">— Sin asignar —</option>
          {dentists.map((d) => (
            <option key={d.id} value={d.id}>{d.full_name}</option>
          ))}
        </select>
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-slate-500">Precio (Bs)</span>
        <input
          name="price"
          type="number"
          step="0.01"
          min="0"
          required
          value={priceVal}
          onChange={(e) => setPriceVal(e.target.value)}
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
