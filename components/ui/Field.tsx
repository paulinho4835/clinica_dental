import { cn } from "@/lib/cn";

// Clases base compartidas para inputs/selects/textarea. Antes estaban repetidas
// en cada formulario; ahora viven en un solo lugar.
export const fieldInputClass =
  "w-full rounded-md border border-slate-300 bg-transparent px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic disabled:cursor-not-allowed disabled:bg-slate-50 dark:bg-black/20";

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
  ...props
}: {
  label: string;
  inputClassName?: string;
  invalid?: boolean;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={cn("block text-sm", className)}>
      <FieldLabel>{label}</FieldLabel>
      <input
        className={cn(
          fieldInputClass,
          invalid && "border-red-400 focus:border-red-500 focus:ring-red-500",
          inputClassName,
        )}
        {...props}
      />
    </label>
  );
}
