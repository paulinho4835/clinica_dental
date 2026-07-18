import { cn } from "@/lib/cn";

interface Props {
  /** sm: sidebar/franja móvil. lg: panel de login. */
  size?: "sm" | "lg";
  /** light: para el panel oscuro fijo (blanco literal). dark: para fondos claros (invierte en dark mode). */
  tone?: "light" | "dark";
  className?: string;
}

// Wordmark "dentia": tipográfico puro (Inter), sin archivo de imagen. La "i"
// se dibuja sin punto (ı) y el punto se reemplaza por el círculo teal de la
// marca, dimensionado en `em` para escalar con el tamaño del texto.
export function BrandMark({ size = "sm", tone = "dark", className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex select-none items-baseline font-bold tracking-tight",
        size === "lg" ? "text-5xl" : "text-2xl",
        // El panel de marca es oscuro fijo: blanco literal, no la variable
        // --white (que se invierte en dark mode).
        tone === "light" ? "text-[#f8fafc]" : "text-slate-900",
        className,
      )}
    >
      <span className="sr-only">Dentia</span>
      <span aria-hidden="true" className="inline-flex items-baseline">
        dent
        <span className="relative">
          ı
          <span
            className="absolute left-1/2 -translate-x-1/2 rounded-full bg-clinic"
            style={{ width: "0.16em", height: "0.16em", top: "0.08em" }}
          />
        </span>
        a
      </span>
    </span>
  );
}
