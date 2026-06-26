"use client";

import { useEffect, useState } from "react";
import { X, ExternalLink, PhoneOff, Phone, ChevronLeft, ChevronRight } from "lucide-react";
import { useDismissable } from "@/components/ui/useDismissable";
import { normalizePhone } from "@/lib/phone-utils";

type ApptEntry = {
  id: string;
  starts_at: string;
  patientName: string;
  phone: string | null;
  dentistName: string | null;
  reason: string | null;
  confirmToken: string | null;
};

type ListData = {
  clinicName: string;
  date: string;
  appts: ApptEntry[];
};

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString("es-BO", {
    timeZone: "America/La_Paz",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Construye un enlace wa.me SOLO si el teléfono es válido (normalizePhone de
// phone-utils quita todo lo no numérico y valida la longitud → null si inválido).
// wa.me funciona en WhatsApp Web y app, a diferencia del esquema whatsapp://
// que, con un número inválido, redirige al 404 de api.whatsapp.com/resolve.
function buildWaLink(phone: string | null, message: string): string | null {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  const e = encodeURIComponent(message);
  return `https://wa.me/${normalized.replace("+", "")}?text=${e}`;
}

function buildMessage(
  a: ApptEntry,
  date: string,
  clinicName: string,
  origin: string,
): string {
  const time = hhmm(a.starts_at);
  const doctor = a.dentistName ? ` con ${a.dentistName}` : "";
  const motivo = a.reason ? ` (${a.reason})` : "";
  // Enlace de confirmación: el paciente lo toca y confirma/cancela desde el
  // sistema (queda reflejado en la agenda). Solo si hay token y URL base.
  const confirmar =
    a.confirmToken && origin
      ? `\n\nConfirma tu asistencia aquí: ${origin}/c/${a.confirmToken}`
      : "";
  return (
    `Hola ${a.patientName}, le recordamos su cita dental el ${date} a las ${time}${doctor}${motivo}. ` +
    `${clinicName}. Ante cualquier consulta estamos a su disposición. ¡Hasta pronto! 🦷` +
    confirmar
  );
}

function shiftDate(dateStr: string, delta: number): string {
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + delta);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function tomorrowISO(): string {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return t.toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
}

export function WhatsAppManualModal({ onClose }: { onClose: () => void }) {
  useDismissable(onClose);
  const [selectedDate, setSelectedDate] = useState(tomorrowISO);
  const [data, setData] = useState<ListData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // URL base de la app para el enlace de confirmación (se lee en cliente).
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/whatsapp/manual-list?date=${selectedDate}`)
      .then((r) => r.json())
      .then((body) => {
        if (body.error) throw new Error(body.error);
        setData(body);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [selectedDate]);

  // "Con teléfono" = teléfono que normaliza a un número válido. Un valor basura
  // (letras, muy corto) cae en "sin teléfono" en vez de generar un enlace roto.
  const withPhone = data?.appts.filter((a) => normalizePhone(a.phone)) ?? [];
  const noPhone = data?.appts.filter((a) => !normalizePhone(a.phone)) ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-lg flex-col rounded-xl bg-white shadow-2xl ring-1 ring-slate-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-800">WhatsApp</h2>
            <p className="text-xs text-slate-500">
              Abre WhatsApp Web con el mensaje prellenado para cada paciente.
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
            <p className="py-8 text-center text-sm text-slate-400">Cargando citas…</p>
          )}
          {error && (
            <p className="py-8 text-center text-sm text-red-500">{error}</p>
          )}
          {!loading && !error && data && (
            <>
              {data.appts.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-400">
                  Sin citas para {data.date}.
                </p>
              )}

              {/* Citas CON teléfono */}
              {withPhone.length > 0 && (
                <div className="space-y-2">
                  {withPhone.map((a) => {
                    const msg = buildMessage(a, data.date, data.clinicName, origin);
                    const url = buildWaLink(a.phone, msg);
                    if (!url) return null;
                    return (
                      <div
                        key={a.id}
                        className="flex items-start justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold tabular-nums text-slate-500">
                              {hhmm(a.starts_at)}
                            </span>
                            <span className="truncate text-sm font-medium text-slate-800">
                              {a.patientName}
                            </span>
                          </div>
                          {a.dentistName && (
                            <p className="mt-0.5 truncate text-[11px] text-slate-400">
                              {a.dentistName}
                              {a.reason ? ` · ${a.reason}` : ""}
                            </p>
                          )}
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-400">
                            <Phone className="h-3 w-3" /> {a.phone}
                          </p>
                        </div>
                        <a
                          href={url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex shrink-0 items-center gap-1.5 rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Enviar
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Citas SIN teléfono */}
              {noPhone.length > 0 && (
                <div className="mt-4">
                  <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Sin teléfono registrado
                  </p>
                  <div className="space-y-1.5">
                    {noPhone.map((a) => (
                      <div
                        key={a.id}
                        className="flex items-center gap-3 rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2"
                      >
                        <PhoneOff className="h-3.5 w-3.5 shrink-0 text-slate-300" />
                        <div className="min-w-0 flex-1">
                          <span className="text-xs tabular-nums text-slate-400">
                            {hhmm(a.starts_at)}{" "}
                          </span>
                          <span className="text-sm text-slate-500">{a.patientName}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!loading && !error && withPhone.length > 1 && (
          <div className="border-t border-slate-100 px-5 py-3">
            <p className="text-[11px] text-slate-400">
              Haz clic en <strong>Enviar</strong> en cada fila para abrir WhatsApp Web
              con el mensaje listo. Solo debes presionar{" "}
              <strong>Enviar</strong> en WhatsApp.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
