"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Field, FieldLabel, fieldInputClass } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { toast } from "@/lib/toast";
import { createCampaign } from "@/app/(dashboard)/campanas/actions";

export function NewCampaignModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const res = await createCampaign(name, message);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    toast("Campaña creada.");
    setName("");
    setMessage("");
    onClose();
    router.push(`/campanas/${res.id}`);
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Nueva campaña"
      subtitle="Usa {nombre} en el mensaje para saludar a cada paciente por su nombre."
    >
      <div className="space-y-4">
        <Field
          label="Nombre de la campaña"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ej. Promo limpieza julio"
        />
        <label className="block text-sm">
          <FieldLabel>Mensaje</FieldLabel>
          <textarea
            className={fieldInputClass}
            rows={5}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Hola {nombre}, tenemos una promoción especial para ti..."
          />
        </label>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Creando..." : "Crear campaña"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
