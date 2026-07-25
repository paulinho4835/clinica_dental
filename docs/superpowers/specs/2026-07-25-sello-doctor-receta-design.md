# Sello del doctor en recetas

## Contexto

Las recetas médicas solo se validan legalmente cuando tienen sello y firma
del doctor. La firma digital ya existe (`profiles.signature`, dibujada a
mano en un `SignaturePad`, autocompletada en la receta impresa). Falta el
sello: cada doctor, colega o admin debe poder subir una foto de su sello
físico, y esa imagen debe aparecer **solo en la receta médica emitida**
(ningún otro documento impreso la usa).

## Modelo de datos

Migración nueva `supabase/migrations/0104_profile_stamp.sql`:

```sql
-- Sello digital del doctor (foto, data URL comprimida). Se autocompleta en
-- recetas médicas junto a la firma, usando prescriptions.doctor_id.
alter table profiles add column if not exists stamp text;
```

Mismo patrón que `0094_profile_signature.sql`: columna `text` en `profiles`,
data URL base64, sin dependencia de R2. Se eligió este enfoque (en vez de
subir el archivo a R2 como las fotos de paciente) porque:
- Consistencia con la firma, que ya vive en `profiles` como data URL.
- No todas las clínicas tienen R2 configurado; el sello es un dato personal
  del doctor, no debería depender de un addon de almacenamiento de fotos.

## Subida de imagen

Nuevo componente `components/ajustes/StampUploadPanel.tsx`, mismo look &
feel que `MySignaturePanel.tsx` pero con `<input type="file" accept="image/*">`
en vez de un `SignaturePad` (es una foto real de un sello físico, no un
trazo dibujado en pantalla).

Flujo:
1. El usuario selecciona una foto del sello (cámara del celu o archivo).
2. Se comprime client-side con `browser-image-compression` (mismo paquete
   que ya usa `PhotosPanel.tsx`) — target `maxSizeMB: 0.3`,
   `maxWidthOrHeight: 500`. Un sello no necesita más resolución que eso.
3. Se convierte a data URL y se guarda vía server action.
4. Preview del sello guardado + botones "Reemplazar" / "Quitar", igual que
   el panel de firma.

Nueva server action `saveMyStamp(dataUrl: string)` en
`app/(dashboard)/ajustes/stamp-actions.ts`, calcada de `saveMySignature`:
mismo chequeo de sesión, mismo permiso, mismo `update` sobre `profiles`,
mismo `revalidatePath("/ajustes")`.

## Permisos

Gate: `can(profile.role, "clinical:write")` — el mismo permiso que ya
controla la visibilidad de todo el bloque de firma en Ajustes
(`canSignPrescriptions` en `app/(dashboard)/ajustes/page.tsx`). El panel de
sello se renderiza dentro de esa misma sección, justo al lado del de firma.

Nota conocida: `clinical:write` también lo tiene `recepcionista` (matriz de
roles en `lib/rbac.ts`), así que técnicamente también vería este panel —
es una imprecisión que ya existe hoy en el panel de firma, no se introduce
nueva con este cambio, y corregirla queda fuera de este alcance.

## Receta impresa

Archivo: `app/(print)/pacientes/[id]/receta/[recetaId]/page.tsx`.

- El `select` del doctor pasa de `full_name, signature` a
  `full_name, signature, stamp`.
- Debajo de la tabla de medicamentos, en vez del único bloque centrado de
  firma actual, dos bloques lado a lado: firma a la izquierda (sin cambios),
  sello a la derecha — mismo tamaño/estilo visual (`w-64`, texto centrado
  bajo la imagen: "Sello").
- Si `doctor.stamp` es `null`, el bloque de sello simplemente no se
  renderiza — mismo comportamiento que ya tiene la firma cuando falta.
- No cambia ningún otro documento impreso (presupuesto de tratamiento,
  expediente, etc.) — el sello es exclusivo de la receta.

## Fuera de alcance

- No se toca el permiso `clinical:write` de `recepcionista` (quirk
  preexistente, no relacionado a este cambio).
- No se sube el sello a R2 ni se agrega un contador/quota como el de fotos
  de paciente.
- No se agrega placeholder/recuadro vacío cuando falta el sello.
