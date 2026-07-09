import { notFound } from "next/navigation";
import { requireNavAccess } from "@/lib/guard";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { getCampaign, listPatientsForCampaign } from "../actions";
import { CampaignSendRow } from "@/components/campaigns/CampaignSendRow";
import { PhoneOff } from "lucide-react";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireNavAccess("campanas");
  const { id } = await params;

  const campaign = await getCampaign(id);
  if (!campaign) notFound();

  const allPatients = await listPatientsForCampaign(id);
  const withPhone = allPatients.filter((p) => p.phone && p.phone.trim());
  const withoutPhone = allPatients.filter((p) => !p.phone || !p.phone.trim());
  const sentCount = withPhone.filter((p) => p.sentAt).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={campaign.name}
        subtitle={`${sentCount} de ${withPhone.length} pacientes con teléfono ya recibieron este mensaje.`}
      />

      <div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600 ring-1 ring-slate-200">
        {campaign.message}
      </div>

      {withPhone.length === 0 ? (
        <EmptyState
          icon={<PhoneOff className="h-6 w-6" />}
          title="No hay pacientes con teléfono registrado"
          description="Agrega el teléfono en la ficha del paciente para poder enviarle campañas."
        />
      ) : (
        <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
          {withPhone.map((p) => (
            <CampaignSendRow
              key={p.id}
              campaignId={id}
              patientId={p.id}
              fullName={p.fullName}
              phone={p.phone}
              message={campaign.message}
              initialSentAt={p.sentAt}
            />
          ))}
        </div>
      )}

      {withoutPhone.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
            <PhoneOff className="h-3.5 w-3.5" />
            {withoutPhone.length} paciente{withoutPhone.length !== 1 ? "s" : ""} sin
            teléfono registrado (no se les puede enviar):
          </p>
          <div className="overflow-hidden rounded-lg bg-slate-50 ring-1 ring-slate-200">
            {withoutPhone.map((p) => (
              <div
                key={p.id}
                className="border-t border-slate-200 px-4 py-2 text-sm text-slate-500 first:border-t-0"
              >
                {p.fullName}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
