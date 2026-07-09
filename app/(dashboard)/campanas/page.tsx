import Link from "next/link";
import { Megaphone } from "lucide-react";
import { requireNavAccess } from "@/lib/guard";
import { getClinicFeatures } from "@/lib/superadmin";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { listCampaigns } from "./actions";
import { CampaignListClient } from "@/components/campaigns/CampaignListClient";

export default async function CampanasPage() {
  await requireNavAccess("campanas");
  const features = await getClinicFeatures();

  if (!features.campanas) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-700">
        El módulo <strong>Campañas de WhatsApp</strong> no está habilitado
        para esta clínica. Actívalo desde el panel de Superadmin.
      </div>
    );
  }

  const campaigns = await listCampaigns();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campañas de WhatsApp"
        subtitle="Envía promociones y avisos a tus pacientes por WhatsApp, uno por uno."
      />

      <CampaignListClient />

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone className="h-6 w-6" />}
          title="Aún no hay campañas"
          description="Crea la primera campaña para empezar a enviar promociones a tus pacientes."
        />
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/campanas/${c.id}`}
              className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm first:border-t-0 hover:bg-slate-50"
            >
              <div>
                <p className="font-medium text-slate-800">{c.name}</p>
                <p className="mt-0.5 max-w-md truncate text-xs text-slate-400">{c.message}</p>
              </div>
              <span className="shrink-0 text-xs font-medium text-slate-500">
                {c.sentCount} de {c.totalPatients} enviados
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
