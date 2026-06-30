"use client";

import { useRouter, useSearchParams } from "next/navigation";

export function DateFilter({
  selectedDate,
  todayDate,
}: {
  selectedDate: string;
  todayDate: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleDateChange(date: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (date && date !== todayDate) {
      params.set("date", date);
    } else {
      params.delete("date");
    }
    router.push(`/caja?${params.toString()}`);
  }

  function handleGoToday() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("date");
    router.push(`/caja?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-2">
      <input
        type="date"
        value={selectedDate}
        max={todayDate}
        onChange={(e) => {
          if (!e.target.value) return;
          handleDateChange(e.target.value);
        }}
        className="rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
      />
      {selectedDate !== todayDate && (
        <button
          type="button"
          onClick={handleGoToday}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          Hoy
        </button>
      )}
    </div>
  );
}
