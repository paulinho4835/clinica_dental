"use client";

import type { PerioIndices } from "@/lib/perio/indices";

function Stat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "warn" | "danger" | "good";
}) {
  const toneClass =
    tone === "danger"
      ? "text-red-600"
      : tone === "warn"
        ? "text-amber-600"
        : tone === "good"
          ? "text-emerald-600"
          : "text-slate-800";
  return (
    <div className="rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`mt-0.5 text-lg font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}

// Tono según el % (sangrado/placa): ≤10% bien, ≤30% alerta, >30% peligro.
function pctTone(p: number | null): "default" | "warn" | "danger" | "good" {
  if (p === null) return "default";
  if (p <= 10) return "good";
  if (p <= 30) return "warn";
  return "danger";
}

export function PerioIndicesPanel({ indices }: { indices: PerioIndices }) {
  const i = indices;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
      <Stat
        label="% Sangrado"
        value={i.bopPercent === null ? "—" : `${i.bopPercent}%`}
        tone={pctTone(i.bopPercent)}
      />
      <Stat
        label="% Placa"
        value={i.plaquePercent === null ? "—" : `${i.plaquePercent}%`}
        tone={pctTone(i.plaquePercent)}
      />
      <Stat
        label="Bolsa más profunda"
        value={i.deepestPocket === null ? "—" : `${i.deepestPocket} mm`}
        tone={
          i.deepestPocket === null
            ? "default"
            : i.deepestPocket >= 6
              ? "danger"
              : i.deepestPocket >= 4
                ? "warn"
                : "good"
        }
      />
      <Stat label="NIC promedio" value={i.meanCal === null ? "—" : `${i.meanCal} mm`} />
      <Stat
        label="Bolsas ≥4mm"
        value={String(i.pockets4plus)}
        tone={i.pockets4plus > 0 ? "warn" : "good"}
      />
      <Stat
        label="Bolsas ≥6mm"
        value={String(i.pockets6plus)}
        tone={i.pockets6plus > 0 ? "danger" : "good"}
      />
      <Stat label="Dientes presentes" value={String(i.teethPresent)} />
    </div>
  );
}
