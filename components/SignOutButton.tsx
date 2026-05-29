"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={signOut}
      className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-100"
    >
      Cerrar sesión
    </button>
  );
}
