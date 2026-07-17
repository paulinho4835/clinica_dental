"use client";

import { useEffect, useState } from "react";
import { Copy, Check } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { fieldInputClass, FieldLabel } from "@/components/ui/Field";
import { getFreeSlotsText } from "@/app/(dashboard)/agenda/actions";
import { type DoctorOption } from "./apptHelpers";

const DAY_OPTIONS = [3, 5, 7] as const;

export function FreeSlotsModal({
  doctors,
  onClose,
}: {
  doctors: DoctorOption[];
  onClose: () => void;
}) {
  const [dentistId, setDentistId] = useState(doctors[0]?.id ?? "");
  const [days, setDays] = useState<3 | 5 | 7>(5);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!dentistId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setCopied(false);
    getFreeSlotsText(dentistId, days).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if ("error" in res) {
        setError(res.error);
        setText("");
      } else {
        setText(res.text);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [dentistId, days]);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("No se pudo copiar. Selecciónalo y cópialo manualmente.");
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Horarios libres"
      subtitle="Genera un texto listo para copiar y pegar en WhatsApp."
      size="lg"
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-3">
          <label className="min-w-[180px] flex-1 text-sm">
            <FieldLabel>Doctor</FieldLabel>
            <select
              className={fieldInputClass}
              value={dentistId}
              onChange={(e) => setDentistId(e.target.value)}
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="w-28 text-sm">
            <FieldLabel>Próximos</FieldLabel>
            <select
              className={fieldInputClass}
              value={days}
              onChange={(e) => setDays(Number(e.target.value) as 3 | 5 | 7)}
            >
              {DAY_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n} días
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 dark:bg-red-500/10">{error}</p>
        )}

        <textarea
          readOnly
          value={loading ? "Calculando..." : text}
          rows={10}
          onFocus={(e) => e.target.select()}
          className="w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
        />

        <Button type="button" onClick={copy} disabled={loading || !text}>
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5" /> Copiado
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" /> Copiar
            </>
          )}
        </Button>
      </div>
    </Modal>
  );
}
