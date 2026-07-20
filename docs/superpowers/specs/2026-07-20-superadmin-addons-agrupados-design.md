# Sección ADD-ONS agrupada por categoría — Diseño

**Contexto:** la sección ADD-ONS de cada tarjeta de clínica en `/superadmin`
(`components/superadmin/ClinicList.tsx`) renderiza los 22 `FeatureKey` con
`optIn: true` como una única lista plana de pills envueltas
(`addons.map((f) => <AddonToggle .../>)`, línea 236-243). Sin distinción
visual entre activos e inactivos ni agrupación temática, es difícil de
escanear — validado con mockups en la sesión de brainstorming (opción "B:
agrupado por categoría" elegida sobre "activos primero + colapsar" y
"buscador").

**Objetivo:** dividir la misma lista de 22 add-ons en 4 grupos temáticos con
encabezado, sin tocar el componente `AddonToggle` (mismo botón, mismo
comportamiento, mismo estilo Tailwind ya existente) ni la lógica de
confirmación agregada hoy — es puramente una reorganización visual del
contenedor.

## Los 4 grupos

Fuente de verdad: `FEATURES` en `lib/features.ts` (22 keys con
`optIn: true`). Agrupación:

| Grupo | Keys (`FeatureKey`) |
|---|---|
| 💬 Comunicación | `whatsapp_manual`, `wa_masivo`, `campanas`, `aviso_doctores`, `recordatorios` |
| 🤖 Agente de IA | `agente_ia`, `agente_ia_t2`, `agente_ia_t3`, `agente_ia_info` |
| 🦷 Ficha clínica y documentos | `recetas`, `consentimientos`, `fotos`, `fotos_contador`, `periodontograma`, `odontograma_pediatrico`, `logo` |
| ⚙️ Administración | `inicio`, `pagos`, `bloqueo_horario`, `perfil`, `disponibilidad`, `calificaciones` |

5 + 4 + 7 + 6 = 22, cubre el total exacto de add-ons hoy. El orden interno
dentro de cada grupo se mantiene igual al orden actual en `FEATURES` (no se
reordena `lib/features.ts`, solo se reparte en el render).

## Implementación

**Dónde vive la agrupación:** un nuevo array constante en
`lib/features.ts`, junto a `FEATURES` (mismo archivo que ya es la fuente de
verdad de metadata de features — evita duplicar la lista de keys en un
componente):

```typescript
export const ADDON_GROUPS: { label: string; keys: FeatureKey[] }[] = [
  { label: "💬 Comunicación", keys: ["whatsapp_manual", "wa_masivo", "campanas", "aviso_doctores", "recordatorios"] },
  { label: "🤖 Agente de IA", keys: ["agente_ia", "agente_ia_t2", "agente_ia_t3", "agente_ia_info"] },
  { label: "🦷 Ficha clínica y documentos", keys: ["recetas", "consentimientos", "fotos", "fotos_contador", "periodontograma", "odontograma_pediatrico", "logo"] },
  { label: "⚙️ Administración", keys: ["inicio", "pagos", "bloqueo_horario", "perfil", "disponibilidad", "calificaciones"] },
];
```

**Render en `ClinicList.tsx`:** reemplazar el `addons.map((f) => <AddonToggle
.../>)` plano (línea 236-243) por un loop sobre `ADDON_GROUPS`, resolviendo
cada `key` contra la prop `addons: FeatureItem[]` ya recibida (para
conservar el `label` ya calculado por `superadmin/page.tsx` — no se
duplica esa fuente). Cada grupo se envuelve en un `<div>` con un `<h4>` de
label (mismo estilo `text-[10px] font-semibold uppercase tracking-wide
text-slate-400` que ya usan los encabezados "Módulos"/"Usuarios" en el
mismo archivo) y debajo el `flex flex-wrap gap-2` con los `AddonToggle` del
grupo, idéntico al `flex flex-wrap gap-2` que ya envuelve la lista plana
hoy.

**Robustez ante nuevos add-ons:** si en el futuro se agrega un `FeatureKey`
con `optIn: true` a `FEATURES` y no se lo agrega a `ADDON_GROUPS`, ese add-on
simplemente no se renderiza (queda huérfano, invisible en el panel) — es un
riesgo real de "se me olvidó agregarlo al grupo". Mitigación: un `console.warn`
en desarrollo (no en producción) si `addons.length` no coincide con la suma
de keys agrupadas, para que salte a la vista en local antes de deployar.

**No cambia:**
- `AddonToggle.tsx` (componente, estilos, confirm, prompt de fotos) — cero
  modificaciones.
- La sección MÓDULOS (`FeatureToggle`) — sigue como lista plana, no fue lo
  que el usuario pidió reordenar.
- El comportamiento de activar/desactivar, RLS, `toggleFeature` — nada de
  lógica cambia, es puramente el contenedor visual.

## Testing

- Sin lógica pura nueva relevante para un test unitario (es reorganización
  de JSX + una constante de datos). Se verifica con `npx tsc --noEmit` y
  una prueba manual: abrir una clínica expandida en `/superadmin` y
  confirmar que los 22 add-ons aparecen, cada uno en su grupo, sin
  duplicados ni faltantes, y que activar/desactivar sigue funcionando
  igual (incluida la confirmación agregada hoy y el prompt de fotos).

## Fuera de alcance

- Reordenar o agrupar la sección MÓDULOS.
- Cualquier cambio al comportamiento de `AddonToggle` (ya cubierto por el
  plan anterior, `docs/superpowers/plans/2026-07-20-defaults-confirmacion-addons-plan.md`).
- Persistir la agrupación en la base de datos o hacerla configurable — los
  grupos son un array estático en código, curado a mano.
