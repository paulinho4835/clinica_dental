"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, Pencil, Eye, EyeOff, Import } from "lucide-react";
import {
  addAgentInfoEntry,
  updateAgentInfoEntry,
  setAgentInfoEntryActive,
  deleteAgentInfoEntry,
  buildCatalogDraft,
  type ActionState,
} from "@/app/(dashboard)/ajustes/agent-info-actions";
import { fieldInputClass } from "@/components/ui/Field";
import { confirm } from "@/lib/confirm";
import { toast } from "@/lib/toast";

export type AgentInfoRow = {
  id: string;
  title: string;
  content: string;
  active: boolean;
};

const initial: ActionState = {};

export function AgentInfoPanel({ entries }: { entries: AgentInfoRow[] }) {
  const router = useRouter();
  const [addState, addAction, addPending] = useActionState(addAgentInfoEntry, initial);
  const [editState, editAction, editPending] = useActionState(updateAgentInfoEntry, initial);
  const [, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (addState.ok) {
      toast("Entrada agregada", "success");
      formRef.current?.reset();
      setDraftContent("");
      setAdding(false);
    }
    if (addState.error) toast(addState.error, "error");
  }, [addState]);

  useEffect(() => {
    if (editState.ok) {
      toast("Entrada actualizada", "success");
      setEditingId(null);
    }
    if (editState.error) toast(editState.error, "error");
  }, [editState]);

  async function handleImport() {
    setImporting(true);
    const res = await buildCatalogDraft();
    setImporting(false);
    if ("error" in res) {
      toast(res.error, "error");
      return;
    }
    setDraftContent(res.content);
    setAdding(true);
    toast("Catálogo importado como borrador: revisa y edita los precios antes de guardar.");
  }

  async function handleToggle(row: AgentInfoRow) {
    const res = await setAgentInfoEntryActive(row.id, !row.active);
    if (res.error) toast(res.error, "error");
    else {
      toast(row.active ? "Entrada pausada: el bot ya no la usa." : "Entrada activada", "success");
      startTransition(() => router.refresh());
    }
  }

  async function handleDelete(row: AgentInfoRow) {
    const ok = await confirm({
      title: "Eliminar entrada",
      message: `Se eliminará "${row.title}" y el bot dejará de conocer esa información. ¿Continuar?`,
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    const res = await deleteAgentInfoEntry(row.id);
    if (res.error) toast(res.error, "error");
    else {
      toast("Entrada eliminada", "success");
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      {entries.length === 0 && !adding && (
        <p className="px-4 py-3 text-sm text-slate-400">
          Sin información aún. El bot seguirá derivando las preguntas de precios a
          un humano hasta que agregues la primera entrada.
        </p>
      )}

      {entries.length > 0 && (
        <ul className="divide-y divide-slate-100">
          {entries.map((e) =>
            editingId === e.id ? (
              <li key={e.id} className="px-4 py-3">
                <form action={editAction} className="space-y-2">
                  <input type="hidden" name="id" value={e.id} />
                  <input
                    name="title"
                    type="text"
                    required
                    maxLength={80}
                    defaultValue={e.title}
                    className={`${fieldInputClass} w-full`}
                  />
                  <textarea
                    name="content"
                    required
                    maxLength={2000}
                    rows={6}
                    defaultValue={e.content}
                    className={`${fieldInputClass} w-full font-mono text-xs`}
                  />
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={editPending}
                      className="rounded-md bg-clinic px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                    >
                      {editPending ? "Guardando…" : "Guardar"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              </li>
            ) : (
              <li key={e.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-slate-800">
                      {e.title}
                      {!e.active && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
                          Pausada
                        </span>
                      )}
                    </p>
                    <p className="mt-1 line-clamp-3 whitespace-pre-line text-xs text-slate-500">
                      {e.content}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleToggle(e)}
                      title={e.active ? "Pausar (el bot deja de usarla)" : "Activar"}
                      className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                    >
                      {e.active ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(e.id)}
                      title="Editar"
                      className="rounded p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-clinic"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(e)}
                      title="Eliminar"
                      className="rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ),
          )}
        </ul>
      )}

      <div className="border-t border-slate-100 px-4 py-3">
        {adding ? (
          <form ref={formRef} action={addAction} className="space-y-2">
            <input
              name="title"
              type="text"
              required
              maxLength={80}
              placeholder="Título (ej. Tratamientos y precios, Horarios de atención…)"
              defaultValue={draftContent ? "Tratamientos y precios" : ""}
              className={`${fieldInputClass} w-full`}
            />
            <textarea
              name="content"
              required
              maxLength={2000}
              rows={6}
              value={draftContent}
              onChange={(ev) => setDraftContent(ev.target.value)}
              placeholder={
                "Escribe la información tal como quieres que el bot la diga.\nEj:\n- Limpieza dental: desde Bs 150\n- Atendemos de lunes a viernes de 8:00 a 19:00"
              }
              className={`${fieldInputClass} w-full font-mono text-xs`}
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={addPending}
                className="rounded-md bg-clinic px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
              >
                {addPending ? "Guardando…" : "Guardar entrada"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setDraftContent("");
                }}
                className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="flex items-center gap-1.5 rounded-md bg-clinic px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              <Plus className="h-4 w-4" />
              Nueva entrada
            </button>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              className="flex items-center gap-1.5 rounded-md bg-slate-100 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-200 disabled:opacity-50"
            >
              <Import className="h-4 w-4" />
              {importing ? "Importando…" : "Importar del catálogo de tratamientos"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
