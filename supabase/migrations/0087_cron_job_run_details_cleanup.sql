-- 0087_cron_job_run_details_cleanup.sql — pg_cron guarda un historial de CADA
-- ejecución de cada cron job en cron.job_run_details, y nunca se poda solo:
-- crece para siempre y ya fue el mayor consumidor de espacio en la base
-- (más que cualquier tabla de la app). No es dato clínico, es log de sistema,
-- así que se poda directo sin archivar.
select cron.schedule(
  'cron-job-run-details-cleanup',
  '0 3 * * *', -- todos los días a las 3am
  $$delete from cron.job_run_details where start_time < now() - interval '7 days'$$
);
