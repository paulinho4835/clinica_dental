# Identidad Dentia en pantallas de auth — Diseño

**Fecha:** 2026-07-18
**Alcance:** login, /recuperar, /restablecer, /bienvenida + metadata del sitio. NO toca documentos impresos, sidebar ni el interior de la app (fase 2).

## Contexto y objetivo

El login actual (`app/(auth)/login/page.tsx`) es una tarjeta blanca centrada sin identidad. El producto no tenía nombre de marca ("DentalSaaS" era placeholder). Decisiones tomadas con Paulo:

- **Nombre de marca: Dentia** (dental + esencia; corto, pronunciable en español).
- **Dirección visual: "firma propia"** — usar el odontograma vectorial del propio producto como elemento de identidad (asset único, ningún competidor lo tiene).
- **Claim: "La clínica, en orden."** (string único, fácil de cambiar).

## Arquitectura

### 1. `app/(auth)/layout.tsx` (NUEVO — layout compartido)

Las 4 páginas del grupo `(auth)` no tienen layout compartido hoy; se crea uno para construir la identidad una sola vez.

- **Escritorio (lg+):** split 55/45.
  - **Izquierda (panel de marca):** gradiente teal profundo `clinic-900 → night` (colores ya definidos en `tailwind.config.ts`). Encima, la **constelación odontograma**: ~14 dientes en trazo fino (`stroke` teal claro, `fill` transparente) usando las formas anatómicas SVG del propio odontograma, distribuidos con aspecto de constelación y conectados por líneas sutiles (`stroke-opacity` baja). Animación lenta de opacidad reutilizando `animate-ghost-pulse` (ya existe) con `animation-delay` escalonado por diente. Abajo-izquierda del panel: `BrandMark` grande + claim + una línea de subtexto.
  - **Derecha (contenido):** fondo claro que respeta dark mode (variables `--white`/`--slate-*` existentes); renderiza `{children}`.
- **Móvil (<lg):** el panel izquierdo se colapsa a franja superior compacta (~120px): gradiente + `BrandMark` centrado; el formulario domina el resto.
- El layout NO importa nada de Supabase ni lógica: es puramente presentacional.

### 2. `components/ui/BrandMark.tsx` (NUEVO)

Wordmark tipográfico "dentia" sin archivo de imagen:

- Texto "dentia" en Inter (la fuente ya cargada), `font-bold`, minúsculas, `tracking-tight`.
- El punto de la "i" se reemplaza por un **círculo/diente teal** (SVG inline mínimo o pseudo-elemento posicionado) — el detalle propio de la marca.
- Props: `size` ("sm" | "lg") y `tone` ("light" para el panel oscuro, "dark" para fondos claros). Reutilizable en fase 2 (sidebar, documentos).

### 3. Constelación odontograma

- Componente presentacional `components/ui/ToothConstellation.tsx` (NUEVO): SVG único con los paths de dientes (formas tomadas/adaptadas de `components/odontogram/Tooth.tsx` — anteriores circulares, posteriores redondeados), posiciones fijas elegidas a mano (no aleatorias: SSR-estable, sin hydration mismatch), líneas de conexión finas.
- `aria-hidden`, `pointer-events-none`. Decorativo puro.
- Respeta `prefers-reduced-motion`: sin animación si el usuario la desactiva.

### 4. Páginas de auth (MODIFICAR)

- `login/page.tsx`: se elimina el `<main>` centrado propio; el contenido pasa a ser título "Bienvenido de nuevo" + microcopy + los mismos `Field`/`Button` con más aire (`space-y-5`). El mensaje de error usa `animate-shake` (ya existe). **Cero cambios en la lógica de submit/rate-limiting/Supabase.**
- `recuperar`, `restablecer`, `bienvenida`: mismo tratamiento (quitar su contenedor centrado propio, adoptar el layout). Sin cambios de lógica.

### 5. Metadata (`app/layout.tsx`)

- `title`: "Dentia — Gestión de clínicas dentales"; `openGraph.title`: "Dentia". Nada más se renombra en esta fase.

## Manejo de errores

Sin cambios: los flujos de error existentes (credenciales inválidas, rate limit) se conservan; solo cambia la presentación (texto rojo + shake).

## Testing

- `npm test` (381 tests) debe seguir verde — no se toca lógica.
- `npx tsc --noEmit` limpio.
- Verificación visual manual: login en claro/oscuro, escritorio/móvil, y navegación login → recuperar (consistencia).

## Fuera de alcance (fase 2)

Sidebar, documentos impresos (PrintBrand), correos, renombres internos de código/repos, favicon/íconos PWA con la marca nueva.
