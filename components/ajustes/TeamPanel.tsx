"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createTeamUser,
  updateTeamUserRole,
  removeTeamUser,
  type ActionState,
} from "@/app/(dashboard)/ajustes/actions";

export type TeamMember = {
  id: string;
  full_name: string;
  email: string | null;
  role: string;
};

// Roles asignables por el admin de clínica (admin queda fuera a propósito).
const ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "recepcionista", label: "Recepcionista" },
  { value: "odontologo_general", label: "Odontólogo general" },
  { value: "especialista", label: "Especialista" },
  { value: "asistente", label: "Asistente" },
];

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  recepcionista: "Recepcionista",
  odontologo_general: "Odontólogo general",
  especialista: "Especialista",
  asistente: "Asistente",
};

const initial: ActionState = {};

export function TeamPanel({
  members,
  currentUserId,
}: {
  members: TeamMember[];
  currentUserId: string;
}) {
  return (
    <div className="space-y-4">
      <AddUserForm />
      <div className="overflow-hidden rounded-lg bg-white shadow-sm ring-1 ring-slate-200">
        <div className="divide-y divide-slate-100">
          {members.map((m) => (
            <MemberRow key={m.id} member={m} isSelf={m.id === currentUserId} />
          ))}
          {members.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">Sin usuarios registrados.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MemberRow({ member, isSelf }: { member: TeamMember; isSelf: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const isAdmin = member.role === "admin";
  // Un admin no se edita/elimina desde aquí (lo gestiona el superadmin), ni uno mismo.
  const locked = isAdmin || isSelf;

  function changeRole(role: string) {
    if (role === member.role) return;
    start(async () => {
      const fd = new FormData();
      fd.set("userId", member.id);
      fd.set("role", role);
      const res = await updateTeamUserRole(initial, fd);
      if (res.error) alert(res.error);
      else router.refresh();
    });
  }

  function remove() {
    if (!confirm(`¿Eliminar la cuenta de ${member.full_name}? Esta acción no se puede deshacer.`))
      return;
    start(async () => {
      const fd = new FormData();
      fd.set("userId", member.id);
      const res = await removeTeamUser(fd);
      if (res.error) alert(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="min-w-0">
        <span className="font-medium text-slate-800">{member.full_name}</span>
        {isSelf && <span className="ml-2 text-xs text-clinic">(tú)</span>}
        {member.email && (
          <span className="ml-2 block text-xs text-slate-400 sm:inline">{member.email}</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        {locked ? (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
            {ROLE_LABEL[member.role] ?? member.role}
          </span>
        ) : (
          <>
            <select
              value={member.role}
              disabled={pending}
              onChange={(e) => changeRole(e.target.value)}
              className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic disabled:opacity-50"
            >
              {ROLE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              disabled={pending}
              onClick={remove}
              className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
            >
              Eliminar
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function AddUserForm() {
  const [state, formAction, pending] = useActionState(createTeamUser, initial);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state.ok, router]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg"
      >
        + Agregar usuario
      </button>
    );
  }

  return (
    <form
      ref={formRef}
      action={formAction}
      className="space-y-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200"
    >
      <div className="flex flex-wrap gap-2">
        <label className="flex-1 text-xs" style={{ minWidth: "160px" }}>
          <span className="mb-1 block text-slate-500">Nombre completo *</span>
          <input
            name="full_name"
            type="text"
            required
            placeholder="ej. Rita Recepción"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </label>
        <label className="flex-1 text-xs" style={{ minWidth: "160px" }}>
          <span className="mb-1 block text-slate-500">Email *</span>
          <input
            name="email"
            type="email"
            required
            placeholder="usuario@clinica.com"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex-1 text-xs" style={{ minWidth: "160px" }}>
          <span className="mb-1 block text-slate-500">Contraseña temporal *</span>
          <input
            name="password"
            type="text"
            required
            minLength={8}
            placeholder="mínimo 8 caracteres"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          />
        </label>
        <label className="flex-1 text-xs" style={{ minWidth: "160px" }}>
          <span className="mb-1 block text-slate-500">Rol *</span>
          <select
            name="role"
            required
            defaultValue="recepcionista"
            className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic"
          >
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-clinic px-4 py-2 text-sm font-medium text-white hover:bg-clinic-fg disabled:opacity-50"
        >
          {pending ? "Creando…" : "Crear usuario"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-slate-200 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Cancelar
        </button>
        {state.error && <p className="w-full text-sm text-red-600">{state.error}</p>}
      </div>
    </form>
  );
}
