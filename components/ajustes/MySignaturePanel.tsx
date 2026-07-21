"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Eraser, PenLine, Check, X } from "lucide-react";
import { SignaturePad, type SignaturePadRef } from "@/components/consents/SignaturePad";
import { saveMySignature } from "@/app/(dashboard)/ajustes/signature-actions";
import { toast } from "@/lib/toast";

const btn =
  "inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50";

// Firma personal del doctor: se usa para autocompletar sus recetas médicas
// impresas (identificada por el doctor que emite la receta, no por paciente).
export function MySignaturePanel({ currentSignature }: { currentSignature: string | null }) {
  const router = useRouter();
  const padRef = useRef<SignaturePadRef>(null);
  const [drawing, setDrawing] = useState(!currentSignature);
  const [busy, setBusy] = useState(false);

  async function save() {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) {
      toast("Dibuje su firma antes de guardar.", "error");
      return;
    }
    setBusy(true);
    const res = await saveMySignature(pad.toDataURL());
    setBusy(false);
    if (res.ok) {
      toast("Firma guardada", "success");
      setDrawing(false);
      router.refresh();
    } else {
      toast(res.error ?? "No se pudo guardar la firma", "error");
    }
  }

  async function remove() {
    setBusy(true);
    const res = await saveMySignature("");
    setBusy(false);
    if (res.ok) {
      toast("Firma eliminada", "success");
      setDrawing(true);
      router.refresh();
    } else {
      toast(res.error ?? "No se pudo eliminar la firma", "error");
    }
  }

  return (
    <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="max-w-sm">
        {currentSignature && !drawing ? (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={currentSignature}
              alt="Mi firma"
              className="h-32 w-full rounded-lg border border-slate-200 bg-[#ffffff] object-contain"
            />
            <div className="mt-2 flex gap-2">
              <button type="button" className={btn} onClick={() => setDrawing(true)}>
                <PenLine className="h-3.5 w-3.5" /> Volver a firmar
              </button>
              <button type="button" className={btn} disabled={busy} onClick={remove}>
                <X className="h-3.5 w-3.5" /> Borrar
              </button>
            </div>
          </div>
        ) : (
          <div>
            <SignaturePad ref={padRef} />
            <div className="mt-2 flex gap-2">
              <button type="button" className={btn} disabled={busy} onClick={save}>
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                {busy ? "Guardando…" : "Guardar firma"}
              </button>
              <button
                type="button"
                className={btn}
                onClick={() => padRef.current?.clear()}
              >
                <Eraser className="h-3.5 w-3.5" /> Limpiar
              </button>
              {currentSignature && (
                <button type="button" className={btn} onClick={() => setDrawing(false)}>
                  Cancelar
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
