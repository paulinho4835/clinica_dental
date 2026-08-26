-- Corrige el RAISE de 0120: no mezclar texto de formato con la opción
-- MESSAGE, porque PostgreSQL lo interpreta como mensaje duplicado.
create or replace function public.validate_appointment_finance_values()
returns trigger
language plpgsql
as $$
begin
  if coalesce(new.deposit, 0) > 0 and coalesce(new.consult_price, 0) <= 0 then
    raise exception using
      errcode = '22023',
      message = 'La cotización es obligatoria cuando registras un adelanto.';
  end if;
  if coalesce(new.deposit, 0) > coalesce(new.consult_price, 0) then
    raise exception using
      errcode = '22023',
      message = 'El adelanto no puede ser mayor que la cotización.';
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
