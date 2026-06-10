"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type DailyPoint = { label: string; count: number };
export type MonthlyPoint = { name: string; count: number };

const INDIGO = "#6366f1";
const INDIGO_PEAK = "#4338ca";
const SLATE = "#cbd5e1";

function CountTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-700">{label}</p>
      <p className="tabular-nums font-semibold text-indigo-600">{row.value} pacientes</p>
    </div>
  );
}

export function PatientsChart({
  daily,
  monthly,
  peakMonth,
}: {
  daily: DailyPoint[];
  monthly: MonthlyPoint[];
  peakMonth: string | null;
}) {
  const [view, setView] = useState<"daily" | "monthly">("daily");

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-800">Volumen de Pacientes</h2>
          <p className="text-xs text-slate-400">
            {view === "daily" ? "Últimos 30 días" : "Por mes (tendencia)"}
          </p>
        </div>
        <div className="flex rounded-md bg-slate-100 p-0.5 text-sm">
          <button
            onClick={() => setView("daily")}
            className={`rounded px-3 py-1 transition ${
              view === "daily" ? "bg-white font-medium text-indigo-600 shadow-sm" : "text-slate-500"
            }`}
          >
            Diario
          </button>
          <button
            onClick={() => setView("monthly")}
            className={`rounded px-3 py-1 transition ${
              view === "monthly" ? "bg-white font-medium text-indigo-600 shadow-sm" : "text-slate-500"
            }`}
          >
            Mensual
          </button>
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {view === "daily" ? (
            <AreaChart data={daily} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="patFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={INDIGO} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={INDIGO} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip content={<CountTooltip />} />
              <Area
                type="monotone"
                dataKey="count"
                stroke={INDIGO}
                strokeWidth={2}
                fill="url(#patFill)"
              />
            </AreaChart>
          ) : (
            <BarChart data={monthly} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip content={<CountTooltip />} cursor={{ fill: "#f8fafc" }} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {monthly.map((m) => (
                  <Cell
                    key={m.name}
                    fill={peakMonth && m.name === peakMonth ? INDIGO_PEAK : m.count > 0 ? INDIGO : SLATE}
                  />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
