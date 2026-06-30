"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPlan } from "@/app/(dashboard)/superadmin/actions";

export function PlanSelect({
  clinicId,
  plan,
}: {
  clinicId: string;
  plan: string;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function change(e: React.ChangeEvent<HTMLSelectElement>) {
    const fd = new FormData();
    fd.set("clinicId", clinicId);
    fd.set("plan", e.target.value);
    startTransition(async () => {
      await setPlan(fd);
      router.refresh();
    });
  }

  return (
    <select
      defaultValue={plan}
      onChange={change}
      disabled={pending}
      className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-clinic focus:outline-none focus:ring-1 focus:ring-clinic disabled:opacity-50"
    >
      <option value="starter">Starter</option>
      <option value="pro">Pro</option>
      <option value="premium">Premium</option>
    </select>
  );
}
