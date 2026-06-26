"use client";

import { useRef, useState } from "react";
import { Eraser, PenLine, Check, X } from "lucide-react";
import { SignaturePad, type SignaturePadRef } from "@/components/consents/SignaturePad";

const btn =
  "inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50";

// Campo de firma digital opcional. Controlado: `value` es un data URL PNG ("" si
// no hay firma). Muestra la firma guardada como imagen y permite volver a firmar
// o borrarla; en modo dibujo expone el lienzo del SignaturePad.
export function FirmaField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const padRef = useRef<SignaturePadRef>(null);
  const [drawing, setDrawing] = useState(false);

  function apply() {
    const pad = padRef.current;
    if (pad && !pad.isEmpty()) onChange(pad.toDataURL());
    setDrawing(false);
  }

  if (value && !drawing) {
    return (
      <div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value}
          alt="Firma del paciente"
          className="h-32 w-full rounded-lg border border-slate-200 bg-white object-contain"
        />
        <div className="mt-2 flex gap-2">
          <button type="button" className={btn} onClick={() => setDrawing(true)}>
            <PenLine className="h-3.5 w-3.5" /> Volver a firmar
          </button>
          <button type="button" className={btn} onClick={() => onChange("")}>
            <X className="h-3.5 w-3.5" /> Borrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SignaturePad ref={padRef} />
      <div className="mt-2 flex gap-2">
        <button type="button" className={btn} onClick={apply}>
          <Check className="h-3.5 w-3.5 text-emerald-500" /> Aplicar firma
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => padRef.current?.clear()}
        >
          <Eraser className="h-3.5 w-3.5" /> Limpiar
        </button>
        {value && (
          <button
            type="button"
            className={btn}
            onClick={() => setDrawing(false)}
          >
            Cancelar
          </button>
        )}
      </div>
    </div>
  );
}
