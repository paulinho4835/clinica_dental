"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X } from "lucide-react";
import { saveEvolution } from "@/app/(dashboard)/pacientes/actions";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/Button";

export function EvolutionPanel({
  patientId,
  evolution,
  canWrite,
}: {
  patientId: string;
  evolution: string | null;
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(evolution ?? "");
  const [pending, start] = useTransition();
  const router = useRouter();

  function handleSave() {
    start(async () => {
      const res = await saveEvolution(patientId, value);
      if (res.error) {
        toast(res.error, "error");
      } else {
        setEditing(false);
        router.refresh();
        toast("Evolución guardada", "success");
      }
    });
  }

  function handleCancel() {
    setValue(evolution ?? "");
    setEditing(false);
  }

  if (!editing) {
    return (
      <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200">
        {evolution ? (
          <p className="whitespace-pre-wrap text-sm text-slate-700 leading-relaxed">
            {evolution}
          </p>
        ) : (
          <p className="text-sm text-slate-400 italic">
            Sin notas de evolución aún.
          </p>
        )}
        {canWrite && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-3 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-clinic transition-colors"
          >
            <Pencil className="h-3.5 w-3.5" />
            {evolution ? "Editar" : "Agregar notas"}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 space-y-3">
      <textarea
        autoFocus
        rows={6}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Describe la evolución del paciente, observaciones clínicas, respuesta al tratamiento…"
        className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic resize-y"
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={handleSave} disabled={pending}>
          <Check className="h-3.5 w-3.5" />
          {pending ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={handleCancel} disabled={pending}>
          <X className="h-3.5 w-3.5" />
          Cancelar
        </Button>
      </div>
    </div>
  );
}
