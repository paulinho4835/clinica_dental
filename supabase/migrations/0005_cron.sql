-- ============================================================================
-- 0005_cron.sql — Jobs programados que invocan las Edge Functions
-- Recordatorios cada 15 min; alertas de stock/caducidad cada noche.
-- Defensivo: si pg_net o las funciones de cron no están, no rompe el reset.
-- ============================================================================
do $$
declare
  v_base text := 'http://kong:8000/functions/v1';  -- URL interna en local; ajustar en prod
begin
  -- pg_net para llamadas HTTP salientes (puede no existir en todos los entornos).
  begin
    create extension if not exists pg_net;
  exception when others then
    raise notice 'pg_net no disponible; cron de edge functions omitido';
    return;
  end;

  -- Recordatorios de cita: cada 15 minutos.
  perform cron.schedule(
    'send-appointment-reminders',
    '*/15 * * * *',
    format($cmd$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json')
      );
    $cmd$, v_base || '/reminders')
  );

  -- Alertas de stock/caducidad: todos los días 02:00.
  perform cron.schedule(
    'nightly-stock-alerts',
    '0 2 * * *',
    format($cmd$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json')
      );
    $cmd$, v_base || '/stock-alerts')
  );
exception when others then
  raise notice 'Programación de cron omitida: %', sqlerrm;
end $$;
