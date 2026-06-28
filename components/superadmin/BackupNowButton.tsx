"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DatabaseBackup } from "lucide-react";

// Dispara un respaldo MANUAL a R2 de esta clínica (se suma al historial de
// respaldos automáticos). Distinto de "Descargar backup", que baja el .json a tu
// computadora sin guardarlo en R2.
export function BackupNowButton({ clinicId }: { clinicId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const router = useRouter();

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/superadmin/backup-now", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clinicId }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMsg({ type: "ok", text: "Respaldo guardado en R2." });
        router.refresh();
      } else {
        setMsg({ type: "err", text: json.message ?? "No se pudo respaldar." });
      }
    } catch {
      setMsg({ type: "err", text: "Error de red al respaldar." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full bg-clinic/10 px-3 py-1.5 text-xs font-medium text-clinic-fg transition hover:bg-clinic/20 disabled:cursor-wait disabled:opacity-60"
        title="Respaldar ahora a R2 (se suma al historial)"
      >
        {busy ? (
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <DatabaseBackup className="h-3.5 w-3.5" />
        )}
        Respaldar ahora
      </button>
      {msg && (
        <span className={`text-xs ${msg.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
