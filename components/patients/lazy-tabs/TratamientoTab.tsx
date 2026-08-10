"use client";

import { useCallback, useEffect, useState } from "react";
import { getTratamientoTabData } from "@/app/(dashboard)/pacientes/[id]/tab-data-actions";
import { TreatmentPlanPanel } from "@/components/treatments/TreatmentPlanPanel";
import { WorkStatusPanel, AdHocWorkList, VisitasPanel } from "@/components/history/PatientHistoryPanel";
import { EvolutionPanel } from "@/components/patients/EvolutionPanel";
import { TabSkeleton } from "@/components/patients/lazy-tabs/TabSkeleton";

type Data = Awaited<ReturnType<typeof getTratamientoTabData>>;

// Se pide al servidor recién cuando el usuario abre esta pestaña, no en la
// carga inicial de la ficha del paciente (antes se calculaba siempre, aunque
// el usuario se quedara en "Historia clínica").
export function TratamientoTab({
  patientId,
  legacyEvolution,
}: {
  patientId: string;
  legacyEvolution: string | null;
}) {
  const [data, setData] = useState<Data | null>(null);

  const refreshData = useCallback(async () => {
    const nextData = await getTratamientoTabData(patientId);
    setData(nextData);
  }, [patientId]);

  useEffect(() => {
    let cancelled = false;
    getTratamientoTabData(patientId).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (!data) return <TabSkeleton />;

  const { permissions } = data;

  return (
    <>
      <section>
        <h2 className="mb-3 text-lg font-semibold">Plan de tratamiento</h2>
        <TreatmentPlanPanel
          patientId={patientId}
          canWrite={permissions.canClinical}
          canDelete={permissions.canDelete}
          canEditName={permissions.canEditPlanItemName}
          canEditPrice={permissions.canEditPrice}
          works={data.works}
          dentists={data.dentists}
          catalog={data.catalog}
          recetasEnabled={data.recetasEnabled}
          currency={data.currency}
          onWorkAdded={refreshData}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Seguimiento del tratamiento</h2>
        <WorkStatusPanel
          patientId={patientId}
          canWrite={permissions.canClinical}
          works={data.works}
          currency={data.currency}
        />
      </section>

      {data.adHocWorkRows.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Trabajos sin plan</h2>
          <p className="mb-3 text-xs text-slate-500">
            Registrados directamente desde "Mis trabajos", sin vincular a un ítem del plan de tratamiento.
          </p>
          <AdHocWorkList works={data.adHocWorkRows} currency={data.currency} />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-lg font-semibold">Evolución del paciente</h2>
        <EvolutionPanel
          patientId={patientId}
          notes={data.evolutionNotes}
          history={data.evolutionHistory}
          legacyEvolution={legacyEvolution}
          canWrite={permissions.canEditClinical}
          canSeeHistory={permissions.canSeeHistory}
          currentUserId={permissions.currentUserId}
          appointments={data.apptRows}
        />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">Visitas</h2>
        <VisitasPanel appointments={data.apptRows} />
      </section>
    </>
  );
}
