# Campañas de WhatsApp — Diseño

Fecha: 2026-07-09

## Contexto

La clínica quiere poder avisar a todos sus pacientes por WhatsApp cuando hay una
promoción o campaña (ej. "limpieza dental con descuento"), sin depender de
Baileys (no está en uso — el envío real es manual vía WhatsApp Web). Hoy existe
`/wa-masivo`, pero esa página está acoplada a Baileys (activar su addon
`wa_masivo` enciende Baileys automáticamente, ver `lib/features.ts:137`) y solo
sirve para recordatorios del día. Se necesita un espacio separado.

## Alcance

Una sección nueva **"Campañas"** donde el usuario:
1. Crea una campaña (nombre + mensaje de texto libre con placeholder `{nombre}`).
2. Ve la lista completa de pacientes de la clínica con teléfono registrado.
3. Por cada paciente, hace clic en **Enviar** → se abre `wa.me` con el chat
   del paciente y el mensaje prellenado (mismo patrón que
   `RequestAnamnesisModal`), y el envío queda registrado en la base de datos.
4. El botón cambia a **Enviado ✓** de inmediato y persiste aunque cierre y
   vuelva a abrir la página (o la abra otro día).
5. Puede deshacer un envío marcado por error.

Fuera de alcance: envío automático/masivo real (seguiría siendo manual, un
clic por paciente), integración con Baileys, plantillas reutilizables,
segmentación de pacientes (inactivos, por fecha, etc.) — todo eso queda para
una iteración futura si se necesita.

## Datos

Migración `0079_campaigns.sql`:

```sql
create table campaigns (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics(id),
  name text not null,
  message text not null, -- puede contener el placeholder literal "{nombre}"
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns(id) on delete cascade,
  patient_id uuid not null references patients(id),
  sent_by uuid references profiles(id),
  sent_at timestamptz not null default now(),
  unique (campaign_id, patient_id)
);
```

RLS: mismo patrón que el resto de tablas por clínica — `campaigns` filtra por
`clinic_id = current clinic` (vía profile); `campaign_sends` filtra por join a
`campaigns.clinic_id`. Roles con acceso: admin, recepcionista, colega (mismos
roles que hoy tienen `wa_masivo` en `lib/rbac.ts`).

## Feature flag

Nueva key `campanas` en `lib/features.ts` (opt-in, apagada por defecto):

```ts
{ key: "campanas", label: "Campañas de WhatsApp", href: "/campanas", optIn: true }
```

No toca `normalizeFeatures()` — no deriva `whatsapp` (Baileys) como hace
`wa_masivo`, porque el envío es manual por wa.me, no por el bot.

Se agrega a `ROLE_NAV` en `lib/rbac.ts` para admin, recepcionista y colega,
igual que `wa_masivo`.

## Rutas y componentes

- `app/(dashboard)/campanas/page.tsx` — server component, `requireNavAccess("campanas")`,
  lista de campañas de la clínica (nombre, fecha, progreso "X de Y enviados") +
  botón "Nueva campaña".
- `app/(dashboard)/campanas/[id]/page.tsx` — detalle de una campaña: mensaje,
  buscador de pacientes, tabla con todos los pacientes con teléfono y su
  estado (pendiente/enviado). Pacientes sin teléfono se listan aparte con un
  aviso, sin botón de enviar.
- `app/(dashboard)/campanas/actions.ts` — server actions:
  - `createCampaign(name, message)` → inserta en `campaigns`.
  - `listCampaigns()` / `getCampaign(id)` con conteo de enviados.
  - `listPatientsForCampaign(campaignId)` → pacientes de la clínica con
    teléfono no nulo, join a `campaign_sends` para saber el estado.
  - `markSent(campaignId, patientId)` → insert en `campaign_sends` (upsert
    idempotente, ignora conflicto si ya existía).
  - `unmarkSent(campaignId, patientId)` → delete.
- `components/campaigns/CampaignSendRow.tsx` — client component: arma el
  `wa.me` link con `normalizePhone` (reutiliza `lib/phone-utils.ts`) y el
  mensaje con `{nombre}` reemplazado por el nombre real del paciente; al hacer
  clic, abre el link en pestaña nueva y llama a `markSent` de inmediato
  (optimista: el botón cambia a "Enviado ✓" sin esperar; revierte si la
  action falla). Un ícono pequeño de deshacer llama a `unmarkSent`.

## Mensaje y placeholder

`{nombre}` se reemplaza por el primer nombre del paciente (mismo criterio de
`getInitials`/nombre corto ya usado en otras partes de la UI) antes de
codificar la URL de `wa.me`. Si el mensaje no contiene `{nombre}`, se envía tal
cual.

## Errores y bordes

- Paciente sin teléfono válido tras `normalizePhone`: no se muestra botón de
  enviar, aparece en la sección "sin teléfono" de la página.
- Dos pestañas abiertas marcando el mismo paciente: el `unique` constraint en
  `campaign_sends` protege contra duplicados; un segundo intento de `markSent`
  no falla (upsert), solo no crea fila nueva.
- Campaña sin pacientes con teléfono: se muestra estado vacío con el aviso
  correspondiente.

## Testing

- Tests de `lib/phone-utils.ts` ya existen y se reutilizan sin cambios.
- Tests nuevos para las server actions de campañas (casos: crear campaña,
  marcar/desmarcar envío, idempotencia del upsert) si el proyecto ya tiene
  cobertura equivalente para acciones similares (revisar `tests/` durante la
  implementación).
