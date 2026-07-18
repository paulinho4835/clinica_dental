# Icono de marca exclusivo — Diseño

**Fecha:** 2026-07-18
**Alcance:** favicon (`app/icon.svg`) e iconos PWA (`lib/brandIcon` → `/icons/192`, `/icons/512`). NO toca `BrandMark`, `ToothConstellation` ni el resto de la identidad de auth (ver [[2026-07-18-dentia-login-design]]).

## Contexto y objetivo

Existen otros productos llamados "Dentia" en el mercado, y el icono actual (un diente genérico blanco sobre fondo teal, `app/icon.svg`) es indistinguible del típico icono de clínica dental — no aporta diferenciación en una barra de pestañas con varios resultados de búsqueda "dentia". Se necesita un icono propio, derivado del lenguaje visual ya validado en el login (constelación de nodos del odontograma), que sea reconocible incluso a 16px.

Dirección elegida (aprobada por Paulo tras revisar mockups en el visual companion): **variante A — "constelación en forma de d"**: nodos (círculos = dientes anteriores, cuadrados redondeados = posteriores, mismo lenguaje que `ToothConstellation`/`Tooth.tsx`) conectados por líneas finas, formando la silueta de una "d" minúscula — eco directo del punto teal de la "i" en el wordmark `BrandMark`. Fondo degradado `clinic-900 → night`, el mismo que el panel de marca del login.

## Arquitectura

### Complejidad escalada por tamaño de render

El mismo concepto se implementa en dos niveles de detalle, porque a 16px (favicon real en la pestaña del navegador) las líneas de conexión y los 5 nodos completos se leen como ruido, no como forma:

1. **`app/icon.svg` (favicon, 16-32px en el navegador):** versión simplificada de **4 nodos** que trazan el anillo y el asta de la "d" (se elimina uno de los nodos "posterior" intermedios de la variante mockeada y se engrosan las líneas restantes o se omiten si no aportan legibilidad a ese tamaño). Fondo degradado `clinic-900 → night`.
2. **`lib/brandIcon` (PWA, 192px/512px — `renderIconPng`):** versión completa de **5 nodos + líneas**, igual a la variante A mockeada, donde el detalle adicional sí es perceptible y añade riqueza visual (ícono de instalación de app, splash screens).

### 1. `app/icon.svg` (MODIFICAR)

- Reemplaza el `<rect fill="#0ea5a4"/>` + `<path>` de diente genérico actual por: `<rect>` con `fill` degradado (`linearGradient` `clinic-900` → `night`, mismos tonos hex que usa `AuthLayout` en `bg-gradient-to-br from-clinic-900 to-night`) y 4 nodos (2 `circle`, 2 `rect rx` redondeado) posicionados para formar la "d": anillo (3 nodos) + asta vertical (1-2 nodos arriba a la derecha del anillo).
- Colores de nodo: tonos teal claros (`#2dd4bf`, `#5eead4`, `#14b8a6`) sobre el fondo oscuro, con buen contraste a tamaño mínimo.
- Sin líneas de conexión, o líneas mínimas gruesas solo si tras probar a 16px siguen siendo legibles (decisión final se valida visualmente en implementación, no bloquea el resto del diseño).

### 2. `lib/brandIcon.tsx` (MODIFICAR)

- Hoy `ICON_SVG` es literalmente el mismo string SVG que `app/icon.svg` (comentario del archivo: "Mismo arte que app/icon.svg"), embebido como `data:image/svg+xml` y rasterizado con `next/og`'s `ImageResponse`. Se **separa** en dos constantes de SVG: `ICON_SVG` (favicon, 4 nodos, ver punto 1) y un nuevo `ICON_SVG_DETAILED` (PWA, 5 nodos + líneas) usado solo por `renderIconPng`.
- `renderIconPng(size)` pasa a usar `ICON_SVG_DETAILED`: variante A completa (3 círculos + 2 rects redondeados + líneas de conexión con `stroke-opacity` baja), mismo criterio de posiciones que el mockup del visual companion (anillo + asta de la "d", fondo degradado).
- El resto de la función (`ImageResponse`, `data:` URI, firma) no cambia.

### 3. Consistencia de marca

- Los colores (`clinic-900`, `night`, escala `clinic`/`teal`) ya existen en `tailwind.config.ts`; el SVG del icono usa los valores hex equivalentes directamente (los SVGs de icon/manifest no tienen acceso a clases de Tailwind).
- No se modifica `manifest.webmanifest`, `theme_color` ni ningún otro metadato — solo el contenido visual de los iconos ya referenciados.

## Manejo de errores

N/A — cambio puramente visual/estático, sin lógica de negocio ni rutas nuevas.

## Testing

- `npx tsc --noEmit` limpio.
- `npx next build` exitoso (ya genera `/icons/192` y `/icons/512` como rutas estáticas).
- Verificación visual manual: favicon en pestaña del navegador (16px), ícono de "Instalar app" en Chrome/PWA (192px), comparación lado a lado con el diente genérico anterior.

## Fuera de alcance

- No se toca `BrandMark.tsx` ni `ToothConstellation.tsx` (ya usan su propio lenguaje visual, sin depender del favicon).
- No se generan variantes de icono para redes sociales / Open Graph en esta fase.
- No se rediseña el `manifest.webmanifest` más allá de que siga apuntando a los mismos archivos.
