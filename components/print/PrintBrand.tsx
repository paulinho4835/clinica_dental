import { cn } from "@/lib/cn";

// Encabezado de marca para documentos impresos: muestra el logo de la clínica (si
// hay) a la izquierda y, al lado, el nombre + lo que reciba como children
// (subtítulo del documento, dirección, teléfono, etc.).
//
// Si no hay logo, se comporta como un simple contenedor del bloque de texto, para
// no alterar el layout de los encabezados que ya existían.
export function PrintBrand({
  logoUrl,
  children,
  className,
}: {
  logoUrl: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  if (!logoUrl) return <div className={className}>{children}</div>;

  return (
    <div className={cn("flex items-start gap-4", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoUrl}
        alt="Logo de la clínica"
        className="h-16 w-auto max-w-[150px] shrink-0 object-contain"
      />
      <div>{children}</div>
    </div>
  );
}
