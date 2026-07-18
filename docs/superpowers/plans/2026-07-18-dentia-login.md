# Identidad Dentia en pantallas de auth — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar identidad de marca "Dentia" a las 4 pantallas de auth mediante un layout compartido con panel teal + constelación de dientes SVG, wordmark tipográfico y metadata actualizada.

**Architecture:** Un layout de grupo `app/(auth)/layout.tsx` monta el panel de marca (split 55/45 en escritorio, franja superior en móvil) con dos componentes presentacionales nuevos (`BrandMark`, `ToothConstellation`). Las 4 páginas pierden su contenedor centrado propio y quedan como formularios puros dentro del layout. Cero cambios de lógica de auth.

**Tech Stack:** Next.js App Router, Tailwind (tokens `clinic`/`night` y animaciones `ghost-pulse`/`shake` ya definidos en `tailwind.config.ts`), TypeScript.

## Global Constraints

- Español neutro en toda la UI (sin voseo).
- Nombre de marca exacto: **Dentia** (wordmark en minúsculas: "dentia").
- Claim exacto: **"La clínica, en orden."**
- Título del sitio exacto: **"Dentia — Gestión de clínicas dentales"**.
- NO tocar la lógica de submit/rate-limiting/Supabase de ninguna página.
- NO usar archivos de imagen: logo y constelación son tipografía + SVG inline.
- El lado del formulario debe respetar dark mode (variables `--white`/`--slate-*`); el panel de marca es oscuro FIJO (no invierte).
- La constelación es decorativa: `aria-hidden`, `pointer-events-none`, y su animación usa `motion-safe:` (respeta `prefers-reduced-motion`).
- Al terminar cada tarea: `npx tsc --noEmit` limpio (ignorar errores preexistentes de `.next/types`) y `npm test` verde (381 tests). No hay infraestructura de tests de componentes en el repo (Vitest cubre solo lógica pura en `lib/`); NO inventar tests de render.

---

### Task 1: Componentes de marca (`BrandMark` + `ToothConstellation`)

**Files:**
- Create: `components/ui/BrandMark.tsx`
- Create: `components/ui/ToothConstellation.tsx`

**Interfaces:**
- Consumes: `cn` de `@/lib/cn` (ya existe).
- Produces: `BrandMark({ size?: "sm" | "lg"; tone?: "light" | "dark"; className?: string })` y `ToothConstellation({ className?: string })` — ambos export nombrado, server components (sin `"use client"`). Task 2 los importa.

- [ ] **Step 1: Crear `components/ui/BrandMark.tsx`**

```tsx
import { cn } from "@/lib/cn";

interface Props {
  /** sm: sidebar/franja móvil. lg: panel de login. */
  size?: "sm" | "lg";
  /** light: para el panel oscuro fijo (blanco literal). dark: para fondos claros (invierte en dark mode). */
  tone?: "light" | "dark";
  className?: string;
}

// Wordmark "dentia": tipográfico puro (Inter), sin archivo de imagen. La "i"
// se dibuja sin punto (ı) y el punto se reemplaza por el círculo teal de la
// marca, dimensionado en `em` para escalar con el tamaño del texto.
export function BrandMark({ size = "sm", tone = "dark", className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex select-none items-baseline font-bold tracking-tight",
        size === "lg" ? "text-5xl" : "text-2xl",
        // El panel de marca es oscuro fijo: blanco literal, no la variable
        // --white (que se invierte en dark mode).
        tone === "light" ? "text-[#f8fafc]" : "text-slate-900",
        className,
      )}
      aria-label="Dentia"
    >
      dent
      <span className="relative" aria-hidden="true">
        ı
        <span
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-clinic"
          style={{ width: "0.16em", height: "0.16em", top: "0.08em" }}
        />
      </span>
      a
    </span>
  );
}
```

- [ ] **Step 2: Crear `components/ui/ToothConstellation.tsx`**

```tsx
// Constelación decorativa de dientes: la firma visual de Dentia, derivada del
// odontograma vectorial del producto. Anteriores = círculos (como el clip
// circular de Tooth.tsx), posteriores = rects redondeados; cada uno con su
// zona oclusal interior insinuada. Posiciones FIJAS (SSR-estable, sin
// aleatoriedad → sin hydration mismatch). Decorativo puro.

type Kind = "anterior" | "posterior";
interface Node {
  x: number;
  y: number;
  s: number; // radio (anterior) o medio-lado (posterior)
  kind: Kind;
  delay: number; // segundos, escalona el pulso
}

const TEETH: Node[] = [
  { x: 70,  y: 60,  s: 15, kind: "anterior",  delay: 0 },
  { x: 160, y: 40,  s: 20, kind: "posterior", delay: 0.4 },
  { x: 265, y: 75,  s: 13, kind: "anterior",  delay: 0.9 },
  { x: 340, y: 45,  s: 17, kind: "posterior", delay: 1.3 },
  { x: 45,  y: 170, s: 21, kind: "posterior", delay: 0.6 },
  { x: 150, y: 150, s: 12, kind: "anterior",  delay: 1.1 },
  { x: 250, y: 185, s: 19, kind: "posterior", delay: 0.2 },
  { x: 350, y: 160, s: 14, kind: "anterior",  delay: 0.8 },
  { x: 90,  y: 290, s: 16, kind: "anterior",  delay: 1.4 },
  { x: 195, y: 265, s: 22, kind: "posterior", delay: 0.5 },
  { x: 305, y: 300, s: 15, kind: "anterior",  delay: 1.0 },
  { x: 65,  y: 400, s: 18, kind: "posterior", delay: 0.3 },
  { x: 185, y: 380, s: 13, kind: "anterior",  delay: 0.7 },
  { x: 300, y: 415, s: 20, kind: "posterior", delay: 1.2 },
];

// Aristas de la constelación (índices en TEETH).
const LINKS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [0, 4], [1, 5], [5, 6], [6, 7], [3, 7],
  [4, 8], [5, 9], [8, 9], [9, 10], [7, 10], [8, 11], [9, 12], [11, 12], [12, 13], [10, 13],
];

export function ToothConstellation({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 460"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      aria-hidden="true"
    >
      {LINKS.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={TEETH[a].x}
          y1={TEETH[a].y}
          x2={TEETH[b].x}
          y2={TEETH[b].y}
          stroke="#5eead4"
          strokeOpacity={0.14}
          strokeWidth={1}
        />
      ))}
      {TEETH.map((t, i) => (
        <g
          key={i}
          className="motion-safe:animate-ghost-pulse"
          style={{ animationDelay: `${t.delay}s` }}
          stroke="#99f6e4"
          strokeOpacity={0.55}
          strokeWidth={1.2}
          fill="none"
        >
          {t.kind === "anterior" ? (
            <>
              <circle cx={t.x} cy={t.y} r={t.s} />
              <circle cx={t.x} cy={t.y} r={t.s * 0.45} strokeOpacity={0.3} />
            </>
          ) : (
            <>
              <rect
                x={t.x - t.s}
                y={t.y - t.s}
                width={t.s * 2}
                height={t.s * 2}
                rx={5}
              />
              <rect
                x={t.x - t.s * 0.45}
                y={t.y - t.s * 0.45}
                width={t.s * 0.9}
                height={t.s * 0.9}
                rx={2}
                strokeOpacity={0.3}
              />
            </>
          )}
        </g>
      ))}
    </svg>
  );
}
```

- [ ] **Step 3: Verificar compilación y tests**

Run: `npx tsc --noEmit 2>&1 | grep -v ".next/types"` → sin errores nuevos.
Run: `npm test` → Expected: 381 passed.

- [ ] **Step 4: Commit**

```bash
git add components/ui/BrandMark.tsx components/ui/ToothConstellation.tsx
git commit -m "feat(marca): wordmark Dentia y constelación odontograma"
```

---

### Task 2: Layout de auth + login rediseñado

**Files:**
- Create: `app/(auth)/layout.tsx`
- Modify: `app/(auth)/login/page.tsx:52-110` (solo el JSX del return; la lógica de `onSubmit` NO se toca)

**Interfaces:**
- Consumes: `BrandMark` y `ToothConstellation` de Task 1 (firmas exactas arriba).
- Produces: el layout envuelve `{children}` en `<main>` con contenedor `max-w-sm` — las páginas de Task 3 deben devolver su contenido SIN `<main>` ni tarjeta contenedora propia.

- [ ] **Step 1: Crear `app/(auth)/layout.tsx`**

```tsx
import { BrandMark } from "@/components/ui/BrandMark";
import { ToothConstellation } from "@/components/ui/ToothConstellation";

// Layout compartido de las pantallas de auth: panel de marca Dentia (oscuro
// fijo, NO invierte con el tema) + contenido claro (sí respeta dark mode).
// Escritorio: split 55/45. Móvil: franja superior compacta con el logo.
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="relative flex shrink-0 items-center justify-center overflow-hidden bg-gradient-to-br from-clinic-900 to-night py-8 lg:w-[55%] lg:items-end lg:justify-start lg:p-12">
        <ToothConstellation className="pointer-events-none absolute inset-0 hidden h-full w-full lg:block" />
        <div className="relative z-10">
          <BrandMark size="lg" tone="light" />
          <p className="mt-4 hidden max-w-md text-xl font-medium text-teal-100/90 lg:block">
            La clínica, en orden.
          </p>
          <p className="mt-1 hidden text-sm text-teal-100/50 lg:block">
            Agenda, pacientes, tratamientos y caja en un solo lugar.
          </p>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Reescribir SOLO el `return` de `app/(auth)/login/page.tsx`**

Los imports, estados y `onSubmit` quedan idénticos. El `return` completo pasa a ser:

```tsx
  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-widest text-clinic">
          Bienvenido de nuevo
        </p>
        <h1 className="text-2xl font-bold text-slate-900">Iniciar sesión</h1>
        <p className="text-sm text-slate-500">
          Ingresa con tu cuenta de la clínica.
        </p>
      </div>

      <Field
        label="Correo"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Field
        label="Contraseña"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />

      <div className="text-right">
        <Link
          href="/recuperar"
          className="text-sm font-medium text-clinic hover:text-clinic-fg"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </div>

      {error && (
        <p key={error} className="animate-shake text-sm text-red-600">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Entrando…" : "Entrar"}
      </Button>

      <p className="pt-2 text-center text-xs text-slate-400">
        Al ingresar aceptas los{" "}
        <a href="/terminos" className="text-clinic hover:underline">
          Términos
        </a>{" "}
        y la{" "}
        <a href="/privacidad" className="text-clinic hover:underline">
          Política de Privacidad
        </a>
        .
      </p>
    </form>
  );
```

(Nota: `key={error}` fuerza el remontaje del `<p>` para que `animate-shake` se repita si el usuario falla dos veces con el mismo mensaje.)

- [ ] **Step 3: Verificar compilación y tests**

Run: `npx tsc --noEmit 2>&1 | grep -v ".next/types"` → sin errores nuevos.
Run: `npm test` → Expected: 381 passed.

- [ ] **Step 4: Commit**

```bash
git add "app/(auth)/layout.tsx" "app/(auth)/login/page.tsx"
git commit -m "feat(auth): layout de marca Dentia y login rediseñado"
```

---

### Task 3: Resto de páginas de auth + metadata

**Files:**
- Modify: `app/(auth)/recuperar/page.tsx:31-83` (solo JSX del return)
- Modify: `app/(auth)/restablecer/page.tsx:58-118` (solo JSX del return)
- Modify: `app/(auth)/bienvenida/page.tsx:79-138` (solo JSX del return)
- Modify: `app/layout.tsx:15-23` (metadata)

**Interfaces:**
- Consumes: el contrato del layout de Task 2 — las páginas devuelven contenido SIN `<main>` ni tarjeta (`rounded-xl bg-white p-8 shadow ring-1 ring-slate-200`); el layout ya provee centrado y `max-w-sm`.

- [ ] **Step 1: `recuperar/page.tsx`** — el `return` completo pasa a ser (lógica intacta):

```tsx
  return sent ? (
    <div className="space-y-3 text-center">
      <h1 className="text-2xl font-bold text-slate-900">Revisa tu correo</h1>
      <p className="text-sm text-slate-500">
        Si <strong>{email}</strong> está registrado, te enviamos un enlace
        para restablecer tu contraseña. Revisa también la carpeta de spam.
      </p>
      <Link
        href="/login"
        className="inline-block pt-2 text-sm font-medium text-clinic hover:text-clinic-fg"
      >
        Volver al inicio de sesión
      </Link>
    </div>
  ) : (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="text-2xl font-bold text-slate-900">Recuperar contraseña</h1>
        <p className="text-sm text-slate-500">
          Ingresa tu correo y te enviaremos un enlace para crear una nueva
          contraseña.
        </p>
      </div>

      <Field
        label="Correo"
        type="email"
        autoComplete="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Enviando…" : "Enviar enlace"}
      </Button>

      <Link
        href="/login"
        className="block pt-1 text-center text-sm font-medium text-clinic hover:text-clinic-fg"
      >
        Volver al inicio de sesión
      </Link>
    </form>
  );
```

- [ ] **Step 2: `restablecer/page.tsx`** — el `return` completo pasa a ser (lógica intacta):

```tsx
  return (
    <>
      {status === "checking" && (
        <p className="text-center text-sm text-slate-500">Verificando enlace…</p>
      )}

      {status === "invalid" && (
        <div className="space-y-3 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Enlace no válido</h1>
          <p className="text-sm text-slate-500">
            El enlace para restablecer tu contraseña expiró o ya fue usado.
            Solicita uno nuevo.
          </p>
          <Link
            href="/recuperar"
            className="inline-block pt-2 text-sm font-medium text-clinic hover:text-clinic-fg"
          >
            Solicitar enlace nuevo
          </Link>
        </div>
      )}

      {status === "ready" && (
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold text-slate-900">Nueva contraseña</h1>
            <p className="text-sm text-slate-500">
              Define una contraseña nueva para tu cuenta.
            </p>
          </div>

          <Field
            label="Nueva contraseña"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label="Repetir contraseña"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          {error && (
            <p key={error} className="animate-shake text-sm text-red-600">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Guardando…" : "Guardar contraseña"}
          </Button>
        </form>
      )}
    </>
  );
```

- [ ] **Step 3: `bienvenida/page.tsx`** — el `return` completo pasa a ser (lógica intacta):

```tsx
  return (
    <>
      {status === "checking" && (
        <p className="text-center text-sm text-slate-500">Verificando invitación…</p>
      )}

      {status === "invalid" && (
        <div className="space-y-3 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Invitación no válida</h1>
          <p className="text-sm text-slate-500">
            Este enlace de invitación expiró o ya fue usado. Pide a quien te
            invitó que te envíe uno nuevo.
          </p>
          <Link
            href="/login"
            className="inline-block pt-2 text-sm font-medium text-clinic hover:text-clinic-fg"
          >
            Ir al inicio de sesión
          </Link>
        </div>
      )}

      {status === "ready" && (
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <h1 className="text-2xl font-bold text-slate-900">¡Te damos la bienvenida!</h1>
            <p className="text-sm text-slate-500">
              {email ? <>Estás creando la cuenta de <strong>{email}</strong>. </> : null}
              Define una contraseña para acceder.
            </p>
          </div>

          <Field
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Field
            label="Repetir contraseña"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />

          {error && (
            <p key={error} className="animate-shake text-sm text-red-600">
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Guardando…" : "Crear mi cuenta"}
          </Button>
        </form>
      )}
    </>
  );
```

- [ ] **Step 4: Metadata en `app/layout.tsx`** — reemplazar el bloque `metadata` (líneas 15-23) por:

```tsx
export const metadata: Metadata = {
  title: "Dentia — Gestión de clínicas dentales",
  description: "Gestión integral multi-clínica. Sin imágenes: odontograma vectorial y datos estructurados.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Dentia",
  },
};
```

- [ ] **Step 5: Verificar compilación y tests**

Run: `npx tsc --noEmit 2>&1 | grep -v ".next/types"` → sin errores nuevos.
Run: `npm test` → Expected: 381 passed.

- [ ] **Step 6: Commit**

```bash
git add "app/(auth)/recuperar/page.tsx" "app/(auth)/restablecer/page.tsx" "app/(auth)/bienvenida/page.tsx" app/layout.tsx
git commit -m "feat(auth): identidad Dentia en recuperar/restablecer/bienvenida y metadata"
```

---

## Verificación final (manual, tras las 3 tareas)

- `npm run dev` → visitar `/login` en claro y oscuro, escritorio y móvil (DevTools).
- Navegar login → "¿Olvidaste tu contraseña?" → volver: identidad consistente.
- Login real con usuario seed local → redirige a `/agenda` como antes.
