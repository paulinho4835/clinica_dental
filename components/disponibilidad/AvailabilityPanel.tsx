"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createAvailabilityBlock,
  deleteAvailabilityBlock,
  type NewBlock,
} from "@/app/(dashboard)/disponibilidad/actions";
import type { AvailabilityBlock } from "@/lib/availability";
import { toast } from "@/lib/toast";
import { confirm } from "@/lib/confirm";
import { cn } from "@/lib/cn";
import { fieldInputClass } from "@/components/ui/Field";
import { Printer, Trash2 } from "lucide-react";

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const ALL_DAY = { start: "08:00", end: "20:00" }; // horario general de la clínica

type Doctor = { id: string; full_name: string };

const hhmm = (t: string) => t.slice(0, 5);

function blockLabel(b: AvailabilityBlock): string {
  const when =
    b.weekday !== null
      ? `Todos los ${WEEKDAYS[b.weekday].toLowerCase()}`
      : b.date_from === b.date_to
        ? b.date_from!
        : `${b.date_from} → ${b.date_to}`;
  const time =
    hhmm(b.start_time) === ALL_DAY.start && hhmm(b.end_time) === ALL_DAY.end
      ? "todo el día"
      : `${hhmm(b.start_time)}–${hhmm(b.end_time)}`;
  return `${when}, ${time}`;
}

export function AvailabilityPanel({
  doctors,
  blocks,
}: {
  doctors: Doctor[];
  blocks: AvailabilityBlock[];
}) {
  const [filterDoctor, setFilterDoctor] = useState<string>("");
  const [filterDay, setFilterDay] = useState<string>("");

  const filtered = useMemo(
    () =>
      blocks.filter(
        (b) =>
          (!filterDoctor || b.dentist_id === filterDoctor) &&
          (filterDay === "" || b.weekday === Number(filterDay)),
      ),
    [blocks, filterDoctor, filterDay],
  );

  return (
    <div className="space-y-8">
      <AddBlockForm doctors={doctors} />

      {/* ── Grilla semanal (recurrentes) — imprimible ─────────────────────── */}
      <section className="print-area">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Semana típica</h2>
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50 print:hidden"
          >
            <Printer className="h-3.5 w-3.5" /> Imprimir
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                <th className="px-3 py-2 font-medium">Doctor</th>
                {WEEKDAYS.map((d) => (
                  <th key={d} className="px-3 py-2 font-medium">{d}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {doctors.map((doc) => (
                <tr key={doc.id}>
                  <td className="px-3 py-2 font-medium text-slate-700">{doc.full_name}</td>
                  {WEEKDAYS.map((_, wd) => {
                    const dayBlocks = blocks.filter(
                      (b) => b.dentist_id === doc.id && b.weekday === wd,
                    );
                    return (
                      <td key={wd} className="px-3 py-2 align-top">
                        {dayBlocks.length === 0 ? (
                          <span className="text-xs text-emerald-600">Disponible</span>
                        ) : (
                          dayBlocks.map((b) => (
                            <div key={b.id} className="text-xs text-slate-500">
                              <span className="font-medium text-slate-600">
                                {hhmm(b.start_time)}–{hhmm(b.end_time)}
                              </span>{" "}
                              no disponible
                              {b.reason ? ` · ${b.reason}` : ""}
                            </div>
                          ))
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {doctors.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-3 text-sm text-slate-500">
                    No hay doctores activos.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Lista completa con filtros y borrar ──────────────────────────── */}
      <section>
        <h2 className="mb-2 text-lg font-semibold text-slate-800">Bloques registrados</h2>
        <div className="mb-3 flex flex-wrap gap-2">
          <select
            value={filterDoctor}
            onChange={(e) => setFilterDoctor(e.target.value)}
            className={`${fieldInputClass} w-auto`}
          >
            <option value="">Todos los doctores</option>
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.full_name}</option>
            ))}
          </select>
          <select
            value={filterDay}
            onChange={(e) => setFilterDay(e.target.value)}
            className={`${fieldInputClass} w-auto`}
          >
            <option value="">Todos los días</option>
            {WEEKDAYS.map((d, i) => (
              <option key={d} value={i}>{d}</option>
            ))}
          </select>
        </div>
        <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          <div className="divide-y divide-slate-100">
            {filtered.map((b) => (
              <BlockRow key={b.id} block={b} />
            ))}
            {filtered.length === 0 && (
              <p className="px-4 py-3 text-sm text-slate-500">
                Sin bloques registrados{filterDoctor || filterDay ? " con esos filtros" : ""}.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function BlockRow({ block }: { block: AvailabilityBlock }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  async function remove() {
    const ok = await confirm({
      title: "Eliminar bloque",
      message: `¿Eliminar "${blockLabel(block)}" de ${block.dentist_name}?`,
      confirmText: "Sí, eliminar",
      cancelText: "Cancelar",
    });
    if (!ok) return;
    start(async () => {
      const res = await deleteAvailabilityBlock(block.id);
      if (res.error) { toast(res.error, "error"); return; }
      toast("Bloque eliminado.");
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <div>
        <span className="text-sm font-medium text-slate-700">{block.dentist_name}</span>
        <span className="ml-2 text-sm text-slate-500">{blockLabel(block)}</span>
        {block.reason && (
          <span className="ml-2 text-xs italic text-slate-400">{block.reason}</span>
        )}
      </div>
      <button
        type="button"
        onClick={remove}
        disabled={pending}
        aria-label="Eliminar bloque"
        className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function AddBlockForm({ doctors }: { doctors: Doctor[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"weekly" | "dated">("weekly");
  const [dentistId, setDentistId] = useState(doctors[0]?.id ?? "");
  const [weekday, setWeekday] = useState(0);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("13:00");
  const [reason, setReason] = useState("");

  function submit() {
    const input: NewBlock = {
      dentistId,
      mode,
      weekday: mode === "weekly" ? weekday : undefined,
      dateFrom: mode === "dated" ? dateFrom : undefined,
      dateTo: mode === "dated" ? (dateTo || dateFrom) : undefined,
      startTime: allDay ? ALL_DAY.start : startTime,
      endTime: allDay ? ALL_DAY.end : endTime,
      reason: reason || undefined,
    };
    start(async () => {
      const res = await createAvailabilityBlock(input);
      if (res.error) { toast(res.error, "error"); return; }
      toast("Bloque registrado.");
      setReason("");
      router.refresh();
    });
  }

  const valid = dentistId && (mode === "weekly" || dateFrom);

  return (
    <section className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 print:hidden">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">Registrar no disponibilidad</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-slate-500">
          Doctor
          <select
            value={dentistId}
            onChange={(e) => setDentistId(e.target.value)}
            className={`${fieldInputClass} mt-1 block w-auto`}
          >
            {doctors.map((d) => (
              <option key={d.id} value={d.id}>{d.full_name}</option>
            ))}
          </select>
        </label>

        <label className="text-xs text-slate-500">
          Tipo
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "weekly" | "dated")}
            className={`${fieldInputClass} mt-1 block w-auto`}
          >
            <option value="weekly">Todas las semanas</option>
            <option value="dated">Fecha concreta / rango</option>
          </select>
        </label>

        {mode === "weekly" ? (
          <label className="text-xs text-slate-500">
            Día
            <select
              value={weekday}
              onChange={(e) => setWeekday(Number(e.target.value))}
              className={`${fieldInputClass} mt-1 block w-auto`}
            >
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>{d}</option>
              ))}
            </select>
          </label>
        ) : (
          <>
            <label className="text-xs text-slate-500">
              Desde
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className={`${fieldInputClass} mt-1 block w-auto`}
              />
            </label>
            <label className="text-xs text-slate-500">
              Hasta (opcional)
              <input
                type="date"
                value={dateTo}
                min={dateFrom}
                onChange={(e) => setDateTo(e.target.value)}
                className={`${fieldInputClass} mt-1 block w-auto`}
              />
            </label>
          </>
        )}

        <label className="flex items-center gap-1.5 pb-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={allDay}
            onChange={(e) => setAllDay(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Todo el día
        </label>

        {!allDay && (
          <>
            <label className="text-xs text-slate-500">
              De
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={`${fieldInputClass} mt-1 block w-auto`}
              />
            </label>
            <label className="text-xs text-slate-500">
              A
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={`${fieldInputClass} mt-1 block w-auto`}
              />
            </label>
          </>
        )}

        <label className="min-w-40 flex-1 text-xs text-slate-500">
          Motivo (opcional)
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Vacaciones, docencia, etc."
            className={`${fieldInputClass} mt-1 block w-full`}
          />
        </label>

        <button
          type="button"
          onClick={submit}
          disabled={!valid || pending}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-medium",
            valid && !pending
              ? "bg-night text-white hover:opacity-90"
              : "cursor-not-allowed bg-slate-100 text-slate-400",
          )}
        >
          {pending ? "Guardando..." : "Agregar"}
        </button>
      </div>
    </section>
  );
}
