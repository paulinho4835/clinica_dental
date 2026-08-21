"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { PatientSchema, type PatientInput } from "@/lib/schemas/patient";
import { submitPatient } from "@/lib/clinic-direct-operations";
import { toast } from "@/lib/toast";
import { fieldInputClass, FieldLabel } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKeyRef = useRef<string | null>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PatientInput>({ resolver: zodResolver(PatientSchema) });

  const onSubmit = async (data: PatientInput) => {
    setPending(true);
    setError("");
    idempotencyKeyRef.current ??= crypto.randomUUID();
    try {
      await submitPatient({ input: data, idempotencyKey: idempotencyKeyRef.current });
      idempotencyKeyRef.current = null;
      reset();
      setOpen(false);
      router.refresh();
      toast("Paciente guardado", "success");
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : "No se pudo guardar el paciente");
    } finally {
      setPending(false);
    }
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
      <form
        onSubmit={handleSubmit(onSubmit)}
        onChangeCapture={() => { idempotencyKeyRef.current = null; }}
        className="space-y-3"
      >
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
        {error && <p className="text-sm text-red-600">{error}</p>}
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
