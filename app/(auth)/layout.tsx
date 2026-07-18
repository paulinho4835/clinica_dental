import { BrandMark } from "@/components/ui/BrandMark";
import { ToothConstellation } from "@/components/ui/ToothConstellation";

// Layout compartido de las pantallas de auth: panel de marca Dentia (oscuro
// fijo, NO invierte con el tema) + contenido claro (sí respeta dark mode).
// Escritorio: split 55/45. Móvil: franja superior compacta con el logo.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="relative flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-clinic-900 to-night py-8 lg:w-[55%] lg:items-end lg:justify-start lg:p-12">
        <ToothConstellation className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block" />
        <div className="relative z-10">
          <BrandMark size="lg" tone="light" />
          <p className="mt-4 hidden max-w-md text-xl font-medium text-teal-100/90 lg:block">
            La clínica, en orden.
          </p>
          <p className="mt-1 hidden text-sm text-teal-100/50 lg:block">
            Agenda, pacientes, tratamientos y caja en un solo lugar.
          </p>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
