import { updateProfessionalAgendaColor } from "@/app/(dashboard)/ajustes/actions";

type Professional = { id: string; full_name: string; agenda_color: string | null };

const COLORS = [
  ["blue", "Azul", "bg-blue-600"], ["red", "Rojo", "bg-red-500"],
  ["emerald", "Verde", "bg-emerald-500"], ["amber", "Ámbar", "bg-amber-500"],
  ["violet", "Violeta", "bg-violet-500"], ["pink", "Rosa", "bg-pink-500"],
  ["cyan", "Cian", "bg-cyan-500"], ["lime", "Lima", "bg-lime-500"],
  ["orange", "Naranja", "bg-orange-600"], ["fuchsia", "Fucsia", "bg-fuchsia-500"],
] as const;

export function ProfessionalColorsPanel({ professionals }: { professionals: Professional[] }) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
      <div className="divide-y divide-slate-100">
        {professionals.map((professional) => (
          <div key={professional.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <span className="font-medium text-slate-800">{professional.full_name}</span>
            <form action={updateProfessionalAgendaColor} className="flex flex-wrap gap-1.5">
              <input type="hidden" name="professional_id" value={professional.id} />
              {COLORS.map(([value, label, dot]) => (
                <button
                  key={value}
                  type="submit"
                  name="color"
                  value={value}
                  title={label}
                  aria-label={`${label} para ${professional.full_name}`}
                  className={`h-7 w-7 rounded-full ${dot} ring-offset-2 transition hover:scale-110 ${professional.agenda_color === value ? "ring-2 ring-slate-800" : ""}`}
                />
              ))}
            </form>
          </div>
        ))}
        {professionals.length === 0 && <p className="px-4 py-3 text-sm text-slate-500">Sin profesionales.</p>}
      </div>
    </div>
  );
}
