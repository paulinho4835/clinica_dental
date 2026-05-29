"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAppointmentStatus } from "@/app/(dashboard)/agenda/actions";

const OPTIONS: { value: string; label: string }[] = [
  { value: "scheduled", label: "Agendada" },
  { value: "confirmed", label: "Confirmada" },
  { value: "waiting", label: "En espera" },
  { value: "in_chair", label: "En sillón" },
  { value: "finished", label: "Finalizada" },
  { value: "cancelled", label: "Cancelada" },
  { value: "no_show", label: "No asistió" },
];

export function StatusSelect({
  id,
  status,
  disabled,
}: {
  id: string;
  status: string;
  disabled?: boolean;
}) {
  const [value, setValue] = useState(status);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (disabled) {
    return (
      <span className="text-xs text-slate-500">
        {OPTIONS.find((o) => o.value === value)?.label ?? value}
      </span>
    );
  }

  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        const next = e.target.value;
        setValue(next);
        startTransition(async () => {
          const res = await setAppointmentStatus(id, next);
          if (res.error) {
            setValue(status); // revertir en error
            alert(res.error);
          } else {
            router.refresh();
          }
        });
      }}
      className="rounded border border-slate-300 px-2 py-1 text-xs focus:border-clinic focus:outline-none disabled:opacity-50"
    >
      {OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
