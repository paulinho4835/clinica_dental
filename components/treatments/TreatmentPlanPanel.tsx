"use client";

import { useActionState, useEffect, useRef, useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addPlanWork,
  deleteWork,
  updatePlanItemName,
  updatePlanItemPrice,
  type ActionState,
} from "@/app/(dashboard)/pacientes/treatment-actions";
import { PrintSelectModal } from "./PrintSelectModal";
import { money, fmtBoliviaDateTime } from "@/lib/format";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/toast";

export type Dentist = { id: string; full_name: string };

// Tratamiento del catálogo de la clínica, para sugerir y autollenar precio.
export type CatalogOption = { id: string; name: string; base_price: number };

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

const fmtDateTime = fmtBoliviaDateTime;

export function TreatmentPlanPanel({
  patientId,
  canWrite,
  canDelete,
  canEditName,
  canEditPrice,
  works,
  dentists,
  catalog,
  recetasEnabled,
  currency,
}: {
  patientId: string;
  canWrite: boolean;
  /** Solo el admin puede eliminar trabajos ya agregados al plan. */
  canDelete: boolean;
  /** Admin, doctores y colega pueden renombrar el trabajo (no el precio). */
  canEditName?: boolean;
  /** Solo el admin puede corregir el precio de un ítem ya agregado. */
  canEditPrice?: boolean;
  works: Work[];
  dentists: Dentist[];
  /** Catálogo de tratamientos de la clínica (sugerencias + autollenado de precio). */
  catalog: CatalogOption[];
  recetasEnabled?: boolean;
  currency: string;
}) {
  const total = works.reduce((s, w) => s + w.price, 0);

  return (
    <div className="space-y-4">
      {canWrite && <AddWorkForm patientId={patientId} dentists={dentists} catalog={catalog} />}

      {recetasEnabled && (
        <div className="flex items-center justify-end">
          <PrintSelectModal patientId={patientId} works={works} currency={currency} />
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
            <WorkRow key={w.id} work={w} patientId={patientId} canDelete={canDelete} canEditName={canEditName} canEditPrice={canEditPrice} currency={currency} />
          ))}
          {works.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">Sin trabajos en el plan.</p>
          )}
        </div>
        {works.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{money(total, currency)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function WorkRow({
  work,
  patientId,
  canDelete,
  canEditName,
  canEditPrice,
  currency,
}: {
  work: Work;
  patientId: string;
  canDelete: boolean;
  canEditName?: boolean;
  canEditPrice?: boolean;
  currency: string;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [nameVal, setNameVal] = useState(work.name);
  const [editingPrice, setEditingPrice] = useState(false);
  const [priceVal, setPriceVal] = useState(String(work.price));

  function saveName() {
    const trimmed = nameVal.trim();
    if (!trimmed || trimmed === work.name) {
      setNameVal(work.name);
      setEditing(false);
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("item_id", work.id);
      fd.set("patient_id", patientId);
      fd.set("name", trimmed);
      const res = await updatePlanItemName({}, fd);
      if (res.error) {
        toast(res.error, "error");
        setNameVal(work.name);
      } else {
        router.refresh();
      }
      setEditing(false);
    });
  }

  function savePrice() {
    const n = Number(priceVal);
    if (!Number.isFinite(n) || n < 0 || n === work.price) {
      setPriceVal(String(work.price));
      setEditingPrice(false);
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("item_id", work.id);
      fd.set("patient_id", patientId);
      fd.set("price", String(n));
      const res = await updatePlanItemPrice({}, fd);
      if (res.error) {
        toast(res.error, "error");
        setPriceVal(String(work.price));
      } else {
        router.refresh();
      }
      setEditingPrice(false);
    });
  }

  return (
    <div className="grid grid-cols-2 items-center gap-3 px-4 py-2.5 text-sm sm:grid-cols-[10rem_1fr_9rem_7rem_2rem]">
      <span className="order-2 text-xs tabular-nums text-slate-400 sm:order-none sm:text-sm sm:text-slate-600">
        {fmtDateTime(work.createdAt)}
      </span>
      <span className="order-1 font-medium sm:order-none">
        {editing ? (
          <input
            autoFocus
            type="text"
            value={nameVal}
            disabled={pending}
            onChange={(e) => setNameVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveName();
              if (e.key === "Escape") {
                setNameVal(work.name);
                setEditing(false);
              }
            }}
            onBlur={saveName}
            className="w-full rounded border border-clinic bg-white px-2 py-1 text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        ) : canEditName ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-left hover:underline decoration-dotted underline-offset-2"
            title="Editar trabajo a realizar"
          >
            {work.name}
          </button>
        ) : (
          work.name
        )}
      </span>
      <span className="order-3 truncate text-slate-500 sm:order-none">
        {work.dentistName ?? <span className="text-slate-300">—</span>}
      </span>
      <span className="order-4 text-right tabular-nums text-slate-600 sm:order-none">
        {editingPrice ? (
          <input
            autoFocus
            type="number"
            step="0.01"
            min="0"
            value={priceVal}
            disabled={pending}
            onChange={(e) => setPriceVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") savePrice();
              if (e.key === "Escape") {
                setPriceVal(String(work.price));
                setEditingPrice(false);
              }
            }}
            onBlur={savePrice}
            className="w-24 rounded border border-clinic bg-white px-2 py-1 text-right text-sm text-slate-900 focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        ) : canEditPrice ? (
          <button
            type="button"
            onClick={() => setEditingPrice(true)}
            className="hover:underline decoration-dotted underline-offset-2"
            title="Editar precio"
          >
            {money(work.price, currency)}
          </button>
        ) : (
          money(work.price, currency)
        )}
      </span>
      <div className="order-5 text-right sm:order-none">
        {canDelete && (
          <button
            disabled={pending}
            onClick={async () => {
              const ok = await confirm({
                title: "Eliminar trabajo",
                message: "¿Eliminar este trabajo?",
                confirmText: "Eliminar",
                cancelText: "Cancelar",
                tone: "danger",
              });
              if (!ok) return;
              start(async () => {
                const res = await deleteWork(work.id, patientId);
                if (res.error) toast(res.error, "error");
                else router.refresh();
              });
            }}
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

function AddWorkForm({
  patientId,
  dentists,
  catalog,
}: {
  patientId: string;
  dentists: Dentist[];
  catalog: CatalogOption[];
}) {
  const [state, formAction, pending] = useActionState(addPlanWork, initial);
  const router = useRouter();

  // Controlled fields — description and price reset on success; doctor persists.
  const [descVal, setDescVal] = useState("");
  const [priceVal, setPriceVal] = useState("");
  const [doctorId, setDoctorId] = useState("");
  // procedure_id se setea cuando lo escrito coincide con un tratamiento del catálogo.
  const [procedureId, setProcedureId] = useState("");

  const listId = `catalog-${patientId}`;

  // Al cambiar la descripción: si coincide con un tratamiento del catálogo,
  // autollena el precio y guarda el vínculo; si no, lo trata como texto libre.
  function onDescChange(value: string) {
    setDescVal(value);
    const match = catalog.find(
      (c) => c.name.toLowerCase() === value.trim().toLowerCase(),
    );
    if (match) {
      setProcedureId(match.id);
      setPriceVal(String(match.base_price));
    } else {
      setProcedureId("");
    }
  }

  useEffect(() => {
    if (state.ok) {
      // Clear only work description and price; keep doctor selected.
      setDescVal("");
      setPriceVal("");
      setProcedureId("");
      router.refresh();
    }
  }, [state, router]);

  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
    >
      <input type="hidden" name="patient_id" value={patientId} />
      <input type="hidden" name="procedure_id" value={procedureId} />
      <label className="flex-1 text-xs" style={{ minWidth: "160px" }}>
        <span className="mb-1 block text-slate-500">Trabajo a realizar</span>
        <input
          name="description"
          type="text"
          required
          list={listId}
          value={descVal}
          onChange={(e) => onDescChange(e.target.value)}
          placeholder="Elige del catálogo o escribe uno…"
          className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
        />
        <datalist id={listId}>
          {catalog.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </label>
      <label className="text-xs">
        <span className="mb-1 block text-slate-500">Doctor</span>
        <select
          name="doctor_id"
          value={doctorId}
          onChange={(e) => setDoctorId(e.target.value)}
          className="rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none"
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
          className="w-28 rounded border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
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
