import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-clinic-fg">
          Dentia
        </h1>
        <p className="mt-3 text-lg text-slate-600">
          Dentia es un software de gestión para clínicas dentales. Desde un solo
          lugar, cada clínica administra la agenda de citas, el expediente de sus
          pacientes, el odontograma, los planes de tratamiento y presupuestos, la
          caja y el inventario. Los odontólogos pueden, además, conectar de forma
          opcional su cuenta de Google para ver sus citas reflejadas en Google
          Calendar.
        </p>
      </div>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="rounded-lg bg-clinic px-5 py-2.5 font-medium text-white hover:bg-clinic-fg"
        >
          Iniciar sesión
        </Link>
        <Link
          href="/agenda"
          className="rounded-lg border border-slate-300 px-5 py-2.5 font-medium hover:bg-slate-100"
        >
          Ir al panel
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-3 text-sm text-slate-600 sm:grid-cols-3">
        {[
          "Pacientes / Expediente",
          "Agenda y citas",
          "Odontograma digital",
          "Planes y presupuestos",
          "Caja y finanzas",
          "Inventario",
        ].map((m) => (
          <li key={m} className="rounded-md bg-white p-3 shadow-sm ring-1 ring-slate-200">
            {m}
          </li>
        ))}
      </ul>
    </main>
  );
}
