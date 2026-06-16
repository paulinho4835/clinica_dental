"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";

// Sube un archivo de backup (.json) y lo restaura como una clínica NUEVA (clon).
// Nunca toca clínicas existentes; el clon aparece en la lista al terminar.
export function RestoreBackupButton() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const router = useRouter();

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite re-subir el mismo archivo
    if (!file) return;

    if (
      !window.confirm(
        `¿Restaurar "${file.name}" como una clínica NUEVA?\n\n` +
          "Se creará un clon con todos los datos del backup. " +
          "Las clínicas existentes NO se modifican.",
      )
    )
      return;

    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/superadmin/restore", {
        method: "POST",
        body: fd,
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
    <div className="flex flex-col items-end gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        onChange={onFile}
        className="hidden"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-200 disabled:cursor-wait disabled:opacity-60"
        title="Restaurar un backup como clínica nueva"
      >
        {busy ? (
          <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Upload className="h-3.5 w-3.5" />
        )}
        Restaurar backup
      </button>
      {msg && (
        <span
          className={`text-xs ${msg.type === "ok" ? "text-emerald-600" : "text-red-600"}`}
        >
          {msg.text}
        </span>
      )}
    </div>
  );
}
