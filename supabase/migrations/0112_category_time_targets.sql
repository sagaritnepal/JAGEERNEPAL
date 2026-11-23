-- A target time per job category, set by the reseller (Team > Targets) so a
-- completed job's actual time can be read against something - "4h 10m" means
-- nothing on its own without a goal to compare it to. Technicians read their
-- employer's targets (not their own row) to show "on target" / "over target"
-- on their own dashboard.
-- Additive only. Safe to run once against the existing schema.

create table if not exists reseller_category_targets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id),
  category_id uuid not null references service_categories(id),
  target_minutes integer not null check (target_minutes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists reseller_category_targets_owner_category_idx
  on reseller_category_targets (owner_id, category_id);

alter table reseller_category_targets enable row level security;

create policy reseller_category_targets_all_owner on reseller_category_targets
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy reseller_category_targets_admin_all on reseller_category_targets
  for all using (is_admin()) with check (is_admin());

-- An employee reads their employer's targets (same join shape as
-- service_requests_select_open_team in migration 0076).
create policy reseller_category_targets_select_employee on reseller_category_targets
  for select using (
    exists (
      select 1 from technician_employment te
      where te.technician_id = auth.uid()
        and te.reseller_id = reseller_category_targets.owner_id
        and te.status = 'accepted'
    )
  );
