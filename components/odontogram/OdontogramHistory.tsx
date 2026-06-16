"use client";

import { useState } from "react";
import { History, ChevronDown, ArrowRight } from "lucide-react";
import { CONDITION_LABELS } from "@/lib/odontogram/types";

export type OdontogramEvent = {
  id: string;
  tooth_fdi: string;
  surface: string | null;
  prev_state: string | null;
  new_state: string | null;
  created_at: string;
  actor_name: string | null;
};

const SURFACE_LABELS: Record<string, string> = {
  O: "Oclusal",
  M: "Mesial",
  D: "Distal",
  V: "Vestibular",
  L: "Lingual/Palatino",
};

function stateLabel(s: string | null): string {
  if (!s) return "vacío";
  if (s === "x_rojo") return "marca: requerido";
  if (s === "x_azul") return "marca: existente";
  return CONDITION_LABELS[s] ?? s;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Agrupa los eventos por momento de guardado (created_at) — cada save produce
// varios eventos (uno por cara/diente cambiado).
type Group = { key: string; created_at: string; actor_name: string | null; events: OdontogramEvent[] };

function groupEvents(events: OdontogramEvent[]): Group[] {
  const map = new Map<string, Group>();
  for (const e of events) {
    const key = `${e.created_at}|${e.actor_name ?? ""}`;
    const g = map.get(key);
    if (g) g.events.push(e);
    else map.set(key, { key, created_at: e.created_at, actor_name: e.actor_name, events: [e] });
  }
  return [...map.values()];
}

export function OdontogramHistory({ events }: { events: OdontogramEvent[] }) {
  const [open, setOpen] = useState(false);
  if (events.length === 0) return null;

  const groups = groupEvents(events);

  return (
    <div className="rounded-lg ring-1 ring-slate-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left"
      >
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <History className="h-3.5 w-3.5" />
          Historial de cambios ({groups.length})
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="max-h-96 overflow-y-auto border-t border-slate-100">
          <ul className="divide-y divide-slate-100">
            {groups.map((g) => (
              <li key={g.key} className="px-4 py-3">
                <div className="mb-1.5 flex flex-wrap items-center gap-x-2 text-xs">
                  <span className="font-semibold text-slate-700">
                    {g.actor_name ?? "Usuario eliminado"}
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-500">{fmt(g.created_at)}</span>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-400">
                    {g.events.length} cambio{g.events.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <ul className="space-y-0.5 text-sm text-slate-600">
                  {g.events.map((e) => (
                    <li key={e.id} className="flex flex-wrap items-center gap-1.5">
                      <span className="font-medium text-slate-700">
                        Diente {e.tooth_fdi}
                        {e.surface ? ` · ${SURFACE_LABELS[e.surface] ?? e.surface}` : ""}
                      </span>
                      <span className="text-slate-400">{stateLabel(e.prev_state)}</span>
                      <ArrowRight className="h-3 w-3 text-slate-400" />
                      <span className="text-slate-700">{stateLabel(e.new_state)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
