"use client";

import { useEffect, useState, useCallback } from "react";

type Status = {
  connected: boolean;
  hasQR: boolean;
  enabled: boolean;
  serviceDown?: boolean;
};

type QRData = {
  connected: boolean;
  qr: string | null;
  serviceDown?: boolean;
};

export function WhatsAppPanel({ canWrite }: { canWrite: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [qrData, setQrData] = useState<QRData | null>(null);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);

  const fetchStatus = useCallback(async () => {
    const res = await fetch("/api/whatsapp/status");
    const data = await res.json();
    setStatus(data);
    return data as Status;
  }, []);

  const fetchQR = useCallback(async () => {
    const res = await fetch("/api/whatsapp/qr");
    const data = await res.json();
    setQrData(data);
    return data as QRData;
  }, []);

  // Carga inicial
  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Polling mientras se espera QR o conexión
  useEffect(() => {
    if (!polling) return;
    const interval = setInterval(async () => {
      const [s, q] = await Promise.all([fetchStatus(), fetchQR()]);
      if (s.connected || q.connected) {
        setPolling(false);
        setQrData(null);
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [polling, fetchStatus, fetchQR]);

  async function handleConnect() {
    setLoading(true);
    try {
      const res = await fetch("/api/whatsapp/connect", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setPolling(true);
        await fetchQR();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("¿Desconectar WhatsApp de esta clínica?")) return;
    setLoading(true);
    try {
      await fetch("/api/whatsapp/connect", { method: "DELETE" });
      setPolling(false);
      setQrData(null);
      await fetchStatus();
    } finally {
      setLoading(false);
    }
  }

  if (!status) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Cargando estado de WhatsApp...
      </div>
    );
  }

  if (status.serviceDown) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
        El servicio WhatsApp no está disponible. Verifica que <code>whatsapp-service</code> esté corriendo.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
      {/* Estado */}
      <div className="flex items-center gap-3">
        <span
          className={`inline-flex h-3 w-3 rounded-full ${
            status.connected ? "bg-emerald-500" : "bg-slate-300"
          }`}
        />
        <span className="text-sm font-medium text-slate-700">
          {status.connected ? "Conectado" : "Desconectado"}
        </span>
        {polling && !status.connected && (
          <span className="text-xs text-slate-400 animate-pulse">
            Esperando escaneo del QR...
          </span>
        )}
      </div>

      {/* QR */}
      {!status.connected && qrData?.qr && (
        <div className="flex flex-col items-center gap-2 py-4">
          <p className="text-sm text-slate-600">
            Escanea con WhatsApp: <br className="sm:hidden" />
            <span className="text-slate-400 text-xs">
              Ajustes → Dispositivos vinculados → Vincular dispositivo
            </span>
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrData.qr} alt="QR WhatsApp" className="w-48 h-48 rounded-lg border border-slate-200" />
          <p className="text-xs text-slate-400">El QR expira en ~60 segundos</p>
        </div>
      )}

      {/* Acciones */}
      {canWrite && (
        <div className="flex gap-3 pt-1">
          {!status.connected && (
            <button
              onClick={handleConnect}
              disabled={loading || polling}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {loading ? "Conectando..." : polling ? "Esperando QR..." : "Conectar"}
            </button>
          )}
          {status.connected && (
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {loading ? "Desconectando..." : "Desconectar"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
