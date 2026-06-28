"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

// Restaura un respaldo ya guardado en R2 (de la lista de respaldos automáticos)
// como una clínica NUEVA (clon), sin tener que descargar y re-subir el archivo.
export function R2RestoreButton({
  storageKey,
  clinicName,
}: {
  storageKey: string;
  clinicName: string;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const router = useRouter();

  async function run() {
    if (
      !window.confirm(
        `¿Restaurar el último respaldo de "${clinicName}" como una clínica NUEVA?\n\n` +
          "Se creará un clon con todos los datos del respaldo. " +
          "Las clínicas existentes NO se modifican.",
      )
    )
      return;

    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/superadmin/restore-from-r2", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey }),
      });
      const json = await res.json();
      if (res.ok && json.ok) {
        setMsg({ type: "ok", text: `Restaurada como "${json.name}".` });
        router.refresh();
      } else {
        setMsg({ type: "err", text: json.message ?? "No se pudo restaurar." });
      }
    } catch {
      setMsg({ type: "err", text: "Error de red al restaurar." });
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
        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200 disabled:cursor-wait disabled:opacity-60"
        title="Restaurar este respaldo como clínica nueva"
      >
        {busy ? (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Upload className="h-3 w-3" />
        )}
        Restaurar
      </button>
      {msg && (
        <span className={`text-xs ${msg.type === "ok" ? "text-emerald-600" : "text-red-600"}`}>
          {msg.text}
        </span>
      )}
    </span>
  );
}
