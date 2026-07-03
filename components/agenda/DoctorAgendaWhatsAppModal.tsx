"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink, ChevronLeft, ChevronRight, Check, Stethoscope } from "lucide-react";
import { useDismissable } from "@/components/ui/useDismissable";
import { normalizePhone } from "@/lib/phone-utils";

type ApptEntry = {
  id: string;
  starts_at: string;
  patientName: string;
  reason: string | null;
};

type DoctorEntry = {
  doctorName: string;
  phone: string;
  appts: ApptEntry[];
};

type ListData = {
  clinicName: string;
  date: string;
  doctors: DoctorEntry[];
};

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("es-BO", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sentHhmm(ms: number) {
  return new Date(ms).toLocaleTimeString("es-BO", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Marcadores "ya avisé" por fecha en localStorage (recordatorio visual del propio
// recepcionista, por dispositivo). Clave por fecha → { [doctorName]: timestampMs }.
const SENT_KEY_PREFIX = "wa-doctor-sent:";

function readSent(date: string): Record<string, number> {
  try {
    const raw = localStorage.getItem(SENT_KEY_PREFIX + date);
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
}

// wa.me funciona en WhatsApp Web y app. Solo si el teléfono normaliza válido.
function buildWaLink(phone: string, message: string): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const e = encodeURIComponent(message);
  return `https://wa.me/${normalized.replace("+", "")}?text=${e}`;
}

function buildMessage(d: DoctorEntry, date: string, clinicName: string): string {
  const lines = d.appts
    .map((a) => {
      const motivo = a.reason ? ` (${a.reason})` : "";
      return `• ${hhmm(a.starts_at)} ${a.patientName}${motivo}`;
    })
    .join("\n");
  const total = d.appts.length;
  const cuantas = total === 1 ? "1 cita" : `${total} citas`;
  return (
    `Hola ${d.doctorName}, estas son sus ${cuantas} para el ${date}:\n\n` +
    `${lines}\n\n` +
    `${clinicName} 🦷`
  );
}

function shiftDate(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayISO(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
}

export function DoctorAgendaWhatsAppModal({ onClose }: { onClose: () => void }) {
  useDismissable(onClose);
  const [selectedDate, setSelectedDate] = useState(todayISO);
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Record<string, number>>({});

  useEffect(() => {
    setSent(readSent(selectedDate));
  }, [selectedDate]);

  function markSent(name: string) {
    setSent((prev) => {
      const next = { ...prev, [name]: Date.now() };
      try {
        localStorage.setItem(SENT_KEY_PREFIX + selectedDate, JSON.stringify(next));
      } catch {
        /* almacenamiento no disponible: el marcador queda solo en memoria */
      }
      return next;
    });
  }

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/whatsapp/doctor-agenda-list?date=${selectedDate}`)
      .then((r) => r.json())
      .then((body) => {
        if (body.error) throw new Error(body.error);
        setData(body);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedDate]);

  const doctors = data?.doctors ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl ring-1 ring-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-800">Avisar a doctores</h2>
            <p className="text-xs text-slate-500">
              Abre WhatsApp Web con el resumen del día ya prellenado para cada doctor.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Selector de fecha */}
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3">
          <button
            onClick={() => setSelectedDate((d) => shiftDate(d, -1))}
            className="rounded p-1 hover:bg-slate-100"
          >
            <ChevronLeft className="h-4 w-4 text-slate-500" />
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="flex-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm text-slate-700 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500"
          />
          <button
            onClick={() => setSelectedDate((d) => shiftDate(d, 1))}
            className="rounded p-1 hover:bg-slate-100"
          >
            <ChevronRight className="h-4 w-4 text-slate-500" />
          </button>
        </div>

        {/* Cuerpo */}
        <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
          {loading && (
            <p className="py-8 text-center text-sm text-slate-400">Cargando agenda…</p>
          )}
          {error && <p className="py-8 text-center text-sm text-red-500">{error}</p>}
          {!loading && !error && data && (
            <>
              {doctors.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-400">
                  Ningún doctor con teléfono registrado tiene citas el {data.date}.
                  <br />
                  <span className="text-xs">
                    Carga el WhatsApp de cada doctor en Ajustes → Usuarios del equipo.
                  </span>
                </p>
              )}

              <div className="space-y-2">
                {doctors.map((d) => {
                  const msg = buildMessage(d, data.date, data.clinicName);
                  const url = buildWaLink(d.phone, msg);
                  const sentAt = sent[d.doctorName];
                  return (
                    <div
                      key={d.doctorName}
                      className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Stethoscope className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span className="truncate text-sm font-medium text-slate-800">
                            {d.doctorName}
                          </span>
                          <span className="shrink-0 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-600">
                            {d.appts.length}
                          </span>
                        </div>
                        <p className="mt-1 space-y-0.5 text-[11px] text-slate-400">
                          {d.appts.slice(0, 3).map((a) => (
                            <span key={a.id} className="block truncate">
                              {hhmm(a.starts_at)} · {a.patientName}
                            </span>
                          ))}
                          {d.appts.length > 3 && (
                            <span className="block text-slate-400">
                              +{d.appts.length - 3} más…
                            </span>
                          )}
                        </p>
                      </div>
                      {url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => markSent(d.doctorName)}
                          title={
                            sentAt
                              ? `Enviado ${sentHhmm(sentAt)} · clic para reenviar`
                              : undefined
                          }
                          className={
                            sentAt
                              ? "flex shrink-0 items-center gap-1.5 rounded-md border border-green-300 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-100"
                              : "flex shrink-0 items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                          }
                        >
                          {sentAt ? (
                            <>
                              <Check className="h-3 w-3" />
                              Enviado · {sentHhmm(sentAt)}
                            </>
                          ) : (
                            <>
                              <ExternalLink className="h-3 w-3" />
                              Enviar
                            </>
                          )}
                        </a>
                      ) : (
                        <span className="shrink-0 text-[11px] text-red-500">
                          Teléfono inválido
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && doctors.length > 0 && (
          <div className="space-y-1.5 border-t border-slate-100 px-5 py-3">
            <p className="flex items-center gap-1.5 text-[11px] font-medium text-green-700">
              <Check className="h-3 w-3" />
              {doctors.filter((d) => sent[d.doctorName]).length} de {doctors.length} avisados
            </p>
            <p className="text-[11px] text-slate-400">
              Haz clic en <strong>Enviar</strong> en cada doctor para abrir WhatsApp Web
              con el resumen listo. Solo debes presionar <strong>Enviar</strong> en WhatsApp.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
