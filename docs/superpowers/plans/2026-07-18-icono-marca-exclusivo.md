# Icono de marca exclusivo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar el icono genérico de diente (favicon + iconos PWA) por un icono propio de Dentia: una constelación de nodos (círculos = dientes anteriores, cuadrados redondeados = posteriores) que traza la silueta de una "d" minúscula, sobre el mismo degradado `clinic-900 → night` del panel de login.

**Architecture:** Cambio puramente estático/visual en dos archivos SVG, sin lógica de negocio ni rutas nuevas. El favicon (`app/icon.svg`, se ve a 16-32px) usa una versión simplificada de 4 nodos sin líneas de conexión que sobrevivan tan pequeñas. Los iconos PWA (`lib/brandIcon.tsx`, 192/512px) usan la versión completa de 5 nodos + líneas ya validada visualmente con el usuario.

**Tech Stack:** SVG estático, Next.js App Router (`app/icon.svg` es un icono especial de Next.js; `lib/brandIcon.tsx` usa `next/og`'s `ImageResponse` vía la ruta `app/icons/[size]/route.tsx`, sin cambios en esta última).

## Global Constraints

- Español neutro en cualquier texto/comentario nuevo (sin voseo).
- NUNCA hacer push sin autorización explícita del usuario (regla del CLAUDE.md del proyecto).
- Colores exactos a usar (hex, ya definidos/validados, no inventar otros):
  - Fondo degradado: `#134e4a` (equivalente a `clinic-900`) → `#0f172a` (equivalente a `night`).
  - Nodos: `#2dd4bf`, `#5eead4`, `#14b8a6`.
- No se modifica `app/manifest.ts`, `BrandMark.tsx` ni `ToothConstellation.tsx` — fuera de alcance según la spec.

---

### Task 1: Favicon simplificado (`app/icon.svg`)

**Files:**
- Modify: `app/icon.svg`

**Interfaces:**
- Consumes: nada (SVG estático, sin dependencias de código).
- Produces: nada que otro task consuma — Task 2 usa un SVG independiente con su propia geometría (no reutiliza este archivo).

- [ ] **Step 1: Reemplazar el contenido de `app/icon.svg`**

Contenido actual (diente genérico) a reemplazar por completo:

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#0ea5a4"/>
  <path fill="#ffffff" d="M256 104c-44 0-66 22-110 22-38 0-58-18-58 40 0 52 18 88 34 140 12 39 18 78 34 96 14 16 30 6 36-22 7-32 12-68 30-68s23 36 30 68c6 28 22 38 36 22 16-18 22-57 34-96 16-52 34-88 34-140 0-58-20-40-58-40-44 0-66-22-110-22z"/>
</svg>
```

Nuevo contenido — constelación de 4 nodos en forma de "d" (versión simplificada, pensada para leerse a 16-32px):

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="dentiaBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#134e4a"/>
      <stop offset="1" stop-color="#0f172a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#dentiaBg)"/>
  <g stroke="#5eead4" stroke-opacity="0.55" stroke-width="22">
    <line x1="205" y1="175" x2="110" y2="305"/>
    <line x1="110" y1="305" x2="205" y2="410"/>
    <line x1="205" y1="175" x2="335" y2="240"/>
    <line x1="335" y1="240" x2="335" y2="100"/>
  </g>
  <circle cx="205" cy="175" r="40" fill="#2dd4bf"/>
  <rect x="70" y="265" width="80" height="80" rx="24" fill="#5eead4"/>
  <circle cx="205" cy="410" r="38" fill="#2dd4bf"/>
  <circle cx="335" cy="100" r="46" fill="#14b8a6"/>
</svg>
```

- [ ] **Step 2: Verificar que el archivo es SVG válido**

Run: `npx svgo --dry-run app/icon.svg 2>&1 || node -e "require('fs').readFileSync('app/icon.svg','utf8')"`

Expected: no errores de parseo (si `svgo` no está instalado, el fallback con `node -e` solo confirma que el archivo se puede leer; cualquiera de los dos comandos debe salir sin excepción).

- [ ] **Step 3: Commit**

```bash
git add app/icon.svg
git commit -m "feat(marca): favicon exclusivo — constelación en forma de d"
```

---

### Task 2: Icono PWA detallado (`lib/brandIcon.tsx`)

**Files:**
- Modify: `lib/brandIcon.tsx`

**Interfaces:**
- Consumes: nada nuevo — sigue usando `ImageResponse` de `next/og` (ya importado en el archivo).
- Produces: `renderIconPng(size: number): ImageResponse` — firma sin cambios, siguen consumiéndola `app/icons/[size]/route.tsx` (sin modificar) para `/icons/192` y `/icons/512`.

- [ ] **Step 1: Reemplazar el contenido de `lib/brandIcon.tsx`**

Archivo completo (antes tenía un único `ICON_SVG` compartido con el favicon; ahora tiene su propia constante con la variante completa de 5 nodos + líneas, ya que el favicon simplificado de Task 1 no es reutilizable aquí):

```tsx
import { ImageResponse } from "next/og";

// Logo de la app: constelación de nodos (odontograma) en forma de "d",
// mismo lenguaje visual que el favicon (app/icon.svg) pero con más detalle
// (5 nodos + líneas de conexión) porque estos íconos se ven en tamaños
// grandes (192/512px, instalación de PWA) donde el detalle sí se percibe.
const ICON_SVG_DETAILED = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><defs><linearGradient id="dentiaBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#134e4a"/><stop offset="1" stop-color="#0f172a"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="url(#dentiaBg)"/><g stroke="#2dd4bf" stroke-opacity="0.45" stroke-width="10"><line x1="205" y1="185" x2="110" y2="300"/><line x1="110" y1="300" x2="205" y2="415"/><line x1="205" y1="415" x2="330" y2="345"/><line x1="205" y1="185" x2="330" y2="255"/><line x1="330" y1="345" x2="330" y2="255"/><line x1="330" y1="255" x2="330" y2="105"/></g><circle cx="205" cy="185" r="30" fill="#2dd4bf"/><rect x="80" y="270" width="60" height="60" rx="18" fill="#5eead4"/><circle cx="205" cy="415" r="26" fill="#2dd4bf"/><rect x="300" y="315" width="60" height="60" rx="18" fill="#5eead4"/><circle cx="330" cy="105" r="34" fill="#14b8a6"/></svg>`;

const DATA_URI = `data:image/svg+xml;utf8,${encodeURIComponent(ICON_SVG_DETAILED)}`;

// Genera un PNG cuadrado del logo en el tamaño pedido. Lo usan las rutas
// /icons/192 y /icons/512 referenciadas por el manifest.
export function renderIconPng(size: number): ImageResponse {
  return new ImageResponse(
    (
      <img
        width={size}
        height={size}
        src={DATA_URI}
        style={{ width: size, height: size }}
        alt=""
      />
    ),
    { width: size, height: size },
  );
}
```

- [ ] **Step 2: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sin errores (0 salida, exit code 0).

- [ ] **Step 3: Commit**

```bash
git add lib/brandIcon.tsx
git commit -m "feat(marca): icono PWA exclusivo — constelación completa en forma de d"
```

---

### Task 3: Verificación final (build + revisión visual manual)

**Files:**
- Ninguno (solo verificación, no se tocan archivos).

**Interfaces:**
- Consumes: los cambios de Task 1 y Task 2 ya commiteados.
- Produces: confirmación de que el build de producción genera las rutas `/icons/192` y `/icons/512` correctamente y de que el favicon se ve como se espera.

- [ ] **Step 1: Build de producción**

Run: `npx next build`
Expected: build exitoso (`✓ Compiled successfully`), y en la tabla de rutas debe listar `/icons/[size]` con las variantes `/icons/192` y `/icons/512` (igual que antes del cambio, mismo tamaño de bundle aproximado ya que solo cambió el contenido del SVG, no su estructura).

- [ ] **Step 2: Levantar el servidor de desarrollo y revisar visualmente**

Run: `npx next dev`

Con el servidor corriendo:
1. Abrir `http://localhost:3000/login` en el navegador y mirar el favicon en la pestaña — debe verse la constelación en forma de "d" sobre fondo oscuro degradado, no el diente blanco anterior.
2. Abrir `http://localhost:3000/icons/192` directamente — debe devolver la imagen PNG de la variante detallada (5 nodos + líneas).
3. Abrir `http://localhost:3000/icons/512` — mismo icono, mayor resolución.
4. Confirmar que a 16px (tamaño real de pestaña) los 4 nodos del favicon siguen siendo distinguibles como forma (no un borrón indistinguible).

Expected: las tres URLs cargan sin error 404/500, y visualmente el icono es reconociblemente distinto del diente genérico anterior.

- [ ] **Step 3: Confirmar que no quedan referencias muertas**

Run: `grep -rn "ICON_SVG\b" lib/ app/ 2>/dev/null` (o el equivalente con la herramienta Grep del entorno)
Expected: solo debe aparecer `ICON_SVG_DETAILED` en `lib/brandIcon.tsx` — ninguna referencia a un `ICON_SVG` sin sufijo que haya quedado huérfana.

No se requiere commit en este task (es solo verificación); si el Step 2 revela un problema visual, volver a Task 1 o Task 2, ajustar la geometría/colores del SVG correspondiente, y repetir este task.

---

## Self-Review

- **Cobertura de la spec:** favicon simplificado (Task 1) ✓, icono PWA detallado con separación de constantes (Task 2) ✓, verificación de build + visual (Task 3) ✓. La spec explícitamente deja fuera `BrandMark`/`ToothConstellation`/`manifest.ts` — no se tocan en ningún task.
- **Placeholders:** ninguno — cada step tiene el SVG completo o el comando exacto.
- **Consistencia de tipos/nombres:** `renderIconPng(size: number): ImageResponse` se mantiene idéntica a la firma actual, consumida sin cambios por `app/icons/[size]/route.tsx`. La constante interna pasa de `ICON_SVG` a `ICON_SVG_DETAILED` (Task 2, Step 1) y Task 3 Step 3 verifica que no quede ninguna referencia colgante al nombre viejo.
