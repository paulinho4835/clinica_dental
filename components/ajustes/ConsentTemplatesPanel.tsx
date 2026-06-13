"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  forkTemplate,
} from "@/app/(dashboard)/ajustes/consent-template-actions";

export type TemplateRow = {
  id: string;
  title: string;
  body: string;
  isSystem: boolean;
  clinicId: string | null;
};

function PlaceholderHint() {
  return (
    <p className="mt-1 text-xs text-slate-400">
      Placeholders disponibles:{" "}
      <code className="rounded bg-slate-100 px-1">{"{{nombre_paciente}}"}</code>{" "}
      <code className="rounded bg-slate-100 px-1">{"{{fecha}}"}</code>{" "}
      <code className="rounded bg-slate-100 px-1">{"{{doctor}}"}</code>{" "}
      <code className="rounded bg-slate-100 px-1">{"{{clinica}}"}</code>
    </p>
  );
}

function TemplateForm({
  initial,
  onSave,
  onCancel,
  pending,
}: {
  initial?: { title: string; body: string };
  onSave: (title: string, body: string) => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <input
        type="text"
        placeholder="Título de la plantilla"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
      />
      <div>
        <textarea
          placeholder="Texto del consentimiento..."
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
        />
        <PlaceholderHint />
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => onSave(title, body)}
          className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
        >
          {pending ? "…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

export function ConsentTemplatesPanel({
  systemTemplates,
  clinicTemplates,
}: {
  systemTemplates: TemplateRow[];
  clinicTemplates: TemplateRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  function run(fn: () => Promise<{ error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Plantillas del sistema */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-600">
          Plantillas del sistema
        </h3>
        <div className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
          <div className="divide-y divide-slate-100">
            {systemTemplates.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
              >
                <span className="font-medium">{t.title}</span>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => forkTemplate(t.id))}
                  className="shrink-0 text-xs text-clinic hover:underline disabled:opacity-50"
                >
                  Usar como base
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Plantillas de la clínica */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-600">
            Plantillas de esta clínica
          </h3>
          <button
            type="button"
            onClick={() => {
              setShowNew(true);
              setEditingId(null);
            }}
            className="text-xs text-clinic hover:underline"
          >
            + Nueva plantilla
          </button>
        </div>

        {showNew && (
          <div className="mb-3">
            <TemplateForm
              pending={pending}
              onCancel={() => setShowNew(false)}
              onSave={(title, body) =>
                run(async () => {
                  const res = await createTemplate(title, body);
                  if (!res.error) setShowNew(false);
                  return res;
                })
              }
            />
          </div>
        )}

        <div className="overflow-hidden rounded-lg bg-white ring-1 ring-slate-200">
          <div className="divide-y divide-slate-100">
            {clinicTemplates.map((t) => (
              <div key={t.id} className="px-4 py-2.5 text-sm">
                {editingId === t.id ? (
                  <TemplateForm
                    initial={{ title: t.title, body: t.body }}
                    pending={pending}
                    onCancel={() => setEditingId(null)}
                    onSave={(title, body) =>
                      run(async () => {
                        const res = await updateTemplate(t.id, title, body);
                        if (!res.error) setEditingId(null);
                        return res;
                      })
                    }
                  />
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-medium">{t.title}</span>
                    <div className="flex gap-3">
                      <button
                        type="button"
                        onClick={() => setEditingId(t.id)}
                        className="text-xs text-slate-500 hover:underline"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (!confirm("¿Eliminar esta plantilla?")) return;
                          run(() => deleteTemplate(t.id));
                        }}
                        className="text-xs text-red-400 hover:underline disabled:opacity-50"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {clinicTemplates.length === 0 && !showNew && (
              <p className="px-4 py-3 text-sm text-slate-500">
                Sin plantillas propias. Crea una nueva o usa como base una del sistema.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
