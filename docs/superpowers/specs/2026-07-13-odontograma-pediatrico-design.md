# Diseño: Addon "Odontograma Pediátrico"

**Fecha:** 2026-07-13
**Estado:** Aprobado por Paulo

## Contexto

El sistema ya tiene un odontograma de adultos (dentición permanente, FDI 11-48)
en `lib/odontogram/types.ts` + `components/odontogram/OdontogramEditor.tsx`,
usado en la ficha del paciente (`app/(dashboard)/pacientes/[id]/page.tsx`).
Los odontólogos pediátricos necesitan registrar el estado de la dentición
temporal (dientes de leche), que usa una numeración FDI distinta (51-85) y
hoy no tiene ningún componente ni tabla propia.

Se decidió construirlo como **addon opt-in nuevo**, siguiendo exactamente el
patrón ya usado para `periodontograma` (el addon más reciente con esta forma):
flag en `clinics.features`, pestaña adicional en la ficha del paciente,
tablas propias para no mezclar datos/auditoría con el odontograma de adultos.

## Decisiones (confirmadas con el usuario)

1. **Activación**: pestaña extra en la ficha del paciente, visible para
   *cualquier* paciente cuando el addon está activo en la clínica (el doctor
   elige qué pestaña usar según el caso — igual que hoy conviven Odontograma
   y Periodontograma). Sin auto-detección por edad en esta primera versión.
2. **Dentición**: solo temporal, 20 dientes (FDI 51-85, 5 por cuadrante:
   2do molar, 1er molar, canino, lateral, central). No se soporta dentición
   mixta (permanentes ya erupcionados) en esta versión — decisión YAGNI,
   ampliable después si se pide.
3. **Paleta de condiciones**: exactamente la misma que el odontograma de
   adultos (`Tool` union en `OdontogramEditor.tsx`: caries, caries
   recidivante, resina, amalgama, sellante, fractura, desgaste, corona,
   endodoncia, perno, implante, prótesis, extracción indicada, ausente,
   movilidad, en erupción, marcas rojo/azul, borrar). Sin adaptaciones.

## Arquitectura

### 1. Flag de addon (`lib/features.ts`)

Nueva key `"odontograma_pediatrico"` en el union `FeatureKey` y una entrada
en `FEATURES` con `optIn: true` (mismo patrón que `periodontograma`). No se
agrega a `MODULE_PRESETS` — los addons se activan individualmente en
Superadmin vía el `AddonToggle` ya existente, sin cambios en ese componente.

### 2. Datos (migración `0086_odontograma_pediatrico.sql`)

Tablas propias (mismo shape que las de adultos, para reusar toda la lógica
de guardado/diff sin modificarla):

```sql
odontograms_pediatric (
  id, clinic_id, patient_id unique, teeth jsonb, updated_at, ...
)

odontogram_pediatric_events (
  id, clinic_id, patient_id, tooth_fdi, surface,
  prev_state, new_state, actor_id, created_at
)
```

RLS igual que las tablas equivalentes de adultos (aislamiento por
`clinic_id`, mismo patrón ya usado en todo el proyecto).

### 3. Tipos (`lib/odontogram/pediatricTypes.ts`, nuevo archivo)

```ts
export const PEDIATRIC_QUADRANTS: string[][] = [
  ["55", "54", "53", "52", "51"],
  ["61", "62", "63", "64", "65"],
  ["85", "84", "83", "82", "81"],
  ["71", "72", "73", "74", "75"],
];
```

Reutiliza sin cambios de `lib/odontogram/types.ts`: `ToothState`, `Surface`,
`isAnterior()`, `toothType()` — estas funciones ya derivan la forma del
diente a partir del 2º dígito FDI (1-2 incisivo, 3 canino, 4-5 molar
temporal), agnósticas a si el 1er dígito es de cuadrante permanente (1-4) o
temporal (5-8). No requieren modificación.

### 4. Componentes

- `components/odontogram/PediatricOdontogramEditor.tsx`: copia adaptada de
  `OdontogramEditor.tsx`, iterando `PEDIATRIC_QUADRANTS` en vez de
  `QUADRANTS`, mismo `Tool` union, misma UI de paleta. Reutiliza
  `components/odontogram/Tooth.tsx` sin cambios (solo depende de FDI +
  surfaces, no de si es diente temporal o permanente).
- `app/(dashboard)/pacientes/pediatric-odontogram-actions.ts`: server
  actions `getPediatricOdontogram(patientId)` / `savePediatricOdontogram(...)`,
  mismo guard de roles (`admin, odontologo_general, especialista, colega`)
  y mismo chequeo opcional de `bloqueo_horario` que ya existe en
  `odontogram-actions.ts`.

### 5. UI de la ficha del paciente

En `app/(dashboard)/pacientes/[id]/page.tsx`, junto a las pestañas
"Odontograma" y "Periodontograma" (ambas condicionadas por su addon), se
agrega una pestaña "Odontograma Pediátrico" condicionada por
`features.odontograma_pediatrico`.

## Fuera de alcance (esta versión)

- Dentición mixta / seguimiento de recambio dental.
- Auto-selección de pestaña por edad del paciente.
- Paleta de condiciones adaptada/reducida.
- Migración de datos entre odontograma de adultos y pediátrico (son
  independientes; un mismo paciente puede tener ambos si corresponde).

## Testing

- Tests unitarios de `isAnterior()`/`toothType()` ya cubren la lógica
  compartida; agregar un caso con FDI temporal (ej. `"55"`, `"71"`) para
  confirmar que la derivación de forma funciona igual.
- Prueba manual: activar addon en Superadmin, abrir ficha de un paciente,
  marcar condiciones en varios dientes temporales, guardar, recargar y
  verificar persistencia + fila en `odontogram_pediatric_events`.
