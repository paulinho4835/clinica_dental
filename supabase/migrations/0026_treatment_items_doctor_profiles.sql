-- treatment_items.doctor_id apuntaba a doctors(id); reapuntamos a profiles(id).
alter table treatment_items
  drop constraint if exists treatment_items_doctor_id_fkey;

alter table treatment_items
  add constraint treatment_items_doctor_id_fkey
  foreign key (doctor_id) references profiles(id) on delete set null;
