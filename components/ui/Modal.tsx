"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

// Modal accesible reutilizable:
// - cierra con Escape (el click en el fondo NO cierra: un click accidental
//   fuera del panel no debe borrar un formulario a medio llenar)
// - bloquea el scroll del body mientras está abierto
// - role="dialog" + aria-modal + foco inicial al abrir
const SIZES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
  "2xl": "max-w-4xl",
} as const;

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  size = "md",
  className,
}: {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // onClose casi siempre es una función nueva en cada render del padre (p.ej.
  // `onClose={() => setOpen(false)}` o un handler no memoizado). Si el efecto
  // de abajo dependiera de onClose, escribir en un input dentro del modal
  // (que re-renderiza al padre en cada tecla) volvería a disparar el efecto y
  // robaría el foco de vuelta al panel — el usuario tendría que hacer click
  // de nuevo tras cada letra. Guardamos la versión más reciente en un ref para
  // no necesitarla en las dependencias.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Escape para cerrar + bloqueo de scroll del body + foco inicial.
  // Depende SOLO de `open`: debe correr una vez al abrir/cerrar, no en cada
  // re-render del padre.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCloseRef.current();
    }
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Foco inicial dentro del modal (accesibilidad de teclado).
    panelRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "max-h-[90vh] w-full overflow-y-auto rounded-lg bg-white p-5 shadow-xl outline-none",
          SIZES[size],
          className,
        )}
      >
        {(title || subtitle) && (
          <div className="mb-3 flex items-start justify-between">
            <div>
              {title && (
                <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
              )}
              {subtitle && (
                <p className="text-sm text-slate-500">{subtitle}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
