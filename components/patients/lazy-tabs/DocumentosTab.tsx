"use client";

import { useEffect, useState } from "react";
import { getDocumentosTabData } from "@/app/(dashboard)/pacientes/[id]/tab-data-actions";
import { PhotosPanel } from "@/components/patients/PhotosPanel";
import { PrescriptionsPanel } from "@/components/patients/PrescriptionsPanel";
import { ConsentsPanel } from "@/components/consents/ConsentsPanel";
import { TabSkeleton } from "@/components/patients/lazy-tabs/TabSkeleton";

type Data = Awaited<ReturnType<typeof getDocumentosTabData>>;

export function DocumentosTab({ patientId }: { patientId: string }) {
  const [data, setData] = useState<Data | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDocumentosTabData(patientId).then((d) => {
      if (!cancelled) setData(d);
    });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (!data) return <TabSkeleton />;

  return (
    <>
      {data.fotosEnabled && (
        <section>
          <PhotosPanel
            patientId={patientId}
            photos={data.photos}
            canManage={data.canEditClinical}
            configured={data.r2Ready}
            atLimit={data.clinicPhotoCount >= data.fotosQuota}
            clinicQuota={data.fotosQuota}
            clinicUsed={data.showCounter ? data.clinicPhotoCount : undefined}
            showCounter={data.showCounter}
          />
        </section>
      )}

      {data.recetasEnabled && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Recetas emitidas</h2>
          <PrescriptionsPanel patientId={patientId} prescriptions={data.prescriptionRows} canWrite={data.canClinical} />
        </section>
      )}

      {data.consentimientosEnabled && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Consentimientos</h2>
          <ConsentsPanel
            patientId={patientId}
            patientName={data.patientName}
            doctorName={data.doctorName}
            clinicName={data.clinicName}
            consents={data.consentRows}
            templates={data.consentTemplateList}
            appointments={data.consentAppts}
            canWrite={data.canClinical}
          />
        </section>
      )}
    </>
  );
}
