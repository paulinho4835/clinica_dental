"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createPatient, type ActionState } from "@/app/(dashboard)/pacientes/actions";
import { toast } from "@/lib/toast";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const initial: ActionState = {};

export function NewPatientForm() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(createPatient, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
      router.refresh();
      toast("Paciente guardado", "success");
    }
  }, [state.ok, router]);

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Nuevo paciente
      </Button>
    );
  }

  return (
    <Card className="p-4">
      <form ref={formRef} action={formAction} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field name="full_name" label="Nombre completo *" required autoFocus />
          <Field name="national_id" label="Cédula de identidad (CI)" />
          <Field name="phone" label="Teléfono" />
          <Field name="dob" label="Fecha de nacimiento" type="date" />
          <Field name="email" label="Email" type="email" />
          <Field name="sex" label="Sexo" />
          <Field name="address" label="Dirección" />
          <Field name="allergies" label="Alergias (separadas por coma)" />
          <Field name="medical_alerts" label="Alertas médicas (coma)" />
        </div>
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Guardando…" : "Guardar"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}
