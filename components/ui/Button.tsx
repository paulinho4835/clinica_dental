import { cva, type VariantProps } from "class-variance-authority";
import Link from "next/link";
import { cn } from "@/lib/cn";

// Botón unificado de la app. Centraliza colores, tamaños, focus-ring y estados
// disabled para que todo se vea y se comporte igual. Antes estas clases estaban
// copiadas decenas de veces.
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinic focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-clinic text-white hover:bg-clinic-fg",
        secondary:
          "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
        danger:
          "border border-red-300 bg-white text-red-600 hover:bg-red-50",
        ghost: "text-slate-600 hover:bg-slate-100",
        dark: "bg-night text-white hover:bg-night-soft",
      },
      size: {
        sm: "px-3 py-1.5 text-xs",
        md: "px-4 py-2 text-sm",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

type ButtonBaseProps = VariantProps<typeof buttonVariants> & {
  className?: string;
};

// Como <button>
export function Button({
  variant,
  size,
  className,
  loading,
  children,
  disabled,
  ...props
}: ButtonBaseProps &
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
    loading?: boolean;
    children?: React.ReactNode;
  }) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}

// Como <Link> (next/link) con la misma apariencia.
export function ButtonLink({
  variant,
  size,
  className,
  ...props
}: ButtonBaseProps & React.ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
