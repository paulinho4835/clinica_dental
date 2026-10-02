-- Búsqueda de pacientes en el servidor para el buscador de la Agenda.
--
-- Antes AgendaClient traía TODOS los pacientes de la clínica al navegador y
-- filtraba en JS. PostgREST corta cada respuesta en max_rows (1000), así que
-- en clínicas con más de 1000 pacientes los que quedaban después en orden
-- alfabético no se podían elegir al agendar, y la búsqueda distinguía acentos
-- ("jose" no encontraba a "José").
--
-- Ahora se busca sobre patients.search_text (nombre + CI, sin acentos y en
-- minúsculas, 0008): cada palabra escrita debe aparecer en el paciente, así
-- "maria gomez" encuentra a "María Elena Gómez". Puntos y comas se ignoran
-- ("4.835.946" o "Pérez, Juan").
--
-- Con p_doctor_id aplica la misma regla de visibilidad que
-- visible_patients_for_doctor (0100): el doctor ve a los pacientes que ya
-- atendió y a los que aún nadie atendió.
create or replace function public.search_agenda_patients(
  p_query text,
  p_limit integer default 8,
  p_dentist_name text default null,
  p_doctor_id uuid default null
)
returns table(id uuid, full_name text, national_id text)
language sql
stable
security invoker
set search_path = public
as $$
  with terms as (
    select array_remove(
      regexp_split_to_array(
        regexp_replace(lower(public.immutable_unaccent(coalesce(p_query, ''))), '[.,]', '', 'g'),
        '\s+'
      ),
      ''
    ) as words
  )
  select p.id, p.full_name, p.national_id
    from public.patients p, terms t
   where p.clinic_id = public.auth_clinic_id()
     and not exists (
       select 1
         from unnest(t.words) as word
        where strpos(p.search_text, word) = 0
     )
     and (
       p_doctor_id is null
       or exists (
         select 1 from public.appointments a
          where a.patient_id = p.id and a.dentist_name = p_dentist_name
       )
       or exists (
         select 1 from public.doctor_works w
          where w.patient_id = p.id and w.doctor_id = p_doctor_id
       )
       or (
         not exists (select 1 from public.appointments a2 where a2.patient_id = p.id)
         and not exists (select 1 from public.doctor_works w2 where w2.patient_id = p.id)
       )
     )
   order by p.full_name
   limit least(greatest(coalesce(p_limit, 8), 1), 50);
$$;

revoke all on function public.search_agenda_patients(text, integer, text, uuid)
  from public, anon;
grant execute on function public.search_agenda_patients(text, integer, text, uuid)
  to authenticated;
