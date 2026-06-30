"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Búsqueda de pacientes por nombre o CI. Actualiza ?q= en la URL (con debounce)
// y el server filtra. La lista no salta: solo cambian las filas que coinciden.
export function PatientSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [, startTransition] = useTransition();

  useEffect(() => {
    // Debounce: espera a que el usuario deje de teclear.
    const id = setTimeout(() => {
      const params = new URLSearchParams();
      if (value.trim()) params.set("q", value.trim());
      const qs = params.toString();
      startTransition(() => {
        router.replace(qs ? `/pacientes?${qs}` : "/pacientes");
      });
    }, 300);
    return () => clearTimeout(id);
  }, [value, router]);

  return (
    <div className="relative">
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Buscar por nombre o CI…"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
      />
    </div>
  );
}
