"use client";

import { useRouter } from "next/navigation";

export function DateFilter({
  selectedDate,
  todayDate,
}: {
  selectedDate: string;
  todayDate: string;
}) {
  const router = useRouter();

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={selectedDate}
        max={todayDate}
        onChange={(e) => {
          if (!e.target.value) return;
          const params = e.target.value === todayDate ? "" : `?date=${e.target.value}`;
          router.push(`/caja${params}`);
        }}
        className="rounded border border-slate-300 px-3 py-1.5 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
      />
      {selectedDate !== todayDate && (
        <button
          type="button"
          onClick={() => router.push("/caja")}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          Hoy
        </button>
      )}
    </div>
  );
}
