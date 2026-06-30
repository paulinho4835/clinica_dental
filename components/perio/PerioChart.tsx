"use client";

import {
  QUADRANTS,
  BUCCAL_SITES,
  LINGUAL_SITES,
  GRADE_OPTIONS,
  PD_WARN_MM,
  PD_DEEP_MM,
  DEFAULT_TOOTH_PERIO,
  type PerioMeasurements,
  type ToothPerio,
  type SiteKey,
  type SiteMeasurement,
} from "@/lib/perio/types";

// Arcadas en orden clínico (izq→der de quien mira la boca):
// maxilar = cuadrante sup. derecho + sup. izquierdo; mandibular ídem inferior.
const MAXILLARY = [...QUADRANTS[0], ...QUADRANTS[1]];
const MANDIBULAR = [...QUADRANTS[3].slice().reverse(), ...QUADRANTS[2].slice().reverse()];
// (48..41 se invierte a 41..48 para que ambas arcadas queden alineadas por la
//  línea media; el orden visual sup/inf coincide diente a diente.)

// Solo molares (segundo dígito FDI ≥ 6) tienen furca clínicamente relevante.
function hasFurcation(fdi: string): boolean {
  return Number(fdi[1]) >= 6;
}

// Color de fondo de la profundidad de sondaje según gravedad.
function pdClass(pd: number | null | undefined): string {
  if (typeof pd !== "number") return "";
  if (pd >= PD_DEEP_MM) return "bg-red-100 text-red-700";
  if (pd >= PD_WARN_MM) return "bg-amber-100 text-amber-700";
  return "";
}

// Enfoca el siguiente input de profundidad de sondaje en orden de aparición.
function focusNextPd(el: HTMLInputElement) {
  const all = Array.from(document.querySelectorAll<HTMLInputElement>("input.perio-pd"));
  const idx = all.indexOf(el);
  if (idx >= 0 && idx + 1 < all.length) all[idx + 1].focus();
}

export function PerioChart({
  measurements,
  onChange,
  canWrite,
}: {
  measurements: PerioMeasurements;
  onChange: (next: PerioMeasurements) => void;
  canWrite: boolean;
}) {
  function tooth(fdi: string): ToothPerio {
    return measurements[fdi] ?? DEFAULT_TOOTH_PERIO;
  }

  function setTooth(fdi: string, patch: Partial<ToothPerio>) {
    const t = tooth(fdi);
    onChange({ ...measurements, [fdi]: { ...t, ...patch } });
  }

  function setSite(fdi: string, key: SiteKey, patch: Partial<SiteMeasurement>) {
    const t = tooth(fdi);
    const site = t.sites[key] ?? {};
    onChange({
      ...measurements,
      [fdi]: { ...t, sites: { ...t.sites, [key]: { ...site, ...patch } } },
    });
  }

  // Convierte el texto del input a mm (0-12) o null si vacío.
  function parseMm(raw: string): number | null {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    if (digits === "") return null;
    return Math.min(12, Number(digits));
  }

  // ── Celda de un sitio: profundidad de sondaje + recesión + sangrado + placa ──
  function SiteCell({ fdi, site }: { fdi: string; site: SiteKey }) {
    const m = tooth(fdi).sites[site] ?? {};
    return (
      <div className="flex w-9 flex-col items-center gap-0.5">
        <input
          className={`perio-pd w-9 rounded border border-slate-200 px-0 py-0.5 text-center text-xs tabular-nums focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic ${pdClass(m.pd)}`}
          inputMode="numeric"
          disabled={!canWrite}
          value={m.pd ?? ""}
          aria-label={`Profundidad ${fdi} ${site}`}
          onChange={(e) => {
            const pd = parseMm(e.target.value);
            setSite(fdi, site, { pd });
            // Auto-avance: 2-9 (un solo dígito) o ya 2 dígitos → siguiente sitio.
            const v = e.target.value.replace(/\D/g, "");
            if (v.length === 2 || (v.length === 1 && v !== "1")) focusNextPd(e.target);
          }}
        />
        <input
          className="w-9 rounded border border-slate-100 bg-slate-50 px-0 py-0.5 text-center text-[10px] tabular-nums text-slate-500 focus:border-clinic focus:outline-none"
          inputMode="numeric"
          disabled={!canWrite}
          value={m.rec ?? ""}
          aria-label={`Recesión ${fdi} ${site}`}
          title="Recesión (mm)"
          onChange={(e) => setSite(fdi, site, { rec: parseMm(e.target.value) })}
        />
        <div className="flex gap-0.5">
          <button
            type="button"
            disabled={!canWrite}
            onClick={() => setSite(fdi, site, { bop: !m.bop })}
            title="Sangrado al sondaje"
            className={`h-3 w-3 rounded-full ring-1 ring-slate-300 ${m.bop ? "bg-red-500" : "bg-white"}`}
          />
          <button
            type="button"
            disabled={!canWrite}
            onClick={() => setSite(fdi, site, { plaque: !m.plaque })}
            title="Placa"
            className={`h-3 w-3 rounded-full ring-1 ring-slate-300 ${m.plaque ? "bg-blue-500" : "bg-white"}`}
          />
        </div>
      </div>
    );
  }

  function ToothColumn({ fdi }: { fdi: string }) {
    const t = tooth(fdi);
    return (
      <div className="flex shrink-0 flex-col items-center gap-1 rounded-md border border-slate-100 px-1 py-1">
        <div className="flex items-center gap-1">
          <span className="text-xs font-semibold tabular-nums text-slate-600">{fdi}</span>
          <button
            type="button"
            disabled={!canWrite}
            onClick={() => setTooth(fdi, { present: !t.present })}
            title={t.present ? "Marcar ausente" : "Marcar presente"}
            className={`rounded px-1 text-[9px] font-medium ${
              t.present
                ? "text-slate-300 hover:text-slate-500"
                : "bg-slate-200 text-slate-600"
            }`}
          >
            {t.present ? "✓" : "Aus."}
          </button>
        </div>

        {t.present ? (
          <>
            <div className="flex gap-0.5">
              {BUCCAL_SITES.map((s) => (
                <SiteCell key={s} fdi={fdi} site={s} />
              ))}
            </div>
            <span className="text-[9px] uppercase tracking-wide text-slate-300">v / p</span>
            <div className="flex gap-0.5">
              {LINGUAL_SITES.map((s) => (
                <SiteCell key={s} fdi={fdi} site={s} />
              ))}
            </div>
            <div className="mt-0.5 flex gap-1">
              <select
                disabled={!canWrite}
                value={t.mobility ?? ""}
                onChange={(e) =>
                  setTooth(fdi, { mobility: e.target.value === "" ? null : Number(e.target.value) })
                }
                title="Movilidad"
                className="rounded border border-slate-200 bg-white px-0.5 text-[10px] text-slate-600"
              >
                <option value="">M-</option>
                {GRADE_OPTIONS.map((g) => (
                  <option key={g} value={g}>{`M${g}`}</option>
                ))}
              </select>
              {hasFurcation(fdi) && (
                <select
                  disabled={!canWrite}
                  value={t.furcation ?? ""}
                  onChange={(e) =>
                    setTooth(fdi, {
                      furcation: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                  title="Furca"
                  className="rounded border border-slate-200 bg-white px-0.5 text-[10px] text-slate-600"
                >
                  <option value="">F-</option>
                  {GRADE_OPTIONS.map((g) => (
                    <option key={g} value={g}>{`F${g}`}</option>
                  ))}
                </select>
              )}
            </div>
          </>
        ) : (
          <div className="flex h-32 items-center text-[10px] text-slate-400">ausente</div>
        )}
      </div>
    );
  }

  function Arch({ label, teeth }: { label: string; teeth: string[] }) {
    return (
      <div className="space-y-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <div className="flex gap-1 overflow-x-auto pb-2">
          {teeth.map((fdi) => (
            <ToothColumn key={fdi} fdi={fdi} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500">
        <span>
          Fila superior: <strong>profundidad de sondaje</strong> · fila gris:{" "}
          <strong>recesión</strong> (mm)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-red-500" /> sangrado
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded-full bg-blue-500" /> placa
        </span>
        <span>M = movilidad · F = furca (0-3)</span>
      </div>
      <Arch label="Maxilar superior" teeth={MAXILLARY} />
      <Arch label="Mandíbula inferior" teeth={MANDIBULAR} />
    </div>
  );
}
