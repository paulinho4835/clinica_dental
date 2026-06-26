# Deploy de migraciones a producción

> **Regla de oro:** si un commit agrega un archivo en `supabase/migrations/`,
> **la migración debe aplicarse a producción en el mismo deploy.** El push a
> `main` despliega el código en Vercel, pero **NO** toca la base de datos. Si el
> código nuevo usa una columna/tabla que aún no existe en prod, la app rompe con
> errores tipo:
>
> ```
> Could not find the 'X' column of 'Y' in the schema cache
> ```

## Contexto de este proyecto

- **Local:** las migraciones se aplican con el CLI: `supabase migration up --local`.
- **Producción (`lurwdrerpbjqnsamlajk`):** hoy se aplican **a mano por el SQL
  Editor del dashboard**, porque el CLI está logueado con **otra cuenta de
  Supabase** (la cuenta activa solo ve los proyectos *Retenes* y *RiderCV*, no
  el de la clínica). Por eso `supabase db push` da 403 contra prod.

## Opción A (recomendada a futuro): `db push` con la cuenta correcta

Una sola vez, inicia sesión con la cuenta **dueña del proyecto de la clínica**:

```bash
npx supabase login                      # abre el navegador; usa la cuenta correcta
npx supabase link --project-ref lurwdrerpbjqnsamlajk
# te pedirá la DB password (Dashboard → Settings → Database → Connection string)
```

Verifica que ya ve el proyecto y el estado de migraciones:

```bash
npx supabase migration list             # local vs remoto, lado a lado
```

A partir de ahí, **aplicar lo pendiente a prod es un solo comando**:

```bash
npm run db:push                         # = supabase db push
```

Cuando esto funcione, este es el flujo de release:
1. `npm run db:push` (aplica migraciones a prod)
2. push a `main` (despliega el código)

## Opción B (la que funciona hoy): consolidado para el dashboard

Mientras el CLI no tenga acceso a prod, genera un único SQL idempotente y pégalo
en **Dashboard → SQL Editor**.

1. Averigua qué hay aplicado en prod (corre esto en el SQL Editor):

   ```sql
   select version from supabase_migrations.schema_migrations order by version;
   ```

2. Genera el consolidado **desde la primera que NO aparezca** en esa lista:

   ```bash
   npm run db:consolidate -- 0060        # incluye 0060 en adelante
   ```

3. Abre `supabase/_consolidado.sql`, copia todo y pégalo en el SQL Editor.
   Incluye al final `notify pgrst, 'reload schema';` (clave para limpiar el
   "schema cache" y que desaparezca el error de columna no encontrada).

> `supabase/_consolidado.sql` está en `.gitignore`: es un artefacto generado,
> no código fuente.

## Convención para que esto no vuelva a romper

Las migraciones deben ser **idempotentes** siempre que se pueda, para que el
consolidado se pueda re-correr sin miedo:

- Tablas: `create table if not exists …`
- Columnas: `alter table … add column if not exists …`
- Índices: `create index if not exists …`
- Policies: `drop policy if exists …` antes de `create policy …`
- Cerrar con `notify pgrst, 'reload schema';`
