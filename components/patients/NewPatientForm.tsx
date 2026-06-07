"use client";

import { useActionState, useEffect, startTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { createPatient, type ActionState } from "@/app/(dashboard)/pacientes/actions";
import { PatientSchema, type PatientInput } from "@/lib/schemas/patient";
import { toast } from "@/lib/toast";
import { fieldInputClass, FieldLabel } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

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

export function NewPatientForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createPatient, initial);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PatientInput>({ resolver: zodResolver(PatientSchema) });

  useEffect(() => {
    if (state.ok) {
      reset();
      setOpen(false);
      router.refresh();
      toast("Paciente guardado", "success");
    }
  }, [state.ok, router, reset]);

  const onSubmit = (data: PatientInput) => {
    const fd = new FormData();
    (Object.entries(data) as [string, string | null | undefined][]).forEach(
      ([k, v]) => { if (v != null && v !== "") fd.append(k, v); },
    );
    startTransition(() => formAction(fd));
  };

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Nuevo paciente
      </Button>
    );
  }

  return (
    <Card className="p-4">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
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
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => { setOpen(false); reset(); }}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
