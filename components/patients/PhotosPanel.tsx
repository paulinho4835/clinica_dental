"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { ImagePlus, Trash2, Loader2, ExternalLink } from "lucide-react";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/toast";
import {
  requestPhotoUpload,
  registerPhoto,
  deletePhoto,
} from "@/app/(dashboard)/pacientes/photo-actions";

export type PhotoItem = {
  id: string;
  url: string; // URL firmada de lectura (expira en minutos)
  kind: string | null;
  caption: string | null;
  createdAt: string;
};

const KIND_LABEL: Record<string, string> = {
  intraoral: "Intraoral",
  radiografia: "Radiografía",
  antes: "Antes",
  despues: "Después",
  otro: "Otro",
};

const KIND_OPTIONS = [
  { value: "intraoral", label: "Intraoral" },
  { value: "radiografia", label: "Radiografía" },
  { value: "antes", label: "Antes" },
  { value: "despues", label: "Después" },
  { value: "otro", label: "Otro" },
];

// Sube una sola imagen: comprime en el navegador → pide URL firmada → PUT directo
// a R2 → registra la referencia. Devuelve true si todo salió bien.
async function uploadOne(
  file: File,
  patientId: string,
  kind: string,
): Promise<{ ok: boolean; error?: string }> {
  // Comprime y normaliza a WebP (~200-300 KB). Esta es la palanca de costo.
  let compressed: File;
  try {
    compressed = await imageCompression(file, {
      maxSizeMB: 0.3,
      maxWidthOrHeight: 1600,
      fileType: "image/webp",
      useWebWorker: true,
    });
  } catch {
    return { ok: false, error: "No se pudo procesar la imagen." };
  }

  // Dimensiones para guardar como metadato (opcional, mejora la galería).
  const dims = await imageDimensions(compressed).catch(() => null);

  const res = await requestPhotoUpload(patientId, "image/webp");
  if (!res.ok) return { ok: false, error: res.error };

  try {
    const put = await fetch(res.uploadUrl, {
      method: "PUT",
      body: compressed,
      headers: { "Content-Type": "image/webp" },
    });
    if (!put.ok) return { ok: false, error: `Falló la subida (HTTP ${put.status}).` };
  } catch {
    return { ok: false, error: "Error de red al subir la imagen." };
  }

  const reg = await registerPhoto({
    patientId,
    key: res.key,
    kind,
    width: dims?.width,
    height: dims?.height,
    sizeBytes: compressed.size,
  });
  if (reg.error) return { ok: false, error: reg.error };
  return { ok: true };
}

function imageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("dimensions"));
    };
    img.src = url;
  });
}

export function PhotosPanel({
  patientId,
  photos,
  canManage,
  configured,
}: {
  patientId: string;
  photos: PhotoItem[];
  canManage: boolean;
  /** R2 configurado en el servidor. Si no, mostramos aviso en vez de subir. */
  configured: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("intraoral");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setBusy(true);
    setProgress({ done: 0, total: list.length });
    let okCount = 0;
    let lastError = "";
    for (let i = 0; i < list.length; i++) {
      const r = await uploadOne(list[i], patientId, kind);
      if (r.ok) okCount++;
      else lastError = r.error ?? "Error";
      setProgress({ done: i + 1, total: list.length });
    }
    setBusy(false);
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
    if (okCount > 0) {
      toast(`${okCount} foto${okCount !== 1 ? "s" : ""} subida${okCount !== 1 ? "s" : ""}`, "success");
      router.refresh();
    }
    if (okCount < list.length) toast(lastError || "Algunas fotos fallaron", "error");
  }

  async function handleDelete(id: string) {
    const ok = await confirm({
      title: "Eliminar foto",
      message: "¿Eliminar esta foto? No se puede deshacer.",
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    const res = await deletePhoto(id);
    if (res.error) toast(res.error, "error");
    else {
      toast("Foto eliminada", "success");
      router.refresh();
    }
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-slate-800">Fotos</h2>

        {canManage && configured && (
          <div className="flex items-center gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              disabled={busy}
              className="rounded-md border border-slate-200 bg-white py-1.5 pl-2 pr-7 text-sm text-slate-700 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic disabled:opacity-50"
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-md bg-clinic px-3 py-1.5 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {progress ? `${progress.done}/${progress.total}` : "Subiendo…"}
                </>
              ) : (
                <>
                  <ImagePlus className="h-4 w-4" /> Subir fotos
                </>
              )}
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
          </div>
        )}
      </div>

      {!configured && canManage && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          El almacenamiento de fotos aún no está configurado. Falta conectar las
          credenciales de R2.
        </p>
      )}

      {photos.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          Sin fotos para este paciente.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {photos.map((p) => (
            <div
              key={p.id}
              className="group relative overflow-hidden rounded-lg ring-1 ring-slate-200"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.caption ?? KIND_LABEL[p.kind ?? ""] ?? "Foto"}
                loading="lazy"
                className="aspect-square w-full object-cover"
              />
              {p.kind && (
                <span className="absolute left-1 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {KIND_LABEL[p.kind] ?? p.kind}
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-end gap-1 bg-gradient-to-t from-black/55 to-transparent p-1 opacity-0 transition group-hover:opacity-100">
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Ver tamaño completo"
                  className="rounded p-1 text-white hover:bg-white/20"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
                {canManage && (
                  <button
                    type="button"
                    onClick={() => handleDelete(p.id)}
                    title="Eliminar"
                    className="rounded p-1 text-white hover:bg-red-500/70"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
