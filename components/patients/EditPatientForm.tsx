"use client";

import { useActionState, useEffect, startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { updatePatient, type ActionState } from "@/app/(dashboard)/pacientes/actions";
import { PatientSchema, type PatientInput } from "@/lib/schemas/patient";
import { toast } from "@/lib/toast";
import { fieldInputClass, FieldLabel } from "@/components/ui/Field";
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

const FIELDS: { name: keyof PatientInput; label: string; type?: string }[] = [
  { name: "full_name", label: "Nombre completo *" },
  { name: "national_id", label: "Cédula de identidad (CI)" },
  { name: "phone", label: "Teléfono" },
  { name: "dob", label: "Fecha de nacimiento", type: "date" },
  { name: "email", label: "Email", type: "email" },
  { name: "sex", label: "Sexo" },
  { name: "address", label: "Dirección" },
  { name: "allergies", label: "Alergias (separadas por coma)" },
  { name: "medical_alerts", label: "Alertas médicas (coma)" },
];

export function EditPatientForm({ patient }: { patient: PatientData }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  const boundAction = updatePatient.bind(null, patient.id);
  const [state, formAction, pending] = useActionState(boundAction, initial);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<PatientInput>({
    resolver: zodResolver(PatientSchema),
    defaultValues: {
      full_name: patient.full_name,
      national_id: patient.national_id ?? "",
      phone: patient.phone ?? "",
      dob: patient.dob ?? "",
      email: patient.email ?? "",
      sex: patient.sex ?? "",
      address: patient.address ?? "",
      allergies: patient.allergies?.join(", ") ?? "",
      medical_alerts: patient.medical_alerts?.join(", ") ?? "",
    },
  });

  useEffect(() => {
    if (state.ok) {
      setOpen(false);
      router.refresh();
      toast("Cambios guardados", "success");
    }
  }, [state.ok, router]);

  const onSubmit = (data: PatientInput) => {
    const fd = new FormData();
    (Object.entries(data) as [string, string | null | undefined][]).forEach(
      ([k, v]) => { if (v != null && v !== "") fd.append(k, v); },
    );
    startTransition(() => formAction(fd));
  };

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Editar datos
      </Button>
    );
  }

  return (
    <Card className="mt-4 p-4">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <h3 className="font-medium text-slate-800">Editar paciente</h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {FIELDS.map(({ name, label, type }) => (
            <label key={name} className="block text-sm">
              <FieldLabel>{label}</FieldLabel>
              <input
                {...register(name)}
                type={type ?? "text"}
                className={fieldInputClass}
              />
              {errors[name] && (
                <p className="mt-0.5 text-xs text-red-600">{errors[name]?.message}</p>
              )}
            </label>
          ))}
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
