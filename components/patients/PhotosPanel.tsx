"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { ImagePlus, Trash2, Loader2, ExternalLink, Pencil, Check, X, Camera, ChevronLeft, ChevronRight, Columns2, Printer } from "lucide-react";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/toast";
import {
  requestPhotoUpload,
  registerPhoto,
  deletePhoto,
  updatePhotoMeta,
} from "@/app/(dashboard)/pacientes/photo-actions";

export type PhotoItem = {
  id: string;
  url: string; // URL firmada de lectura (expira en minutos)
  kind: string | null;
  caption: string | null;
  createdAt: string;
  uploaderName?: string | null;
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
      // SIN web worker a propósito: el worker de la librería carga su script
      // desde cdn.jsdelivr.net (importScripts), lo que viola nuestra CSP
      // (script-src 'self'). En el hilo principal usa el código ya empaquetado,
      // sin depender de un CDN externo. Para 1-pocas fotos es instantáneo.
      useWebWorker: false,
    });
  } catch {
    return { ok: false, error: "No se pudo procesar la imagen." };
  }

  // Dimensiones para guardar como metadato (opcional, mejora la galería).
  const dims = await imageDimensions(compressed).catch(() => null);

  const res = await requestPhotoUpload(patientId, "image/webp");
  if (!res.ok) return { ok: false, error: res.error };

  // DEBUG: loguea la URL firmada completa para diagnosticar CORS/TLS/path.
  // Quitar cuando el upload funcione en prod.
  console.log("[R2 upload] uploadUrl:", res.uploadUrl);

  try {
    const put = await fetch(res.uploadUrl, {
      method: "PUT",
      body: compressed,
      headers: { "Content-Type": "image/webp" },
    });
    if (!put.ok) {
      const body = await put.text().catch(() => "");
      console.error("[R2 upload] HTTP error", put.status, body);
      return { ok: false, error: `Falló la subida (HTTP ${put.status}). Ver consola.` };
    }
  } catch (err) {
    console.error("[R2 upload] fetch threw:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Error de red: ${msg}` };
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
  atLimit,
  clinicQuota,
  clinicUsed,
  showCounter,
}: {
  patientId: string;
  photos: PhotoItem[];
  canManage: boolean;
  /** R2 configurado en el servidor. Si no, mostramos aviso en vez de subir. */
  configured: boolean;
  /** Tope alcanzado (calculado en servidor; siempre disponible aunque se oculte el número). */
  atLimit: boolean;
  /** Tope de fotos de la clínica (configurable por el superadmin). */
  clinicQuota: number;
  /** Fotos usadas por TODA la clínica. Solo llega si el addon de contador está activo. */
  clinicUsed?: number;
  /** Mostrar el número de fotos a la clínica (addon "Ver contador de fotos"). */
  showCounter: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [kind, setKind] = useState("intraoral");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  // Filtro por tipo, visor (lightbox) y modo comparación antes/después.
  const [filterKind, setFilterKind] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareSel, setCompareSel] = useState<string[]>([]);

  // Conteo por tipo (para los chips de filtro) y lista visible según el filtro.
  const countsByKind = photos.reduce<Record<string, number>>((acc, p) => {
    const k = p.kind ?? "otro";
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  const visiblePhotos = filterKind
    ? photos.filter((p) => (p.kind ?? "otro") === filterKind)
    : photos;

  function onThumbClick(p: PhotoItem, idx: number) {
    if (compareMode) {
      setCompareSel((sel) =>
        sel.includes(p.id)
          ? sel.filter((x) => x !== p.id)
          : sel.length < 2
            ? [...sel, p.id]
            : [sel[1], p.id],
      );
    } else {
      setLightboxIndex(idx);
    }
  }

  const comparePair = compareSel
    .map((id) => photos.find((p) => p.id === id))
    .filter((p): p is PhotoItem => Boolean(p));

  // Si la clínica ve el número, podemos recortar el lote a lo que queda; si no,
  // dejamos subir y el servidor corta el excedente (sin revelar cifras).
  const remaining =
    showCounter && clinicUsed !== undefined
      ? Math.max(0, clinicQuota - clinicUsed)
      : null;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    let list = Array.from(files);
    if (remaining !== null && list.length > remaining) {
      toast(
        `La clínica solo tiene espacio para ${remaining} foto${remaining !== 1 ? "s" : ""} más. Se subirán las primeras ${remaining}.`,
        "error",
      );
      list = list.slice(0, remaining);
    }
    if (list.length === 0) return;
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

  // Edición de etiqueta/descripción de una foto ya subida.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editKind, setEditKind] = useState("intraoral");
  const [editCaption, setEditCaption] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  function startEdit(p: PhotoItem) {
    setEditingId(p.id);
    setEditKind(p.kind ?? "otro");
    setEditCaption(p.caption ?? "");
  }

  async function saveEdit(id: string) {
    setSavingEdit(true);
    const res = await updatePhotoMeta({ photoId: id, kind: editKind, caption: editCaption });
    setSavingEdit(false);
    if (res.error) toast(res.error, "error");
    else {
      setEditingId(null);
      toast("Foto actualizada", "success");
      router.refresh();
    }
  }

  return (
    <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="font-semibold text-slate-800">Fotos</h2>
          {canManage && configured && showCounter && clinicUsed !== undefined && (
            <span
              className="text-xs text-slate-400"
              title="Fotos usadas por toda la clínica"
            >
              clínica: {clinicUsed.toLocaleString("es-BO")}/{clinicQuota.toLocaleString("es-BO")}
            </span>
          )}
          {canManage && configured && photos.length > 0 && (
            <a
              href={`/pacientes/${patientId}/fotos`}
              target="_blank"
              rel="noopener noreferrer"
              title="Imprimir informe fotográfico (antes/después)"
              className="inline-flex items-center gap-1 text-xs font-medium text-clinic hover:underline"
            >
              <Printer className="h-3.5 w-3.5" /> Informe
            </a>
          )}
        </div>

        {canManage && configured && (
          <div className="flex items-center gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              disabled={busy || atLimit}
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
              disabled={busy || atLimit}
              title={atLimit ? "Tope de fotos de la clínica alcanzado" : undefined}
              onClick={() => inputRef.current?.click()}
              className="flex items-center gap-1.5 rounded-md bg-clinic px-3 py-1.5 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {progress ? `${progress.done}/${progress.total}` : "Subiendo…"}
                </>
              ) : atLimit ? (
                <>
                  <ImagePlus className="h-4 w-4" /> Límite alcanzado
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
            {/* Captura directa: en tablet/móvil abre la cámara trasera (chairside). */}
            <button
              type="button"
              disabled={busy || atLimit}
              title="Tomar foto con la cámara"
              onClick={() => cameraRef.current?.click()}
              className="flex items-center justify-center rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              <Camera className="h-4 w-4" />
            </button>
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
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
        <>
          {/* Filtro por tipo + comparación antes/después */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <FilterChip
              label="Todas"
              count={photos.length}
              active={filterKind === null}
              onClick={() => setFilterKind(null)}
            />
            {KIND_OPTIONS.filter((o) => countsByKind[o.value]).map((o) => (
              <FilterChip
                key={o.value}
                label={o.label}
                count={countsByKind[o.value]}
                active={filterKind === o.value}
                onClick={() => setFilterKind(o.value)}
              />
            ))}
            <button
              type="button"
              onClick={() => {
                setCompareMode((v) => !v);
                setCompareSel([]);
              }}
              className={`ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                compareMode
                  ? "bg-clinic text-white ring-clinic"
                  : "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200"
              }`}
            >
              <Columns2 className="h-3.5 w-3.5" />
              {compareMode ? "Comparando…" : "Comparar"}
            </button>
          </div>
          {compareMode && (
            <p className="mb-2 text-xs text-slate-500">
              Elige 2 fotos para verlas lado a lado ({compareSel.length}/2).
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {visiblePhotos.map((p, idx) => (
            <div
              key={p.id}
              className={`group relative overflow-hidden rounded-lg ring-1 transition ${
                compareMode && compareSel.includes(p.id)
                  ? "ring-2 ring-clinic"
                  : "ring-slate-200"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.caption ?? KIND_LABEL[p.kind ?? ""] ?? "Foto"}
                loading="lazy"
                onClick={() => editingId !== p.id && onThumbClick(p, idx)}
                title={
                  p.uploaderName
                    ? `Subida por ${p.uploaderName} · ${new Date(p.createdAt).toLocaleDateString("es-BO")}`
                    : new Date(p.createdAt).toLocaleDateString("es-BO")
                }
                className="aspect-square w-full cursor-pointer object-cover"
              />
              {compareMode && compareSel.includes(p.id) && (
                <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-clinic text-[11px] font-bold text-white">
                  {compareSel.indexOf(p.id) + 1}
                </span>
              )}
              {p.kind && (
                <span className="absolute left-1 top-1 rounded bg-black/55 px-1.5 py-0.5 text-[10px] font-medium text-white">
                  {KIND_LABEL[p.kind] ?? p.kind}
                </span>
              )}
              {p.caption && editingId !== p.id && (
                <span className="absolute inset-x-0 top-0 truncate bg-black/45 px-1.5 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                  {p.caption}
                </span>
              )}

              {/* Editor inline de etiqueta + descripción. */}
              {editingId === p.id ? (
                <div className="absolute inset-0 flex flex-col gap-1 bg-black/70 p-1.5">
                  <select
                    value={editKind}
                    onChange={(e) => setEditKind(e.target.value)}
                    className="rounded bg-white/95 px-1 py-1 text-xs text-slate-700"
                  >
                    {KIND_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  <input
                    value={editCaption}
                    onChange={(e) => setEditCaption(e.target.value)}
                    placeholder="Descripción…"
                    maxLength={200}
                    className="rounded bg-white/95 px-1.5 py-1 text-xs text-slate-700"
                  />
                  <div className="mt-auto flex justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => saveEdit(p.id)}
                      disabled={savingEdit}
                      title="Guardar"
                      className="rounded bg-clinic p-1 text-white hover:bg-clinic-fg disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      title="Cancelar"
                      className="rounded bg-white/20 p-1 text-white hover:bg-white/30"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ) : (
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
                      onClick={() => startEdit(p)}
                      title="Editar etiqueta/descripción"
                      className="rounded p-1 text-white hover:bg-white/20"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
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
              )}
            </div>
          ))}
          </div>
        </>
      )}

      {/* Visor (lightbox) de una foto con navegación */}
      {lightboxIndex !== null && visiblePhotos[lightboxIndex] && (
        <Lightbox
          photos={visiblePhotos}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onNav={(i) => setLightboxIndex(i)}
        />
      )}

      {/* Comparación antes/después lado a lado */}
      {compareMode && comparePair.length === 2 && (
        <CompareOverlay
          left={comparePair[0]}
          right={comparePair[1]}
          onClose={() => setCompareSel([])}
        />
      )}
    </div>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
        active
          ? "bg-clinic text-white"
          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {label} <span className={active ? "text-white/70" : "text-slate-400"}>{count}</span>
    </button>
  );
}

function Lightbox({
  photos,
  index,
  onClose,
  onNav,
}: {
  photos: PhotoItem[];
  index: number;
  onClose: () => void;
  onNav: (i: number) => void;
}) {
  const p = photos[index];
  const prev = () => onNav((index - 1 + photos.length) % photos.length);
  const next = () => onNav((index + 1) % photos.length);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        title="Cerrar"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      {photos.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); prev(); }}
            title="Anterior"
            className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); next(); }}
            title="Siguiente"
            className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}
      <figure className="flex max-h-full max-w-full flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={p.url} alt={p.caption ?? "Foto"} className="max-h-[80vh] max-w-full rounded-lg object-contain" />
        <figcaption className="text-center text-xs text-white/80">
          {p.kind && <span className="mr-2 rounded bg-white/15 px-1.5 py-0.5">{KIND_LABEL[p.kind] ?? p.kind}</span>}
          {p.caption && <span>{p.caption} · </span>}
          {p.uploaderName && <span>{p.uploaderName} · </span>}
          {new Date(p.createdAt).toLocaleDateString("es-BO")}
        </figcaption>
      </figure>
    </div>
  );
}

function CompareOverlay({
  left,
  right,
  onClose,
}: {
  left: PhotoItem;
  right: PhotoItem;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4" onClick={onClose}>
      <button
        type="button"
        onClick={onClose}
        title="Cerrar"
        className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      <div className="grid w-full max-w-5xl grid-cols-2 gap-3" onClick={(e) => e.stopPropagation()}>
        {[left, right].map((p, i) => (
          <figure key={p.id} className="flex flex-col items-center gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt={p.caption ?? "Foto"} className="max-h-[78vh] w-full rounded-lg object-contain" />
            <figcaption className="text-center text-xs text-white/80">
              <span className="mr-1 rounded bg-white/15 px-1.5 py-0.5">{i === 0 ? "Izquierda" : "Derecha"}</span>
              {p.kind && <span className="mr-1">{KIND_LABEL[p.kind] ?? p.kind}</span>}
              {new Date(p.createdAt).toLocaleDateString("es-BO")}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
