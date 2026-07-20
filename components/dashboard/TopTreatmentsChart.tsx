"use client";

import { useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { money } from "@/lib/format";

export type Treatment = { label: string; cnt: number; revenue: number };

// Paleta profesional (teal → azules → ámbar), legible y sobria.
const PALETTE = [
  "#0ea5a4",
  "#0f766e",
  "#0891b2",
  "#2563eb",
  "#7c3aed",
  "#db2777",
  "#ea580c",
  "#ca8a04",
];

function TreatmentTooltip({
  active,
  payload,
  currency,
}: {
  active?: boolean;
  payload?: { payload: Treatment }[];
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const t = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-700">{t.label}</p>
      <p className="text-slate-500">{t.cnt} realizados</p>
      <p className="tabular-nums text-clinic">{money(t.revenue, currency)}</p>
    </div>
  );
}

export function TopTreatmentsChart({ data, currency }: { data: Treatment[]; currency: string }) {
  const [view, setView] = useState<"bar" | "donut">("bar");
  const total = data.reduce((s, d) => s + d.cnt, 0);

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-800">Tratamientos más realizados</h2>
          <p className="text-xs text-slate-400">Demanda del año · {total} en total</p>
        </div>
        <div className="flex rounded-md bg-slate-100 p-0.5 text-sm">
          <button
            onClick={() => setView("bar")}
            className={`rounded px-3 py-1 transition ${
              view === "bar" ? "bg-white font-medium text-clinic shadow-sm" : "text-slate-500"
            }`}
          >
            Barras
          </button>
          <button
            onClick={() => setView("donut")}
            className={`rounded px-3 py-1 transition ${
              view === "donut" ? "bg-white font-medium text-clinic shadow-sm" : "text-slate-500"
            }`}
          >
            Dona
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">
          Aún no hay tratamientos finalizados este año.
        </p>
      ) : (
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            {view === "bar" ? (
              <BarChart
                data={data}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "#475569" }}
                  tickLine={false}
                  axisLine={false}
                  width={120}
                />
                <Tooltip content={<TreatmentTooltip currency={currency} />} cursor={{ fill: "#f8fafc" }} />
                <Bar dataKey="cnt" radius={[0, 4, 4, 0]} barSize={18}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <PieChart>
                <Tooltip content={<TreatmentTooltip currency={currency} />} />
                <Pie
                  data={data}
                  dataKey="cnt"
                  nameKey="label"
                  innerRadius={55}
                  outerRadius={95}
                  paddingAngle={2}
                >
                  {data.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
              </PieChart>
            )}
          </ResponsiveContainer>
        </div>
      )}

      {/* Leyenda con conteos (sirve para ambas vistas). */}
      {data.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {data.map((d, i) => (
            <li key={d.label} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ backgroundColor: PALETTE[i % PALETTE.length] }}
              />
              <span className="flex-1 truncate text-slate-600">{d.label}</span>
              <span className="tabular-nums font-medium text-slate-400">{d.cnt}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
