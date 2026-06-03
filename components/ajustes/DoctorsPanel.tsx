"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDoctor, toggleDoctorActive, type ActionState } from "@/app/(dashboard)/ajustes/actions";

export type Doctor = {
  id: string;
  full_name: string;
  specialty: string | null;
  active: boolean;
};

const initial: ActionState = {};

export function DoctorsPanel({
  doctors,
  canWrite,
}: {
  doctors: Doctor[];
  canWrite: boolean;
}) {
  return (
    <div className="space-y-4">
      {canWrite && <AddDoctorForm />}
      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="divide-y divide-slate-100">
          {doctors.map((d) => (
            <DoctorRow key={d.id} doctor={d} canWrite={canWrite} />
          ))}
          {doctors.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">Sin doctores registrados.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function DoctorRow({ doctor, canWrite }: { doctor: Doctor; canWrite: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function toggle() {
    start(async () => {
      const res = await toggleDoctorActive(doctor.id, !doctor.active);
      if (res.error) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <span className={`font-medium ${!doctor.active ? "text-slate-400 line-through" : ""}`}>
          {doctor.full_name}
        </span>
        {doctor.specialty && (
          <span className="ml-2 text-xs text-slate-400">{doctor.specialty}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            doctor.active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-100 text-slate-500"
          }`}
        >
          {doctor.active ? "Activo" : "Inactivo"}
        </span>
        {canWrite && (
          <button
            disabled={pending}
            onClick={toggle}
            className="rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            {doctor.active ? "Desactivar" : "Activar"}
          </button>
        )}
      </div>
    </div>
  );
}

function AddDoctorForm() {
  const [state, formAction, pending] = useActionState(createDoctor, initial);
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
      <label className="flex-1 text-xs" style={{ minWidth: "160px" }}>
        <span className="mb-1 block text-slate-500">Nombre completo *</span>
        <input
          name="full_name"
          type="text"
          required
          placeholder="ej. Dr. Ramírez"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
        />
      </label>
      <label className="text-xs" style={{ minWidth: "140px" }}>
        <span className="mb-1 block text-slate-500">Especialidad</span>
        <input
          name="specialty"
          type="text"
          placeholder="ej. Endodoncia"
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
      >
        {pending ? "…" : "+ Agregar doctor"}
      </button>
      {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
    </form>
  );
}
