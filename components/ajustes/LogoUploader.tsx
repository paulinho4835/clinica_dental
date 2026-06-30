"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import imageCompression from "browser-image-compression";
import { ImagePlus, Trash2, Loader2 } from "lucide-react";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/toast";
import {
  requestLogoUpload,
  registerLogo,
  removeLogo,
} from "@/app/(dashboard)/ajustes/logo-actions";

// Sube el logo: comprime en el navegador (salvo SVG) → pide URL firmada → PUT
// directo a R2 → registra la referencia.
async function uploadLogo(file: File): Promise<{ ok: boolean; error?: string }> {
  const isSvg = file.type === "image/svg+xml";
  let upload: File = file;
  let contentType = file.type;

  if (!isSvg) {
    // Normaliza a WebP (~150 KB máx). Los logos suelen tener transparencia, que
    // WebP preserva. El SVG se sube tal cual (ya es liviano y vectorial).
    try {
      upload = await imageCompression(file, {
        maxSizeMB: 0.15,
        maxWidthOrHeight: 600,
        fileType: "image/webp",
        // SIN web worker: el worker carga su script de un CDN externo y viola la
        // CSP (script-src 'self'). En el hilo principal usa el código empaquetado.
        useWebWorker: false,
      });
      contentType = "image/webp";
    } catch {
      return { ok: false, error: "No se pudo procesar la imagen." };
    }
  }

  const res = await requestLogoUpload(contentType);
  if (!res.ok) return { ok: false, error: res.error };

  try {
    const put = await fetch(res.uploadUrl, {
      method: "PUT",
      body: upload,
      headers: { "Content-Type": contentType },
    });
    if (!put.ok) return { ok: false, error: `Falló la subida (HTTP ${put.status}).` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Error de red al subir: ${msg}` };
  }

  const reg = await registerLogo(res.key);
  if (reg.error) return { ok: false, error: reg.error };
  return { ok: true };
}

export function LogoUploader({
  currentLogoUrl,
  canWrite,
  configured,
}: {
  /** URL firmada del logo actual (o null si no hay). */
  currentLogoUrl: string | null;
  canWrite: boolean;
  /** R2 configurado en el servidor. Si no, mostramos aviso en vez de subir. */
  configured: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setBusy(true);
    const r = await uploadLogo(file);
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    if (r.ok) {
      toast("Logo actualizado", "success");
      router.refresh();
    } else {
      toast(r.error ?? "No se pudo subir el logo", "error");
    }
  }

  async function handleRemove() {
    const ok = await confirm({
      title: "Quitar logo",
      message: "¿Quitar el logo de los documentos impresos?",
      confirmText: "Quitar",
      tone: "danger",
    });
    if (!ok) return;
    const res = await removeLogo();
    if (res.error) toast(res.error, "error");
    else {
      toast("Logo eliminado", "success");
      router.refresh();
    }
  }

  return (
    <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
      {!configured ? (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          El almacenamiento aún no está configurado. Falta conectar las
          credenciales de R2.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-5">
          {/* Vista previa */}
          <div className="flex h-24 w-40 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 p-2">
            {currentLogoUrl ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={currentLogoUrl}
                alt="Logo de la clínica"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <span className="text-center text-xs text-slate-400">
                Sin logo
              </span>
            )}
          </div>

          {canWrite && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => inputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-md bg-clinic px-3 py-1.5 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
                >
                  {busy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Subiendo…
                    </>
                  ) : (
                    <>
                      <ImagePlus className="h-4 w-4" />{" "}
                      {currentLogoUrl ? "Cambiar logo" : "Subir logo"}
                    </>
                  )}
                </button>
                {currentLogoUrl && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleRemove}
                    title="Quitar logo"
                    className="inline-flex items-center justify-center rounded-md border border-slate-200 p-2 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <p className="max-w-xs text-[11px] text-slate-400">
                PNG, JPG, WebP o SVG. Idealmente con fondo transparente. Se
                mostrará en presupuestos, recetas, consentimientos y demás
                documentos impresos.
              </p>
              <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => handleFile(e.target.files)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
