"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

type Doctor = { id: string; full_name: string; role?: string };

export function DoctorFilter({
  doctors,
  selected,
  currentUserId,
}: {
  doctors: Doctor[];
  selected: string;
  currentUserId: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onChange(id: string) {
    const next = new URLSearchParams(params.toString());
    next.set("doctor", id);
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="doctor-filter" className="text-sm font-medium text-slate-600 whitespace-nowrap">
        Ver:
      </label>
      <select
        id="doctor-filter"
        value={selected}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-clinic/40"
      >
        {doctors.map((d) => (
          <option key={d.id} value={d.id}>
            {d.full_name}{d.id === currentUserId ? " (Tú)" : ""}
          </option>
        ))}
        <option value="all">Todos los doctores</option>
      </select>
    </div>
  );
}
