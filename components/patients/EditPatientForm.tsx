"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updatePatient, type ActionState } from "@/app/(dashboard)/pacientes/actions";
import { toast } from "@/lib/toast";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export interface PatientData {
  id: string;
  full_name: string;
  national_id?: string | null;
  dob?: string | null;
  sex?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  allergies?: string[] | null;
  medical_alerts?: string[] | null;
}

const initial: ActionState = {};

export function EditPatientForm({ patient }: { patient: PatientData }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const boundAction = updatePatient.bind(null, patient.id);
  const [state, formAction, pending] = useActionState(boundAction, initial);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
      toast("Cambios guardados", "success");
    }
  }, [state.ok, router]);

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Editar datos
      </Button>
    );
  }

  return (
    <Card className="mt-4 p-4">
      <form ref={formRef} action={formAction} className="space-y-3">
        <h3 className="font-medium text-slate-800">Editar paciente</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field name="full_name" label="Nombre completo *" required defaultValue={patient.full_name} />
          <Field name="national_id" label="Cédula de identidad (CI)" defaultValue={patient.national_id ?? undefined} />
          <Field name="phone" label="Teléfono" defaultValue={patient.phone ?? undefined} />
          <Field name="dob" label="Fecha de nacimiento" type="date" defaultValue={patient.dob ?? undefined} />
          <Field name="email" label="Email" type="email" defaultValue={patient.email ?? undefined} />
          <Field name="sex" label="Sexo" defaultValue={patient.sex ?? undefined} />
          <Field name="address" label="Dirección" defaultValue={patient.address ?? undefined} />
          <Field
            name="allergies"
            label="Alergias (separadas por coma)"
            defaultValue={patient.allergies?.join(", ")}
          />
          <Field
            name="medical_alerts"
            label="Alertas médicas (coma)"
            defaultValue={patient.medical_alerts?.join(", ")}
          />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar cambios"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
