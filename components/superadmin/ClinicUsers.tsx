"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { confirm } from "@/lib/confirm";
import { removeClinicUser, updateUserRole } from "@/app/(dashboard)/superadmin/actions";

const ROLES = [
  { value: "admin", label: "Admin" },
  { value: "recepcionista", label: "Recepcionista" },
  { value: "odontologo_general", label: "Odontólogo" },
  { value: "especialista", label: "Especialista" },
  { value: "asistente", label: "Asistente" },
];

export type ClinicUser = {
  id: string;
  full_name: string;
  role: string;
  email: string;
};

export function ClinicUsers({ users }: { users: ClinicUser[] }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  async function handleRemove(userId: string, name: string) {
    const ok = await confirm({
      title: "Eliminar usuario",
      message: `¿Eliminar a ${name}? Esta acción no se puede deshacer.`,
      confirmText: "Eliminar",
      tone: "danger",
    });
    if (!ok) return;
    const fd = new FormData();
    fd.set("userId", userId);
    startTransition(async () => {
      await removeClinicUser(fd);
      router.refresh();
    });
  }

  function handleRoleChange(userId: string, role: string) {
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("role", role);
    startTransition(async () => {
      await updateUserRole(fd);
      router.refresh();
    });
  }

  if (!users.length) {
    return <p className="text-xs text-slate-400">Sin usuarios registrados.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
      {users.map((u) => (
        <li key={u.id} className="flex items-center gap-3 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{u.full_name}</div>
            <div className="truncate text-xs text-slate-400">{u.email}</div>
          </div>
          <select
            defaultValue={u.role}
            disabled={pending}
            onChange={(e) => handleRoleChange(u.id, e.target.value)}
            className="rounded border border-slate-200 px-2 py-1 text-xs focus:border-clinic focus:outline-none disabled:opacity-50"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={pending}
            onClick={() => handleRemove(u.id, u.full_name)}
            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
            title="Eliminar usuario"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
