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

export type ReferralSourcePoint = { label: string; cnt: number };

// Misma paleta que TopTreatmentsChart, para consistencia visual del dashboard.
const PALETTE = [
  "#0ea5a4",
  "#0f766e",
  "#0891b2",
  "#2563eb",
  "#7c3aed",
  "#db2777",
];

function ReferralTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: { payload: ReferralSourcePoint }[];
  total: number;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const pct = total > 0 ? ((d.cnt / total) * 100).toFixed(0) : "0";
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-700">{d.label}</p>
      <p className="tabular-nums text-slate-500">
        {d.cnt} pacientes · {pct}%
      </p>
    </div>
  );
}

export function ReferralSourceChart({ data }: { data: ReferralSourcePoint[] }) {
  const [view, setView] = useState<"bar" | "donut">("donut");
  const total = data.reduce((s, d) => s + d.cnt, 0);

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-800">¿Cómo nos conocieron?</h2>
          <p className="text-xs text-slate-400">Total histórico · {total} pacientes</p>
        </div>
        <div className="flex rounded-md bg-slate-100 p-0.5 text-sm">
          <button
            onClick={() => setView("donut")}
            className={`rounded px-3 py-1 transition ${
              view === "donut" ? "bg-white font-medium text-clinic shadow-sm" : "text-slate-500"
            }`}
          >
            Dona
          </button>
          <button
            onClick={() => setView("bar")}
            className={`rounded px-3 py-1 transition ${
              view === "bar" ? "bg-white font-medium text-clinic shadow-sm" : "text-slate-500"
            }`}
          >
            Barras
          </button>
        </div>
      </div>

      {total === 0 ? (
        <p className="py-12 text-center text-sm text-slate-400">
          Aún no hay pacientes registrados.
        </p>
      ) : (
        <div className="h-64 w-full">
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
                  width={140}
                />
                <Tooltip content={<ReferralTooltip total={total} />} cursor={{ fill: "#f8fafc" }} />
                <Bar dataKey="cnt" radius={[0, 4, 4, 0]} barSize={18}>
                  {data.map((_, i) => (
                    <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <PieChart>
                <Tooltip content={<ReferralTooltip total={total} />} />
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

      {total > 0 && (
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
