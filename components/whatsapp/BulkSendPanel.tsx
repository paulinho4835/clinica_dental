"use client";

import { useState, useCallback } from "react";
import { PhoneOff, Send, CheckSquare, Square, RefreshCw } from "lucide-react";

type Appt = {
  id: string;
  name: string;
  phone: string | null;
  time: string;
  dentistName: string | null;
  text: string;
};

type ListData = {
  clinicName: string;
  dateLabel: string;
  appts: Appt[];
};

type Result = {
  ok: boolean;
  sent: number;
  failed: number;
  total: number;
  errors?: Array<{ phone: string; error: string }>;
  error?: string;
};

function tomorrowDate(): string {
  const t = new Date();
  t.setDate(t.getDate() + 1);
  return t.toLocaleDateString("en-CA", { timeZone: "America/La_Paz" });
}

const DELAY_OPTIONS = [
  { value: 3000, label: "3 segundos" },
  { value: 5000, label: "5 segundos (recomendado)" },
  { value: 8000, label: "8 segundos" },
  { value: 12000, label: "12 segundos (más seguro)" },
];

export function BulkSendPanel({ connected }: { connected: boolean }) {
  const [date, setDate] = useState(tomorrowDate());
  const [delayMs, setDelayMs] = useState(5000);
  const [listData, setListData] = useState<ListData | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadingList, setLoadingList] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const withPhone = listData?.appts.filter((a) => a.phone) ?? [];
  const withoutPhone = listData?.appts.filter((a) => !a.phone) ?? [];
  const selectedCount = [...selected].filter((id) =>
    withPhone.some((a) => a.id === id)
  ).length;
  const estimatedSecs = Math.ceil((selectedCount * delayMs) / 1000);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setResult(null);
    setListData(null);
    setSelected(new Set());
    try {
      const res = await fetch(`/api/whatsapp/bulk?date=${date}`);
      const data: ListData = await res.json();
      setListData(data);
      setSelected(new Set(data.appts.filter((a) => a.phone).map((a) => a.id)));
    } finally {
      setLoadingList(false);
    }
  }, [date]);

  function toggleAll() {
    if (selected.size === withPhone.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(withPhone.map((a) => a.id)));
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSend() {
    const toSend = withPhone.filter((a) => selected.has(a.id));
    if (toSend.length === 0) return;
    if (
      !confirm(
        `¿Enviar recordatorios a ${toSend.length} paciente(s) para ${listData?.dateLabel}?\n` +
          `Tiempo estimado: ~${estimatedSecs}s`
      )
    )
      return;

    setSending(true);
    setResult(null);
    try {
      const messages = toSend.map((a) => ({ phone: a.phone!, text: a.text }));
      const res = await fetch("/api/whatsapp/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages, delayMs }),
      });
      const data: Result = await res.json();
      setResult(data);
    } catch (e) {
      setResult({ ok: false, sent: 0, failed: selectedCount, total: selectedCount, error: String(e) });
    } finally {
      setSending(false);
    }
  }

  if (!connected) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
        WhatsApp Baileys no está conectado. Ve a{" "}
        <a href="/ajustes" className="underline font-medium">
          Ajustes
        </a>{" "}
        y escanea el QR para conectar tu número.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Config */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Fecha de citas</label>
            <input
              type="date"
              value={date}
              onChange={(e) => { setDate(e.target.value); setListData(null); setResult(null); }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">Delay entre mensajes</label>
            <select
              value={delayMs}
              onChange={(e) => setDelayMs(Number(e.target.value))}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            >
              {DELAY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={loadList}
            disabled={loadingList || sending}
            className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loadingList ? "animate-spin" : ""}`} />
            {loadingList ? "Cargando..." : "Cargar citas"}
          </button>
        </div>
      </div>

      {/* Lista de citas */}
      {listData && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
            <div>
              <span className="text-sm font-medium text-slate-700">{listData.dateLabel}</span>
              <span className="ml-2 text-xs text-slate-400">
                {withPhone.length} con teléfono
                {withoutPhone.length > 0 && `, ${withoutPhone.length} sin teléfono`}
              </span>
            </div>
            {withPhone.length > 0 && (
              <button
                onClick={toggleAll}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
              >
                {selected.size === withPhone.length ? (
                  <CheckSquare className="h-4 w-4" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
                {selected.size === withPhone.length ? "Deseleccionar todos" : "Seleccionar todos"}
              </button>
            )}
          </div>

          {listData.appts.length === 0 && (
            <p className="px-5 py-6 text-sm text-slate-500 text-center">
              No hay citas para esta fecha.
            </p>
          )}

          <ul className="divide-y divide-slate-100">
            {listData.appts.map((a) => (
              <li
                key={a.id}
                className={`flex items-start gap-3 px-5 py-3 transition-colors ${
                  a.phone ? "hover:bg-slate-50 cursor-pointer" : "opacity-50"
                }`}
                onClick={() => a.phone && toggleOne(a.id)}
              >
                <div className="mt-0.5 shrink-0">
                  {a.phone ? (
                    selected.has(a.id) ? (
                      <CheckSquare className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Square className="h-4 w-4 text-slate-300" />
                    )
                  ) : (
                    <PhoneOff className="h-4 w-4 text-slate-300" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-slate-800">{a.name}</span>
                    <span className="text-xs text-slate-400">{a.time}</span>
                    {a.dentistName && (
                      <span className="text-xs text-slate-400">· {a.dentistName}</span>
                    )}
                    {a.phone ? (
                      <span className="text-xs text-slate-400">{a.phone}</span>
                    ) : (
                      <span className="text-xs text-red-400">Sin teléfono</span>
                    )}
                  </div>
                  {a.phone && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setPreview(preview === a.id ? null : a.id); }}
                      className="text-xs text-slate-400 hover:text-slate-600 underline mt-0.5"
                    >
                      {preview === a.id ? "Ocultar mensaje" : "Ver mensaje"}
                    </button>
                  )}
                  {preview === a.id && (
                    <p className="mt-1.5 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-xs text-slate-700 leading-relaxed">
                      {a.text}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {/* Footer con acción */}
          {withPhone.length > 0 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-slate-100 bg-slate-50">
              <div className="text-xs text-slate-500">
                {selectedCount > 0
                  ? `${selectedCount} seleccionado(s) · ~${estimatedSecs}s de espera`
                  : "Ninguno seleccionado"}
              </div>
              <button
                onClick={handleSend}
                disabled={selectedCount === 0 || sending}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              >
                <Send className="h-4 w-4" />
                {sending
                  ? "Enviando..."
                  : `Enviar a ${selectedCount}`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Resultado */}
      {sending && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-700">
          Enviando mensajes con delay de {delayMs / 1000}s entre cada uno.
          Tiempo estimado: ~{estimatedSecs}s. No cierres esta página.
        </div>
      )}

      {result && (
        <div
          className={`rounded-xl border px-5 py-4 text-sm ${
            result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {result.error ? (
            <p>Error: {result.error}</p>
          ) : (
            <>
              <p className="font-medium">
                Enviados: {result.sent} / {result.total}
                {result.failed > 0 && ` · Fallidos: ${result.failed}`}
              </p>
              {result.errors && result.errors.length > 0 && (
                <ul className="mt-2 space-y-0.5 text-xs opacity-80">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e.phone}: {e.error}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
