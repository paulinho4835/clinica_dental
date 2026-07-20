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
import { money } from "@/lib/format";

export type DailyPoint = { label: string; total: number };
export type MonthlyPoint = { name: string; total: number; patients: number };

const TEAL = "#0ea5a4";
const TEAL_PEAK = "#0f766e";
const SLATE = "#cbd5e1";

// Tooltip uniforme en Bs.
function MoneyTooltip({
  active,
  payload,
  label,
  extra,
  currency,
}: {
  active?: boolean;
  payload?: { value: number; payload: Record<string, unknown> }[];
  label?: string;
  extra?: (p: Record<string, unknown>) => string | null;
  currency: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  const more = extra?.(row.payload);
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-700">{label}</p>
      <p className="tabular-nums text-clinic">{money(Number(row.value), currency)}</p>
      {more && <p className="text-slate-400">{more}</p>}
    </div>
  );
}

export function RevenueChart({
  daily,
  monthly,
  peakMonth,
  currency,
}: {
  daily: DailyPoint[];
  monthly: MonthlyPoint[];
  peakMonth: string | null; // nombre del mes pico, para resaltar
  currency: string;
}) {
  const [view, setView] = useState<"daily" | "monthly">("daily");

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-800">Ingresos</h2>
          <p className="text-xs text-slate-400">
            {view === "daily"
              ? "Últimos 30 días"
              : "Por mes (el pico marca la temporada alta)"}
          </p>
        </div>
        <div className="flex rounded-md bg-slate-100 p-0.5 text-sm">
          <button
            onClick={() => setView("daily")}
            className={`rounded px-3 py-1 transition ${
              view === "daily" ? "bg-white font-medium text-clinic shadow-sm" : "text-slate-500"
            }`}
          >
            Diario
          </button>
          <button
            onClick={() => setView("monthly")}
            className={`rounded px-3 py-1 transition ${
              view === "monthly" ? "bg-white font-medium text-clinic shadow-sm" : "text-slate-500"
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
                <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={TEAL} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={TEAL} stopOpacity={0} />
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
                width={48}
                tickFormatter={(v) => `${v}`}
              />
              <Tooltip content={<MoneyTooltip currency={currency} />} />
              <Area
                type="monotone"
                dataKey="total"
                stroke={TEAL}
                strokeWidth={2}
                fill="url(#revFill)"
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
                width={48}
              />
              <Tooltip
                content={
                  <MoneyTooltip
                    extra={(p) => `${Number(p.patients ?? 0)} paciente(s)`}
                    currency={currency}
                  />
                }
                cursor={{ fill: "#f8fafc" }}
              />
              <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                {monthly.map((m) => (
                  <Cell
                    key={m.name}
                    fill={peakMonth && m.name === peakMonth ? TEAL_PEAK : m.total > 0 ? TEAL : SLATE}
                  />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {view === "monthly" && peakMonth && (
        <p className="mt-2 text-center text-xs text-slate-500">
          🔥 Temporada alta: <span className="font-medium text-clinic-fg">{peakMonth}</span>
        </p>
      )}
    </div>
  );
}
