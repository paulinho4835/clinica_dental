"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function DateRangeFilter({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function push(updates: { from?: string; to?: string }) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, val] of Object.entries(updates)) {
      if (val) params.set(key, val);
      else params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  function setPreset(fromDate: string, toDate: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("from", fromDate);
    params.set("to", toDate);
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearDates() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("from");
    params.delete("to");
    router.push(`${pathname}?${params.toString()}`);
  }

  const today = new Date().toLocaleDateString("en-CA");
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toLocaleDateString("en-CA");
  const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toLocaleDateString("en-CA");

  const hasFilter = from || to;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        type="date"
        value={from}
        onChange={(e) => push({ from: e.target.value })}
        className="rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-clinic focus:outline-none"
        title="Desde"
      />
      <span className="text-xs text-slate-400">–</span>
      <input
        type="date"
        value={to}
        onChange={(e) => push({ to: e.target.value })}
        className="rounded border border-slate-300 px-2 py-1.5 text-xs focus:border-clinic focus:outline-none"
        title="Hasta"
      />
      <button
        onClick={() => setPreset(today, today)}
        className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
      >
        Hoy
      </button>
      <button
        onClick={() => setPreset(sevenDaysAgo, today)}
        className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
      >
        7 días
      </button>
      <button
        onClick={() => setPreset(firstOfMonth, today)}
        className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200"
      >
        Este mes
      </button>
      {hasFilter && (
        <button
          onClick={clearDates}
          className="rounded px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100"
          title="Limpiar fechas"
        >
          ✕
        </button>
      )}
    </div>
  );
}
