-- Staff & Access, stage 1: who works in the shop, their work role, and which parts of the portal each may open.
--
-- The owner (a reseller) keeps one row per staff member: their work role (Manager, Accountant, Sales staff,
-- Technician, Supervisor), job title, work hours, and an access level per portal section - 'none', 'view' or
-- 'edit' - in `access` ({"requests":"edit","daybook":"view",...}; a section not named is 'none').
--
-- Stage 1 only RECORDS this: no other table's access rules change, so nobody can see anything they could not
-- see before. Stages 2 and 3 will let an active staff member open the sections granted here.
--
-- The member's name and phone are copied in when they are added (the owner cannot read other people's
-- profiles), and find_account_by_phone() looks one account up by its exact phone number to add it.
--
-- Run once in the Supabase SQL Editor. Safe to run more than once.

create table if not exists staff_access (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  member_id uuid not null references profiles(id) on delete cascade,
  member_name text not null default '',
  member_phone text,
  work_role text not null default 'sales',
  job_title text,
  work_start_time time,
  work_end_time time,
  access jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, member_id),
  constraint staff_access_role_check check (work_role in ('manager', 'accountant', 'sales', 'technician', 'supervisor')),
  constraint staff_access_status_check check (status in ('active', 'paused')),
  constraint staff_access_not_self check (owner_id <> member_id)
);

create index if not exists staff_access_member_idx on staff_access (member_id);

alter table staff_access enable row level security;

-- The owner manages their staff; a member can read their own row (what they have been given).
drop policy if exists staff_access_owner_all on staff_access;
create policy staff_access_owner_all on staff_access
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists staff_access_member_read on staff_access;
create policy staff_access_member_read on staff_access
  for select using (member_id = auth.uid());

drop policy if exists staff_access_admin_all on staff_access;
create policy staff_access_admin_all on staff_access
  for all using (is_admin()) with check (is_admin());

-- An account by its exact phone number, to add as staff: just its id, name, phone and role.
create or replace function find_account_by_phone(p_phone text)
returns table (id uuid, full_name text, phone text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.full_name, p.phone, p.role::text
    from profiles p
   where length(trim(coalesce(p_phone, ''))) >= 10
     and p.phone = trim(p_phone)
     and p.id <> auth.uid()
   limit 1;
$$;

revoke all on function find_account_by_phone(text) from public, anon;
grant execute on function find_account_by_phone(text) to authenticated;

notify pgrst, 'reload schema';
