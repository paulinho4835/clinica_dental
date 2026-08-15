-- Todo trabajo clinico nuevo debe pertenecer a un item del plan del mismo
-- paciente y clinica. Las filas historicas sin plan se conservan y pueden
-- editar otros campos; la validacion corre al insertar o cambiar su vinculo.
create or replace function validate_doctor_work_plan_item()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.treatment_item_id is null then
    raise exception using
      errcode = '23514',
      message = 'El trabajo debe estar vinculado a un tratamiento del plan.';
  end if;

  if not exists (
    select 1
    from treatment_items ti
    join treatment_phases tph on tph.id = ti.phase_id
    join treatment_plans tp on tp.id = tph.plan_id
    where ti.id = new.treatment_item_id
      and ti.clinic_id = new.clinic_id
      and tp.clinic_id = new.clinic_id
      and tp.patient_id = new.patient_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'El tratamiento seleccionado no pertenece al paciente o a la clinica.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_doctor_work_plan_item on doctor_works;
create trigger trg_validate_doctor_work_plan_item
before insert or update of treatment_item_id, patient_id, clinic_id
on doctor_works
for each row execute function validate_doctor_work_plan_item();

notify pgrst, 'reload schema';
