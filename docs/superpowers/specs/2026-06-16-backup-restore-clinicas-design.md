# Backup y restauración de clínicas (Superadmin) — Diseño

**Fecha:** 2026-06-16
**Estado:** Aprobado, listo para implementar

## Objetivo
Permitir al superadmin **descargar** un backup completo de una clínica (archivo `.json`)
y **restaurar** ese archivo creando una **clínica nueva** (clon), sin tocar nunca los
datos de la clínica original. "Por las dudas": respaldo manual ante errores o pérdidas.

## Decisiones tomadas
- **Restaurar = clonar a clínica nueva** (nunca sobrescribe; cero riesgo de pérdida).
- **Cuentas de login:** se reusan las existentes. El backup guarda datos del personal
  para referencia, pero el restore NO recrea cuentas `auth.users`/`profiles`. Los datos
  restaurados referencian las cuentas que aún existan; si una cuenta fue borrada, el
  campo de autor queda en null (salvo el caso borde, ver abajo).
- **Almacenamiento:** descarga directa de `.json`. Sin bucket de Storage ni tabla de
  registro. La custodia del archivo queda del lado del superadmin.
- **Enfoque:** genérico guiado por el esquema (descubre todas las tablas con `clinic_id`
  automáticamente; nunca olvida una tabla nueva).
- **Caso borde:** abortar con mensaje claro (sin pérdida silenciosa).

## Modelo de datos relevante
- ~40 tablas con `clinic_id`; todas con PK = `id` (uuid único).
- 109 FKs en total; sin FKs auto-referenciales; sin ciclos → es un DAG (orden topológico
  válido para insertar).
- Columnas generadas a excluir en el insert: `doctor_works.commission_amount`,
  `doctor_works.lab_commission_amount`, `patients.search_text`.
- `profiles.id` → FK a `auth.users(id)`. 25 columnas referencian `profiles`.
- 4 FKs a `profiles` son **NOT NULL**: `dentist_schedules.dentist_id`,
  `commissions.dentist_id`, `doctor_works.doctor_id`, `staff_payments.employee_id`.

## Componentes

### 1. Migración SQL (un archivo: `0050_clinic_backup.sql`)
Tres funciones `security definer`, ejecutables solo por `service_role` (revocar a
`anon`/`authenticated`):

- `backup_clinic(p_clinic_id uuid) → jsonb`
  Recorre dinámicamente todas las tablas base de `public` con columna `clinic_id`,
  agrega sus filas (`jsonb_agg`), e incluye la fila de `clinics`. Devuelve:
  `{ version, generated_at, source_clinic_id, clinic: {...}, tables: { <tabla>: [...] } }`.

- `clinic_backup_schema() → jsonb`
  Por cada tabla con `clinic_id`: nombre de columnas, cuáles son generadas, y aristas
  FK `{ columna, tabla_padre }`. Lo consume TypeScript para remapear y ordenar.

- `restore_clinic_apply(p_new_clinic jsonb, p_ordered jsonb) → uuid`
  **Atómico** (una transacción). Inserta la fila de la clínica nueva, luego inserta
  cada tabla en el orden recibido (ya remapeada por TS). Si algo falla → rollback total
  (no quedan clones a medias). Devuelve el id de la clínica nueva.

### 2. Route handlers (App Router; archivos, no server actions)
- `GET /api/superadmin/backup?clinicId=<id>`
  Guard `isPlatformAdmin()`. Llama `backup_clinic`. Responde el JSON con
  `Content-Disposition: attachment; filename="clinica-<slug>-<fecha>.json"`.
- `POST /api/superadmin/restore`
  Guard `isPlatformAdmin()`. Recibe el `.json` subido (+ nombre opcional). Ejecuta el
  remapeo (ver flujo) y llama `restore_clinic_apply`. Devuelve `{ ok, clinicId, name }`.

### 3. UI en Superadmin
En cada tarjeta de clínica de `components/superadmin/ClinicList.tsx`:
- Botón **"Descargar backup"** → navega/descarga desde el route handler.
- Zona **"Restaurar"** → input de archivo `.json` → POST al route handler → al terminar,
  refresca la lista (el clon aparece como clínica nueva).

## Flujo de backup
Superadmin → "Descargar backup" → `backup_clinic(clinicId)` → archivo
`clinica-<nombre>-<fecha>.json` con todas las filas + la fila de la clínica.

## Flujo de restauración
1. Subir `.json` → guard superadmin → validar `version` y estructura.
2. `clinic_backup_schema()` para metadata.
3. Crear objeto de **clínica nueva**: copia `plan`, `features`, `settings`, `max_users`;
   `name = "<nombre> (restaurada <fecha>)"`; `id` nuevo (uuid).
4. **Mapas de id** por tabla: `viejo_id → uuid nuevo`.
5. **Transformar filas**: id nuevo; `clinic_id` = clon; reescribir FKs:
   - FK a tabla clonada → vía su mapa de ids.
   - FK a `clinics` → id del clon.
   - FK a `profiles` → conservar id si la cuenta existe; si no, null.
   - Quitar columnas generadas.
6. **Orden topológico** de tablas (Kahn sobre las aristas FK) → `restore_clinic_apply`
   atómico.
7. Responder éxito con nombre/id del clon.

## Caso borde (FKs NOT NULL a `profiles`)
Antes de insertar, validar las 4 columnas NOT NULL que referencian `profiles`. Si alguna
fila apunta a una cuenta inexistente, **abortar** y devolver un mensaje claro indicando
tabla(s) y cantidad de filas afectadas. Sin pérdida silenciosa. Raro en la práctica
(las cuentas normalmente siguen existiendo).

## Seguridad
- Todo detrás de `isPlatformAdmin()`.
- Funciones SQL `security definer` con `execute` revocado a `anon`/`authenticated`;
  solo `service_role` (usado desde los route handlers).
- El backup contiene datos clínicos sensibles → el archivo descargado es responsabilidad
  del superadmin (se documenta).

## Fuera de alcance (YAGNI)
- Recrear cuentas de login.
- Sobrescribir clínicas existentes.
- Almacenamiento en Storage / historial de backups.
- Backups automáticos programados.

## Riesgos / notas
- Tamaño del payload de restore (todo el dataset como un jsonb en una llamada RPC):
  aceptable para clínicas dentales (pocos MB).
- Límites de tamaño de función serverless en Vercel: monitorear si una clínica muy
  grande supera límites de respuesta/cuerpo.
- Versionado del backup (`version`): si el esquema cambia mucho, validar compatibilidad
  al restaurar.
