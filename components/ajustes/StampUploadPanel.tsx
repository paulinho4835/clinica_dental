"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { Upload, Trash2 } from "lucide-react";
import { saveMyStamp } from "@/app/(dashboard)/ajustes/stamp-actions";
import { toast } from "@/lib/toast";

const btn =
  "inline-flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50";

// Comprime la foto del sello a un tamaño chico antes de guardarla como data
// URL — un sello no necesita más que unos cientos de KB. useWebWorker:false
// porque el worker de la librería carga su script desde un CDN externo, lo
// que viola la CSP del proyecto (script-src 'self'); en el hilo principal es
// instantáneo para una sola imagen.
async function fileToCompressedDataUrl(file: File): Promise<string> {
  const compressed = await imageCompression(file, {
    maxSizeMB: 0.3,
    maxWidthOrHeight: 500,
    fileType: "image/webp",
    useWebWorker: false,
  });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(compressed);
  });
}

// Sello personal del doctor: se usa para autocompletar sus recetas médicas
// impresas (identificado por el doctor que emite la receta, no por paciente).
export function StampUploadPanel({ currentStamp }: { currentStamp: string | null }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    try {
      const dataUrl = await fileToCompressedDataUrl(file);
      const res = await saveMyStamp(dataUrl);
      if (res.ok) {
        toast("Sello guardado", "success");
        router.refresh();
      } else {
        toast(res.error ?? "No se pudo guardar el sello", "error");
      }
    } catch {
      toast("No se pudo procesar la imagen", "error");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    const res = await saveMyStamp("");
    setBusy(false);
    if (res.ok) {
      toast("Sello eliminado", "success");
      router.refresh();
    } else {
      toast(res.error ?? "No se pudo eliminar el sello", "error");
    }
  }

  return (
    <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="max-w-sm">
        {currentStamp && (
          <img
            src={currentStamp}
            alt="Mi sello"
            className="mb-2 h-32 w-full rounded-lg border border-slate-200 bg-[#ffffff] object-contain"
          />
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
        <div className="flex gap-2">
          <button
            type="button"
            className={btn}
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="h-3.5 w-3.5" />
            {busy ? "Procesando…" : currentStamp ? "Reemplazar" : "Subir foto del sello"}
          </button>
          {currentStamp && (
            <button type="button" className={btn} disabled={busy} onClick={remove}>
              <Trash2 className="h-3.5 w-3.5" /> Quitar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
