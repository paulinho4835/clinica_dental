"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { saveRemindersConfig, type ActionState } from "@/app/(dashboard)/ajustes/actions";

export type ReminderRow = {
  id: string;
  hours_before: number | null;
  status: string;
  scheduled_for: string;
  sent_at: string | null;
  appointments: {
    starts_at: string;
    patient_name: string | null;
    patients: { full_name: string | null } | null;
  } | null;
};

const initial: ActionState = {};

const STATUS_LABEL: Record<string, string> = {
  pending:   "Pendiente",
  sent:      "Enviado",
  failed:    "Fallido",
  cancelled: "Cancelado",
};

const STATUS_CLASS: Record<string, string> = {
  pending:   "bg-amber-100 text-amber-700",
  sent:      "bg-emerald-100 text-emerald-700",
  failed:    "bg-red-100 text-red-600",
  cancelled: "bg-slate-100 text-slate-500",
};

function hoursLabel(hours: number | null): string {
  if (hours === 2)  return "2h antes";
  if (hours === 24) return "24h antes";
  return "Recordatorio";
}

export function RemindersPanel({
  config,
  recentReminders,
  canWrite,
}: {
  config: { h24: boolean; h2: boolean };
  recentReminders: ReminderRow[];
  canWrite: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveRemindersConfig, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  return (
    <div className="space-y-4">
      {/* Configuración de timings */}
      <form
        action={formAction}
        className="rounded-lg bg-white shadow-sm ring-1 ring-slate-200"
      >
        <div className="space-y-3 p-5">
          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              name="reminders_h24"
              defaultChecked={config.h24}
              disabled={!canWrite}
              className="h-4 w-4 rounded border-slate-300 text-clinic focus:ring-clinic"
            />
            <span className="text-slate-700">Recordatorio 24 horas antes de la cita</span>
          </label>
          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              name="reminders_h2"
              defaultChecked={config.h2}
              disabled={!canWrite}
              className="h-4 w-4 rounded border-slate-300 text-clinic focus:ring-clinic"
            />
            <span className="text-slate-700">Recordatorio 2 horas antes de la cita</span>
          </label>
        </div>

        {canWrite && (
          <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3">
            {state.error && (
              <p className="text-sm text-red-600">{state.error}</p>
            )}
            {state.ok && !state.error && (
              <p className="text-sm text-emerald-600">Configuración guardada.</p>
            )}
            {!state.error && !state.ok && <span />}
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Guardar configuración"}
            </button>
          </div>
        )}
      </form>

      {/* Historial reciente */}
      {recentReminders.length > 0 ? (
        <div className="rounded-lg bg-white shadow-sm ring-1 ring-slate-200 overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Últimos 7 días
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Paciente</th>
                  <th className="px-4 py-2 text-left font-medium">Cita</th>
                  <th className="px-4 py-2 text-left font-medium">Tipo</th>
                  <th className="px-4 py-2 text-left font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentReminders.map((r) => {
                  const appt = r.appointments;
                  const patientName =
                    appt?.patients?.full_name ?? appt?.patient_name ?? "—";
                  const apptDate = appt?.starts_at
                    ? new Date(appt.starts_at).toLocaleString("es-BO", {
                        timeZone: "America/La_Paz",
                        weekday: "short",
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "—";
                  const statusClass =
                    STATUS_CLASS[r.status] ?? "bg-slate-100 text-slate-500";

                  return (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-700">{patientName}</td>
                      <td className="px-4 py-2 text-slate-500">{apptDate}</td>
                      <td className="px-4 py-2 text-slate-500">
                        {hoursLabel(r.hours_before)}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass}`}
                        >
                          {STATUS_LABEL[r.status] ?? r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-4">
          No hay recordatorios en los últimos 7 días.
        </p>
      )}
    </div>
  );
}
