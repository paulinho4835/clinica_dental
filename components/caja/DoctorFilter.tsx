"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Doctor = { id: string; full_name: string };

export function DoctorFilter({
  doctors,
  selectedDoctorId,
}: {
  doctors: Doctor[];
  selectedDoctorId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleChange(doctorId: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (doctorId) {
      params.set("doctor", doctorId);
    } else {
      params.delete("doctor");
    }
    router.push(`/caja?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedDoctorId}
        onChange={(e) => handleChange(e.target.value)}
        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
      >
        <option value="">Todos los doctores</option>
        {doctors.map((d) => (
          <option key={d.id} value={d.id}>
            {d.full_name}
          </option>
        ))}
      </select>
      {selectedDoctorId && (
        <button
          type="button"
          onClick={() => handleChange("")}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          Ver todos
        </button>
      )}
    </div>
  );
}
