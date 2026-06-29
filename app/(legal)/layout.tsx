import Link from "next/link";
import { ArrowLeft } from "lucide-react";

// Layout simple y legible para los documentos legales públicos (sin sesión).
export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-1 text-sm font-medium text-clinic hover:text-clinic-fg"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <article className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-slate-200 sm:p-10">
          {children}
        </article>
      </div>
    </main>
  );
}
