-- Staff & Access lists every employee the shop already has, and keeps up with them.
--
--   - A technician employed through the app (technician_employment, accepted) is on the owner's staff with
--     their account: as Supervisor when that is their team role, else Technician, with that role's access.
--     When the employment ends (or is rejected) they come off the staff list.
--   - A manual employee (manual_employees: someone kept by hand, usually with no Jageer account) is on it too,
--     linked by manual_employee_id, with no access (they cannot sign in). Their name, phone, title and hours
--     follow the manual record; made inactive = paused; deleted = gone. A manual employee already linked to
--     an account that is on the staff list is not listed twice.
--   - Everyone who is employed now is added once, here.
-- Only adds people who are missing: a role or access the owner has already set is never changed.
--
-- Run once in the Supabase SQL Editor (after 0122). Safe to run more than once.

alter table staff_access alter column member_id drop not null;
alter table staff_access add column if not exists manual_employee_id uuid references manual_employees(id) on delete cascade;
create unique index if not exists staff_access_owner_manual_idx on staff_access (owner_id, manual_employee_id) where manual_employee_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'staff_access_who_check') then
    alter table staff_access add constraint staff_access_who_check check (member_id is not null or manual_employee_id is not null);
  end if;
end;
$$;

-- What a role starts with (the same presets as lib/utils/staffAccess.ts).
create or replace function staff_role_preset(p_role text)
returns jsonb
language sql
immutable
as $$
  select case p_role
    when 'supervisor' then '{"dashboard":"view","requests":"edit","inventory":"view","quotation":"view"}'::jsonb
    else '{"requests":"view","inventory":"view"}'::jsonb
  end;
$$;

-- An app technician's employment -> the owner's staff list.
create or replace function sync_staff_from_employment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  prof profiles%rowtype;
  role_key text;
begin
  if new.status = 'accepted' then
    select * into prof from profiles where id = new.technician_id;
    role_key := case when coalesce(new.staff_role, 'technician') = 'supervisor' then 'supervisor' else 'technician' end;
    insert into staff_access (owner_id, member_id, member_name, member_phone, work_role, job_title, work_start_time, work_end_time, access, status)
    values (new.reseller_id, new.technician_id, coalesce(nullif(trim(prof.full_name), ''), 'Technician'), prof.phone, role_key,
            new.job_title, new.work_start_time, new.work_end_time, staff_role_preset(role_key), 'active')
    on conflict (owner_id, member_id) do nothing;
  elsif tg_op = 'UPDATE' and old.status = 'accepted' then
    delete from staff_access where owner_id = new.reseller_id and member_id = new.technician_id;
  end if;
  return new;
end;
$$;

drop trigger if exists technician_employment_sync_staff on technician_employment;
create trigger technician_employment_sync_staff
  after insert or update of status, staff_role on technician_employment
  for each row execute function sync_staff_from_employment();

-- A manual employee -> the owner's staff list (no access: they have no account to sign in with).
create or replace function sync_staff_from_manual_employee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Already on the list with their account: not twice.
  if new.linked_profile_id is not null
     and exists (select 1 from staff_access s where s.owner_id = new.owner_id and s.member_id = new.linked_profile_id) then
    delete from staff_access where owner_id = new.owner_id and manual_employee_id = new.id;
    return new;
  end if;
  insert into staff_access (owner_id, manual_employee_id, member_name, member_phone, work_role, job_title, work_start_time, work_end_time, access, status)
  values (new.owner_id, new.id, new.name, new.phone, 'technician', new.job_title, new.work_start_time, new.work_end_time, '{}'::jsonb,
          case when new.is_active then 'active' else 'paused' end)
  on conflict (owner_id, manual_employee_id) where manual_employee_id is not null
  do update set member_name = excluded.member_name, member_phone = excluded.member_phone, job_title = excluded.job_title,
                work_start_time = excluded.work_start_time, work_end_time = excluded.work_end_time, status = excluded.status,
                updated_at = now();
  return new;
end;
$$;

drop trigger if exists manual_employees_sync_staff on manual_employees;
create trigger manual_employees_sync_staff
  after insert or update on manual_employees
  for each row execute function sync_staff_from_manual_employee();

-- Everyone employed now, added once.
insert into staff_access (owner_id, member_id, member_name, member_phone, work_role, job_title, work_start_time, work_end_time, access, status)
select te.reseller_id, te.technician_id, coalesce(nullif(trim(p.full_name), ''), 'Technician'), p.phone,
       case when coalesce(te.staff_role, 'technician') = 'supervisor' then 'supervisor' else 'technician' end,
       te.job_title, te.work_start_time, te.work_end_time,
       staff_role_preset(case when coalesce(te.staff_role, 'technician') = 'supervisor' then 'supervisor' else 'technician' end),
       'active'
  from technician_employment te
  join profiles p on p.id = te.technician_id
 where te.status = 'accepted' and te.reseller_id is not null and te.reseller_id <> te.technician_id
on conflict (owner_id, member_id) do nothing;

insert into staff_access (owner_id, manual_employee_id, member_name, member_phone, work_role, job_title, work_start_time, work_end_time, access, status)
select m.owner_id, m.id, m.name, m.phone, 'technician', m.job_title, m.work_start_time, m.work_end_time, '{}'::jsonb,
       case when m.is_active then 'active' else 'paused' end
  from manual_employees m
 where not exists (select 1 from staff_access s where s.owner_id = m.owner_id and s.manual_employee_id = m.id)
   and not (m.linked_profile_id is not null
            and exists (select 1 from staff_access s where s.owner_id = m.owner_id and s.member_id = m.linked_profile_id));
