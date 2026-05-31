-- ============================================================================
-- 0017_dashboard_tz_bolivia.sql
-- Corrige las funciones de analítica para agrupar en hora local de Bolivia
-- (UTC-4 / America/La_Paz) en lugar de UTC. Sin este ajuste, un pago hecho
-- a las 21:00 BOT (01:00 UTC del día siguiente) cae en la fecha incorrecta.
-- ============================================================================

create or replace function dash_revenue_by_day(
  p_from timestamptz,
  p_to   timestamptz
)
returns table(day date, total numeric)
language sql
stable
security invoker
as $$
  select
    (received_at at time zone 'America/La_Paz')::date as day,
    coalesce(sum(amount), 0)                          as total
  from payments
  where kind = 'payment'
    and received_at >= p_from
    and received_at <  p_to
  group by 1
  order by 1;
$$;

create or replace function dash_revenue_by_month(
  p_year int
)
returns table(month int, total numeric, patients bigint)
language sql
stable
security invoker
as $$
  select
    extract(month from (received_at at time zone 'America/La_Paz'))::int as month,
    coalesce(sum(amount), 0)                                              as total,
    count(distinct patient_id)::bigint                                    as patients
  from payments
  where kind = 'payment'
    and extract(year from (received_at at time zone 'America/La_Paz')) = p_year
  group by 1
  order by 1;
$$;

create or replace function dash_top_treatments(
  p_from  timestamptz,
  p_to    timestamptz,
  p_limit int default 8
)
returns table(label text, cnt bigint, revenue numeric)
language sql
stable
security invoker
as $$
  select
    coalesce(pc.name, ti.custom_name, 'Sin nombre') as label,
    count(*)::bigint                                 as cnt,
    coalesce(sum(ti.price), 0)                       as revenue
  from treatment_items ti
  left join procedure_catalog pc on pc.id = ti.procedure_id
  where ti.status = 'done'
    and ti.done_at >= p_from
    and ti.done_at <  p_to
  group by 1
  order by cnt desc, revenue desc
  limit p_limit;
$$;
