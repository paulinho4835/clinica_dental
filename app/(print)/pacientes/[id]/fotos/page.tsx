import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { canEditAnamnesis } from "@/lib/rbac";
import { normalizeFeatures, fotosEnabled as fotosFeatureEnabled } from "@/lib/features";
import { isR2Configured, presignDownload } from "@/lib/r2";
import { AutoPrint, PrintButtons } from "../imprimir/AutoPrint";

const KIND_LABEL: Record<string, string> = {
  intraoral: "Intraoral",
  radiografia: "Radiografía",
  antes: "Antes",
  despues: "Después",
  otro: "Otro",
};

type Photo = {
  id: string;
  url: string;
  kind: string | null;
  caption: string | null;
  createdAt: string;
};

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/La_Paz",
  });
}

export default async function FotosInformePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: patient } = await supabase
    .from("patients")
    .select("id, clinic_id, full_name, national_id, dob")
    .eq("id", id)
    .single();

  if (!patient) notFound();

  const profile = await getProfile();
  if (!canEditAnamnesis(profile?.role)) notFound();

  const { data: clinicRow } = await supabase
    .from("clinics")
    .select("name, address, phone, features")
    .eq("id", patient.clinic_id)
    .single();

  const features = normalizeFeatures(clinicRow?.features);
  // El informe solo existe si la clínica tiene el módulo de fotos y R2 configurado.
  if (!fotosFeatureEnabled(features) || !isR2Configured()) notFound();

  const clinic = clinicRow as {
    name?: string;
    address?: string;
    phone?: string;
  } | null;

  const { data: photoRows } = await supabase
    .from("patient_photos")
    .select("id, storage_key, kind, caption, created_at")
    .eq("patient_id", id)
    .order("created_at", { ascending: true });

  // URLs firmadas de lectura (bucket privado). Expiran en minutos; para imprimir
  // alcanza de sobra.
  const photos: Photo[] = await Promise.all(
    (photoRows ?? []).map(async (p) => ({
      id: p.id as string,
      url: await presignDownload(p.storage_key as string),
      kind: (p.kind as string | null) ?? null,
      caption: (p.caption as string | null) ?? null,
      createdAt: p.created_at as string,
    })),
  );

  const antes = photos.filter((p) => p.kind === "antes");
  const despues = photos.filter((p) => p.kind === "despues");
  // Todo lo demás (intraoral, radiografía, otro, sin etiqueta) va a la galería.
  const galeria = photos.filter((p) => p.kind !== "antes" && p.kind !== "despues");

  const today = new Date().toLocaleDateString("es-BO", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/La_Paz",
  });

  return (
    <>
      <AutoPrint />
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          @page { size: A4; margin: 12mm; }
          figure, section { break-inside: avoid; }
        }
        body { margin: 0; font-family: Arial, Helvetica, sans-serif; }
      `}</style>

      <div className="mx-auto max-w-4xl px-8 py-8 text-sm text-slate-800">
        <PrintButtons />

        {/* Encabezado */}
        <div className="mb-6 border-b-2 border-slate-800 pb-4">
          <p className="text-xl font-bold uppercase tracking-wide">
            {clinic?.name ?? "Clínica Dental"}
          </p>
          {clinic?.address && <p className="text-xs text-slate-500">{clinic.address}</p>}
          {clinic?.phone && <p className="text-xs text-slate-500">Tel.: {clinic.phone}</p>}
          <p className="mt-2 text-sm font-semibold uppercase tracking-widest text-slate-500">
            Informe Fotográfico
          </p>
        </div>

        {/* Datos del paciente */}
        <section className="mb-6 rounded-lg bg-slate-50 px-5 py-4">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1">
            <Info label="Paciente" value={patient.full_name} />
            <Info label="C.I." value={patient.national_id ?? "—"} />
            <Info label="Fecha de nacimiento" value={fmtDate(patient.dob)} />
            <Info label="Total de fotos" value={String(photos.length)} />
          </div>
        </section>

        {photos.length === 0 ? (
          <p className="py-10 text-center text-slate-400">
            Este paciente no tiene fotos registradas.
          </p>
        ) : (
          <>
            {/* Comparación Antes / Después */}
            {(antes.length > 0 || despues.length > 0) && (
              <section className="mb-8">
                <SectionTitle>Antes / Después</SectionTitle>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Antes
                    </p>
                    <div className="space-y-3">
                      {antes.length === 0 ? (
                        <p className="text-center text-xs text-slate-400">Sin fotos.</p>
                      ) : (
                        antes.map((p) => <PrintPhoto key={p.id} photo={p} />)
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Después
                    </p>
                    <div className="space-y-3">
                      {despues.length === 0 ? (
                        <p className="text-center text-xs text-slate-400">Sin fotos.</p>
                      ) : (
                        despues.map((p) => <PrintPhoto key={p.id} photo={p} />)
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {/* Galería del resto de fotos */}
            {galeria.length > 0 && (
              <section className="mb-6">
                <SectionTitle>Galería clínica</SectionTitle>
                <div className="grid grid-cols-3 gap-4">
                  {galeria.map((p) => (
                    <PrintPhoto key={p.id} photo={p} showKind />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        <p className="mt-8 border-t border-slate-300 pt-4 text-right text-xs text-slate-400">
          Emitido: {today}
        </p>
      </div>
    </>
  );
}

function PrintPhoto({ photo, showKind }: { photo: Photo; showKind?: boolean }) {
  return (
    <figure className="overflow-hidden rounded-lg ring-1 ring-slate-200">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.url}
        alt={photo.caption ?? KIND_LABEL[photo.kind ?? ""] ?? "Foto"}
        className="w-full object-cover"
      />
      <figcaption className="px-2 py-1 text-[11px] text-slate-500">
        {showKind && photo.kind && (
          <span className="mr-1 font-medium text-slate-600">
            {KIND_LABEL[photo.kind] ?? photo.kind}
          </span>
        )}
        {photo.caption && <span>{photo.caption} · </span>}
        {fmtDate(photo.createdAt)}
      </figcaption>
    </figure>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-3 border-b border-slate-200 pb-1 text-sm font-semibold uppercase tracking-wide text-slate-500">
      {children}
    </h2>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-slate-500">{label}: </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
