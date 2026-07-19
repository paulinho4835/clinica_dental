"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/cn";

// Clases base compartidas para inputs/selects/textarea. Antes estaban repetidas
// en cada formulario; ahora viven en un solo lugar.
export const fieldInputClass =
  "w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400";

export function FieldLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("mb-1 block text-slate-600", className)}>{children}</span>
  );
}

// Campo de texto/numérico/fecha con etiqueta. Cubre el caso más común de los
// formularios (pacientes, caja, citas).
export function Field({
  label,
  className,
  inputClassName,
  invalid,
  type,
  ...props
}: {
  label: string;
  inputClassName?: string;
  invalid?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";

  return (
    <label className={cn("block text-sm", className)}>
      <FieldLabel>{label}</FieldLabel>
      <div className="relative">
        <input
          type={isPassword && reveal ? "text" : type}
          className={cn(
            fieldInputClass,
            isPassword && "pr-9",
            invalid && "border-red-400 focus:border-red-500 focus:ring-red-500",
            inputClassName,
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setReveal((v) => !v)}
            tabIndex={-1}
            aria-label={reveal ? "Ocultar contraseña" : "Mostrar contraseña"}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-slate-400 hover:text-slate-600"
          >
            {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        )}
      </div>
    </label>
  );
}
