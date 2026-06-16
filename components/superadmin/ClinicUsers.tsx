"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, UserX, UserCheck } from "lucide-react";
import { confirm } from "@/lib/confirm";
import {
  removeClinicUser,
  updateUserRole,
  setUserActive,
} from "@/app/(dashboard)/superadmin/actions";

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
  active: boolean;
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

  async function handleToggleActive(userId: string, name: string, active: boolean) {
    const ok = await confirm({
      title: active ? "Desactivar usuario" : "Reactivar usuario",
      message: active
        ? `¿Desactivar a ${name}? No podrá iniciar sesión, pero se conserva toda su información (citas, trabajos, comisiones).`
        : `¿Reactivar a ${name}? Volverá a tener acceso al sistema.`,
      confirmText: active ? "Desactivar" : "Reactivar",
      tone: active ? "danger" : "default",
    });
    if (!ok) return;
    const fd = new FormData();
    fd.set("userId", userId);
    fd.set("active", String(!active));
    startTransition(async () => {
      await setUserActive(fd);
      router.refresh();
    });
  }

  if (!users.length) {
    return <p className="text-xs text-slate-400">Sin usuarios registrados.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-md border border-slate-200">
      {users.map((u) => (
        <li
          key={u.id}
          className={`flex items-center gap-3 px-3 py-2 ${u.active ? "" : "bg-slate-50"}`}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                className={`truncate text-sm font-medium ${
                  u.active ? "" : "text-slate-400 line-through"
                }`}
              >
                {u.full_name}
              </span>
              {!u.active && (
                <span className="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  Inactivo
                </span>
              )}
            </div>
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
            onClick={() => handleToggleActive(u.id, u.full_name, u.active)}
            className={
              u.active
                ? "rounded p-1 text-slate-400 hover:bg-amber-50 hover:text-amber-600 disabled:opacity-50"
                : "rounded p-1 text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 disabled:opacity-50"
            }
            title={u.active ? "Desactivar usuario" : "Reactivar usuario"}
          >
            {u.active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
          </button>
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
