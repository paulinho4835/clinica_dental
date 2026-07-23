# Superadmin "Entrar como usuario" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the superadmin open a real staff account's session (any role) via a
per-user button in `/superadmin`, to reproduce role-specific bugs exactly as that
person sees them, then return to their own superadmin session with one click.

**Architecture:** A server action (`impersonateUser`) generates a Supabase magic-link
token server-side and immediately redeems it into a session for the target user — no
email sent, no password touched. The browser stores its own superadmin tokens in
`sessionStorage` before switching, and a client-only banner (`ImpersonationBanner`)
detects that stored state to offer "Salir" and restore the original session. Nothing is
written to any database table.

**Tech Stack:** Next.js Server Actions, Supabase Auth Admin API (`generateLink` +
`verifyOtp`), `sessionStorage` (browser).

## Global Constraints

- Never allow impersonating another row in `platform_admins`.
- Never modify the target user's password.
- Never send any email to the target user.
- Never write to `audit_log` or any other table for this feature (explicit user
  decision — the clinic must not be able to tell).
- Use `sessionStorage`, not `localStorage`, for the return-token stash (tokens must not
  outlive the browser tab/session).
- No database migration needed.

---

### Task 1: Shared `ROLE_LABEL` map in `lib/rbac.ts`

**Files:**
- Modify: `lib/rbac.ts`
- Modify: `app/(dashboard)/layout.tsx:121-133`
- Modify: `tests/rbac.test.ts`

**Interfaces:**
- Produces: `ROLE_LABEL: Record<Role, string>`, exported from `lib/rbac.ts`. Task 3's
  `ImpersonateUserButton` imports this.

The dashboard layout already has an inline `ROLE_LABEL` object (role → Spanish display
name). Task 3 needs the same mapping for the impersonation button's label. Move it to
`lib/rbac.ts` so both places share one source.

- [ ] **Step 1: Write the failing test**

Add to the bottom of `tests/rbac.test.ts`:

```typescript
import { ROLE_LABEL } from "@/lib/rbac";

describe("ROLE_LABEL", () => {
  it("tiene una etiqueta en español para cada rol", () => {
    expect(ROLE_LABEL.admin).toBe("Administrador");
    expect(ROLE_LABEL.recepcionista).toBe("Recepcionista");
    expect(ROLE_LABEL.colega).toBe("Colega");
    expect(ROLE_LABEL.odontologo_general).toBe("Odontólogo");
    expect(ROLE_LABEL.especialista).toBe("Especialista");
    expect(ROLE_LABEL.asistente).toBe("Asistente");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/rbac.test.ts`
Expected: FAIL — `ROLE_LABEL` is not exported from `@/lib/rbac`.

- [ ] **Step 3: Add the export to `lib/rbac.ts`**

Add right after the `Role` type definition (after line 10, before
`isReceptionistLike`):

```typescript
// Etiquetas en español para mostrar el rol en UI (menú lateral, panel de
// superadmin, banner de "entrar como usuario").
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Administrador",
  recepcionista: "Recepcionista",
  colega: "Colega",
  odontologo_general: "Odontólogo",
  especialista: "Especialista",
  asistente: "Asistente",
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/rbac.test.ts`
Expected: PASS

- [ ] **Step 5: Replace the duplicate in `app/(dashboard)/layout.tsx`**

Current code at `app/(dashboard)/layout.tsx:121-128`:

```tsx
  const ROLE_LABEL: Record<string, string> = {
    admin: "Administrador",
    recepcionista: "Recepcionista",
    colega: "Colega",
    odontologo_general: "Odontólogo",
    especialista: "Especialista",
    asistente: "Asistente",
  };
```

Delete that block entirely. Add `ROLE_LABEL` to the existing import from
`@/lib/rbac` near the top of the file:

```typescript
import { canSeeNav, ROLE_LABEL, type Role } from "@/lib/rbac";
```

The rest of the file already references `ROLE_LABEL[profile?.role ?? ""]` — that line
does not need to change, since `ROLE_LABEL` is still in scope, just imported instead of
declared locally.

- [ ] **Step 6: Run typecheck and full test suite**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

Run: `npx vitest run`
Expected: all tests pass (same count as before, plus the one new test).

- [ ] **Step 7: Commit**

```bash
git add lib/rbac.ts "app/(dashboard)/layout.tsx" tests/rbac.test.ts
git commit -m "refactor(rbac): compartir ROLE_LABEL entre layout y panel de superadmin"
```

---

### Task 2: `impersonateUser` server action

**Files:**
- Modify: `app/(dashboard)/superadmin/actions.ts`
- Create: `tests/impersonateUser.test.ts`

**Interfaces:**
- Consumes: `assertSuperadmin()` (existing, private to this file), `createAdminClient()`
  from `@/lib/supabase/admin`, `createClient()` from `@/lib/supabase/server` (both
  already imported at the top of `actions.ts`).
- Produces:
  ```typescript
  export async function impersonateUser(targetUserId: string): Promise<{
    original: { access_token: string; refresh_token: string };
    impersonated: { access_token: string; refresh_token: string };
    targetName: string;
    targetRole: string;
  }>
  ```
  Task 3's `ImpersonateUserButton` calls this exact function with this exact return
  shape.

- [ ] **Step 1: Write the failing test**

Create `tests/impersonateUser.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from "vitest";

let platformAdmin = true;
vi.mock("@/lib/superadmin", () => ({
  isPlatformAdmin: async () => platformAdmin,
}));

function chain(result: { data: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "eq", "single", "maybeSingle"]) builder[m] = vi.fn(() => builder);
  (builder as { then: unknown }).then = (resolve: (v: typeof result) => void) => resolve(result);
  return builder;
}

let platformAdminRowResult: { data: unknown };
let profileResult: { data: unknown };
const adminFrom = vi.fn((table: string) => {
  if (table === "platform_admins") return chain(platformAdminRowResult);
  if (table === "profiles") return chain(profileResult);
  throw new Error(`tabla no mockeada: ${table}`);
});

let getUserByIdResult: { data: unknown; error: unknown };
let generateLinkResult: { data: unknown; error: unknown };
const generateLink = vi.fn(async () => generateLinkResult);
const getUserById = vi.fn(async () => getUserByIdResult);

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: adminFrom,
    auth: { admin: { getUserById, generateLink } },
  }),
}));

let sessionResult: { data: { session: unknown } };
let verifyOtpResult: { data: { session: unknown }; error: unknown };
const getSession = vi.fn(async () => sessionResult);
const verifyOtp = vi.fn(async () => verifyOtpResult);

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getSession, verifyOtp },
  }),
}));

const { impersonateUser } = await import("@/app/(dashboard)/superadmin/actions");

describe("impersonateUser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    platformAdmin = true;
    platformAdminRowResult = { data: null };
    profileResult = { data: { full_name: "Ana Recepción", role: "recepcionista" } };
    getUserByIdResult = { data: { user: { email: "ana@clinica.test" } }, error: null };
    generateLinkResult = {
      data: { properties: { hashed_token: "tok-123" } },
      error: null,
    };
    sessionResult = {
      data: { session: { access_token: "sa-access", refresh_token: "sa-refresh" } },
    };
    verifyOtpResult = {
      data: { session: { access_token: "imp-access", refresh_token: "imp-refresh" } },
      error: null,
    };
  });

  it("rechaza si quien llama no es superadmin", async () => {
    platformAdmin = false;
    await expect(impersonateUser("user-1")).rejects.toThrow("No autorizado");
  });

  it("rechaza entrar como otro superadmin", async () => {
    platformAdminRowResult = { data: { user_id: "user-1" } };
    await expect(impersonateUser("user-1")).rejects.toThrow(
      "No se puede entrar como otro superadmin",
    );
  });

  it("rechaza si el usuario no existe", async () => {
    profileResult = { data: null };
    await expect(impersonateUser("user-1")).rejects.toThrow("Usuario no encontrado");
  });

  it("devuelve tokens originales e impersonados, y nombre/rol del objetivo", async () => {
    const result = await impersonateUser("user-1");
    expect(result.original).toEqual({ access_token: "sa-access", refresh_token: "sa-refresh" });
    expect(result.impersonated).toEqual({ access_token: "imp-access", refresh_token: "imp-refresh" });
    expect(result.targetName).toBe("Ana Recepción");
    expect(result.targetRole).toBe("recepcionista");
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "ana@clinica.test" });
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "tok-123", type: "magiclink" });
  });

  it("propaga error si generateLink falla", async () => {
    generateLinkResult = { data: null, error: { message: "boom" } };
    await expect(impersonateUser("user-1")).rejects.toThrow(
      "No se pudo generar el acceso: boom",
    );
  });

  it("propaga error si verifyOtp falla", async () => {
    verifyOtpResult = { data: { session: null }, error: { message: "otp inválido" } };
    await expect(impersonateUser("user-1")).rejects.toThrow(
      "No se pudo iniciar sesión: otp inválido",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/impersonateUser.test.ts`
Expected: FAIL — `impersonateUser` is not exported from
`@/app/(dashboard)/superadmin/actions`.

- [ ] **Step 3: Add the action to `app/(dashboard)/superadmin/actions.ts`**

Add at the end of the file (after `exitClinic`):

```typescript
// ── "Entrar como este usuario" ───────────────────────────────────────────────
// Genera una sesión real de un usuario de clínica vía magic link (server-side,
// sin enviar ningún email, sin tocar su contraseña) para que el superadmin
// reproduzca bugs "tal cual los ve" esa persona. No escribe en audit_log ni en
// ninguna tabla — decisión explícita: la clínica no debe notar nada.
export async function impersonateUser(targetUserId: string): Promise<{
  original: { access_token: string; refresh_token: string };
  impersonated: { access_token: string; refresh_token: string };
  targetName: string;
  targetRole: string;
}> {
  await assertSuperadmin();

  const serverClient = await createClient();
  const {
    data: { session: originalSession },
  } = await serverClient.auth.getSession();
  if (!originalSession) throw new Error("No hay sesión activa");

  const admin = createAdminClient();

  const { data: targetIsAdmin } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (targetIsAdmin) throw new Error("No se puede entrar como otro superadmin");

  const { data: targetProfile } = await admin
    .from("profiles")
    .select("full_name, role")
    .eq("id", targetUserId)
    .single();
  if (!targetProfile) throw new Error("Usuario no encontrado");

  const { data: targetAuthUser, error: getUserErr } = await admin.auth.admin.getUserById(targetUserId);
  const email = targetAuthUser?.user?.email;
  if (getUserErr || !email) throw new Error("El usuario no tiene email registrado");

  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !linkData) {
    throw new Error(`No se pudo generar el acceso: ${linkErr?.message ?? "sin datos"}`);
  }

  const { data: verifyData, error: verifyErr } = await serverClient.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: "magiclink",
  });
  if (verifyErr || !verifyData.session) {
    throw new Error(`No se pudo iniciar sesión: ${verifyErr?.message ?? "sin sesión"}`);
  }

  return {
    original: {
      access_token: originalSession.access_token,
      refresh_token: originalSession.refresh_token,
    },
    impersonated: {
      access_token: verifyData.session.access_token,
      refresh_token: verifyData.session.refresh_token,
    },
    targetName: targetProfile.full_name,
    targetRole: targetProfile.role,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/impersonateUser.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit -p .`
Expected: no errors. If `generateLink`'s return type doesn't have
`properties.hashed_token` typed, check the installed `@supabase/supabase-js` version's
`GenerateLinkResponse` type — it does include `properties: { hashed_token: string; ... }`
for all non-error responses.

- [ ] **Step 6: Commit**

```bash
git add "app/(dashboard)/superadmin/actions.ts" tests/impersonateUser.test.ts
git commit -m "feat(superadmin): agregar impersonateUser (magic link, sin tocar contraseña)"
```

---

### Task 3: `ImpersonateUserButton` + wire into `ClinicUsers.tsx`

**Files:**
- Create: `components/superadmin/ImpersonateUserButton.tsx`
- Modify: `components/superadmin/ClinicUsers.tsx`
- Create: `tests/impersonateUserButton.test.tsx`

**Interfaces:**
- Consumes: `impersonateUser(userId: string)` from Task 2, `ROLE_LABEL` from Task 1,
  `createClient()` from `@/lib/supabase/client`.
- Produces: `ImpersonateUserButton({ userId: string })` component, rendered per row in
  `ClinicUsers.tsx`. Writes to `sessionStorage` keys `sa_impersonation_return` and
  `sa_impersonation_label` — Task 4's `ImpersonationBanner` reads these exact keys.

- [ ] **Step 1: Write the failing test**

Create `tests/impersonateUserButton.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImpersonateUserButton } from "@/components/superadmin/ImpersonateUserButton";

const impersonateUser = vi.fn();
vi.mock("@/app/(dashboard)/superadmin/actions", () => ({ impersonateUser }));

const setSession = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { setSession } }),
}));

describe("ImpersonateUserButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
    impersonateUser.mockResolvedValue({
      original: { access_token: "sa-a", refresh_token: "sa-r" },
      impersonated: { access_token: "imp-a", refresh_token: "imp-r" },
      targetName: "Ana Recepción",
      targetRole: "recepcionista",
    });
  });

  it("guarda la sesión original, fija la impersonada y redirige a /agenda", async () => {
    render(<ImpersonateUserButton userId="user-1" />);
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() =>
      expect(setSession).toHaveBeenCalledWith({ access_token: "imp-a", refresh_token: "imp-r" }),
    );

    expect(impersonateUser).toHaveBeenCalledWith("user-1");
    expect(JSON.parse(sessionStorage.getItem("sa_impersonation_return")!)).toEqual({
      access_token: "sa-a",
      refresh_token: "sa-r",
    });
    expect(sessionStorage.getItem("sa_impersonation_label")).toBe(
      "Ana Recepción (Recepcionista)",
    );
    expect(window.location.href).toBe("/agenda");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/impersonateUserButton.test.tsx`
Expected: FAIL — `components/superadmin/ImpersonateUserButton.tsx` does not exist.

- [ ] **Step 3: Create the component**

Create `components/superadmin/ImpersonateUserButton.tsx`:

```tsx
"use client";

import { useTransition } from "react";
import { LogIn } from "lucide-react";
import { impersonateUser } from "@/app/(dashboard)/superadmin/actions";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABEL, type Role } from "@/lib/rbac";

// Entra como un usuario real de una clínica (no un rol genérico) vía magic
// link server-side — su contraseña real nunca se toca. Guardamos la sesión
// actual de superadmin en sessionStorage (vive solo en esta pestaña) para que
// ImpersonationBanner pueda restaurarla al salir.
export function ImpersonateUserButton({ userId }: { userId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      title="Entrar como este usuario"
      onClick={() =>
        startTransition(async () => {
          const result = await impersonateUser(userId);
          sessionStorage.setItem(
            "sa_impersonation_return",
            JSON.stringify(result.original),
          );
          sessionStorage.setItem(
            "sa_impersonation_label",
            `${result.targetName} (${ROLE_LABEL[result.targetRole as Role] ?? result.targetRole})`,
          );
          await createClient().auth.setSession(result.impersonated);
          window.location.href = "/agenda";
        })
      }
      className="rounded p-1 text-slate-400 hover:bg-clinic/10 hover:text-clinic disabled:opacity-50"
    >
      <LogIn className="h-3.5 w-3.5" />
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/impersonateUserButton.test.tsx`
Expected: PASS

- [ ] **Step 5: Wire the button into `components/superadmin/ClinicUsers.tsx`**

Add the import near the top (after the `confirm` import):

```typescript
import { ImpersonateUserButton } from "@/components/superadmin/ImpersonateUserButton";
```

In the `<li>` row (current lines 84-141), add the button right before the existing
role `<select>`. Current row start:

```tsx
        <li
          key={u.id}
          className={`flex items-center gap-3 px-3 py-2 ${u.active ? "" : "bg-slate-50"}`}
        >
          <div className="min-w-0 flex-1">
```

Leave that unchanged. Insert the new button right after the closing `</div>` of the
name/email block and before the role `<select>`:

```tsx
          <ImpersonateUserButton userId={u.id} />
          <select
            defaultValue={u.role}
```

- [ ] **Step 6: Run the full test suite and typecheck**

Run: `npx vitest run`
Expected: all pass.

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/superadmin/ImpersonateUserButton.tsx components/superadmin/ClinicUsers.tsx tests/impersonateUserButton.test.tsx
git commit -m "feat(superadmin): botón 'entrar como este usuario' en la lista de usuarios"
```

---

### Task 4: `ImpersonationBanner` + mount in layout + sign-out cleanup

**Files:**
- Create: `components/superadmin/ImpersonationBanner.tsx`
- Modify: `app/(dashboard)/layout.tsx`
- Modify: `components/SignOutButton.tsx`
- Create: `tests/impersonationBanner.test.tsx`
- Create: `tests/signOutButton.test.tsx`

**Interfaces:**
- Consumes: `sessionStorage` keys `sa_impersonation_return` /
  `sa_impersonation_label` (written by Task 3), `createClient()` from
  `@/lib/supabase/client`.
- Produces: `ImpersonationBanner()` component (no props), mounted unconditionally in the
  dashboard layout.

- [ ] **Step 1: Write the failing test for the banner**

Create `tests/impersonationBanner.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ImpersonationBanner } from "@/components/superadmin/ImpersonationBanner";

const setSession = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { setSession } }),
}));

describe("ImpersonationBanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
  });

  it("no renderiza nada si no hay sesión de impersonación guardada", () => {
    render(<ImpersonationBanner />);
    expect(screen.queryByText(/Viendo como/)).not.toBeInTheDocument();
  });

  it("muestra el nombre guardado y restaura la sesión original al salir", async () => {
    sessionStorage.setItem("sa_impersonation_label", "Ana Recepción (Recepcionista)");
    sessionStorage.setItem(
      "sa_impersonation_return",
      JSON.stringify({ access_token: "sa-a", refresh_token: "sa-r" }),
    );

    render(<ImpersonationBanner />);
    expect(await screen.findByText(/Ana Recepción/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /salir/i }));

    await waitFor(() =>
      expect(setSession).toHaveBeenCalledWith({ access_token: "sa-a", refresh_token: "sa-r" }),
    );
    expect(sessionStorage.getItem("sa_impersonation_return")).toBeNull();
    expect(sessionStorage.getItem("sa_impersonation_label")).toBeNull();
    expect(window.location.href).toBe("/superadmin");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/impersonationBanner.test.tsx`
Expected: FAIL — `components/superadmin/ImpersonationBanner.tsx` does not exist.

- [ ] **Step 3: Create the component**

Create `components/superadmin/ImpersonationBanner.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Eye, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const RETURN_KEY = "sa_impersonation_return";
const LABEL_KEY = "sa_impersonation_label";

// Se auto-detecta 100% en el navegador: al impersonar una cuenta real, el
// auth.uid() del servidor pasa a ser el de esa persona, así que ningún query
// del servidor puede ya saber "hay un superadmin disfrazado" — solo esta
// pestaña, que guardó los tokens originales en sessionStorage, lo sabe.
export function ImpersonationBanner() {
  const [label, setLabel] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setLabel(sessionStorage.getItem(LABEL_KEY));
  }, []);

  if (!label) return null;

  async function exit() {
    setPending(true);
    const raw = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    sessionStorage.removeItem(LABEL_KEY);
    if (raw) {
      await createClient().auth.setSession(JSON.parse(raw));
    }
    window.location.href = "/superadmin";
  }

  return (
    <div className="flex items-center justify-between gap-4 bg-purple-600 px-4 py-2 text-sm font-medium text-white">
      <div className="flex items-center gap-2">
        <Eye className="h-4 w-4 shrink-0" />
        <span>
          Viendo como <span className="font-bold">{label}</span>
          <span className="ml-2 font-normal opacity-80">
            (no se registra en ningún lado)
          </span>
        </span>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={exit}
        className="flex items-center gap-1 rounded bg-white/20 px-2 py-1 text-xs hover:bg-white/30 disabled:opacity-50"
      >
        <X className="h-3 w-3" />
        {pending ? "Volviendo…" : "Salir"}
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/impersonationBanner.test.tsx`
Expected: PASS

- [ ] **Step 5: Mount the banner in `app/(dashboard)/layout.tsx`**

Add the import next to the existing `ExitPreviewBanner` import:

```typescript
import { ImpersonationBanner } from "@/components/superadmin/ImpersonationBanner";
```

Current line `app/(dashboard)/layout.tsx:137`:

```tsx
      {isPreview && <ExitPreviewBanner clinicName={clinicName} />}
```

Add the new banner right after it, unconditionally (it self-detects via
`sessionStorage`, unlike `ExitPreviewBanner` which depends on the server-computed
`isPreview`):

```tsx
      {isPreview && <ExitPreviewBanner clinicName={clinicName} />}
      <ImpersonationBanner />
```

- [ ] **Step 6: Write the failing test for sign-out cleanup**

Create `tests/signOutButton.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SignOutButton } from "@/components/SignOutButton";

const signOut = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signOut } }),
}));

describe("SignOutButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
    Object.defineProperty(window, "location", { value: { href: "" }, writable: true });
  });

  it("limpia las claves de impersonación al cerrar sesión", async () => {
    sessionStorage.setItem("sa_impersonation_return", "{}");
    sessionStorage.setItem("sa_impersonation_label", "alguien");

    render(<SignOutButton />);
    fireEvent.click(screen.getByRole("button", { name: /cerrar sesión/i }));

    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(sessionStorage.getItem("sa_impersonation_return")).toBeNull();
    expect(sessionStorage.getItem("sa_impersonation_label")).toBeNull();
    expect(window.location.href).toBe("/login");
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npx vitest run tests/signOutButton.test.tsx`
Expected: FAIL — sessionStorage keys are never cleared today.

- [ ] **Step 8: Update `components/SignOutButton.tsx`**

Current file:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    await createClient().auth.signOut();
    window.location.href = "/login";
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
```

Replace the `signOut` function body — clear the impersonation keys first so a stale
banner never shows up for a normal login later in the same tab:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton() {
  const router = useRouter();
  async function signOut() {
    sessionStorage.removeItem("sa_impersonation_return");
    sessionStorage.removeItem("sa_impersonation_label");
    await createClient().auth.signOut();
    window.location.href = "/login";
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
```

(The unused `router` variable was already present before this change — leave it as is,
out of scope for this task.)

- [ ] **Step 9: Run test to verify it passes**

Run: `npx vitest run tests/signOutButton.test.tsx`
Expected: PASS

- [ ] **Step 10: Run the full test suite and typecheck**

Run: `npx vitest run`
Expected: all tests pass.

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add components/superadmin/ImpersonationBanner.tsx "app/(dashboard)/layout.tsx" components/SignOutButton.tsx tests/impersonationBanner.test.tsx tests/signOutButton.test.tsx
git commit -m "feat(superadmin): banner para salir de 'entrar como usuario' + limpieza al cerrar sesión"
```

---

## Manual Verification (after all tasks, not automatable)

1. Deploy or run locally with real Supabase credentials.
2. As superadmin, go to `/superadmin`, expand a test clinic, click "Entrar como este
   usuario" (`ImpersonateUserButton`, the `LogIn` icon) next to a recepcionista test
   account.
3. Confirm you land on `/agenda` seeing exactly what that recepcionista role sees (menu,
   permissions), and the purple banner shows "Viendo como {nombre} (Recepcionista)".
4. In a separate normal login as that recepcionista (different browser/incognito),
   confirm their password still works — proves the magic link never touched it.
5. Click "Salir" on the banner — confirm you land back on `/superadmin` as superadmin,
   with no further login prompt.
6. Confirm no new row appears in `audit_log` for any of the above.
