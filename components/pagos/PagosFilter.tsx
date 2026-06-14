"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

type Employee = { id: string; full_name: string };

export function PagosFilter({
  employees,
  selectedEmployee,
  selectedMonth,
}: {
  employees: Employee[];
  selectedEmployee: string;
  selectedMonth: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const isAllMonths = selectedMonth === "all";
  const todayMonth = new Date().toLocaleDateString("en-CA").slice(0, 7);

  function update(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    next.set(key, value);
    router.push(`${pathname}?${next.toString()}`);
  }

  function toggleAllMonths() {
    update("month", isAllMonths ? todayMonth : "all");
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-2">
        <label htmlFor="employee-filter" className="text-sm font-medium text-slate-600 whitespace-nowrap">
          Persona:
        </label>
        <select
          id="employee-filter"
          value={selectedEmployee}
          onChange={(e) => update("employee", e.target.value)}
          className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-clinic/40"
        >
          <option value="all">Todos</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>{e.full_name}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="month-filter" className="text-sm font-medium text-slate-600 whitespace-nowrap">
          Mes:
        </label>
        {!isAllMonths && (
          <input
            id="month-filter"
            type="month"
            value={selectedMonth}
            onChange={(e) => update("month", e.target.value)}
            className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-clinic/40"
          />
        )}
        <button
          type="button"
          onClick={toggleAllMonths}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            isAllMonths
              ? "bg-clinic text-white"
              : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Todos los meses
        </button>
      </div>
    </div>
  );
}
