-- "Mark as done" (0103) let a reseller complete a job that was never run through the app's technician
-- flow - a walk-in, or an employee who does not use the app - without saying who actually did the work.
-- A job could sit "Completed" forever next to "Nobody yet", with no record of who to credit or ask.
--
-- From here, mark_job_done() takes the name of whoever did it when the job has no app technician
-- (p_technician_name) and refuses to complete the job without one. A job that already has a technician
-- assigned in the app (req.technician_id) does not need this - that person is already on record.
--
-- Run once, in the Supabase SQL Editor. Safe to run more than once.

alter table service_requests add column if not exists completed_by_name text;

create or replace function mark_job_done(p_request_id uuid, p_technician_name text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  req service_requests%rowtype;
  card_id uuid;
  customer uuid;
  tech_name text := nullif(trim(p_technician_name), '');
begin
  select * into req from service_requests where id = p_request_id for update;
  if not found then
    raise exception 'Job not found';
  end if;

  -- coalesce: a job with no reseller makes the comparison NULL, which must read as "no".
  if not (
    coalesce(req.reseller_id = auth.uid(), false)
    or (req.reseller_id is not null and is_supervisor_for(req.reseller_id))
    or is_admin()
  ) then
    raise exception 'Only the reseller who owns this job can mark it as done';
  end if;

  if req.status = 'resolved' then
    raise exception 'This job is already complete';
  end if;
  if req.status = 'cancelled' then
    raise exception 'This job was cancelled, so it cannot be marked as done';
  end if;
  if req.status not in ('pending', 'approved', 'assigned', 'in_progress')
     or (req.status = 'pending' and req.origin <> 'reseller') then
    raise exception 'This request is still waiting for the customer''s answer, so it cannot be marked as done yet';
  end if;

  if req.technician_id is null and tech_name is null then
    raise exception 'Enter who did this job before marking it as done';
  end if;

  -- The job card keeps when the work ended (and who it belonged to).
  select id into card_id from job_cards where service_request_id = p_request_id order by created_at limit 1;
  if card_id is not null then
    update job_cards set completed_at = coalesce(completed_at, now()) where id = card_id;
  else
    insert into job_cards (service_request_id, technician_id, completed_at)
    values (p_request_id, coalesce(req.technician_id, req.reseller_id), now());
  end if;

  update service_requests
  set status = 'resolved', completed_by_name = coalesce(tech_name, completed_by_name)
  where id = p_request_id;

  -- The customer is told by the notification trigger when the job was in progress; for a job that
  -- never reached that stage it is told here.
  customer := case when req.origin = 'app' and req.client_id is distinct from req.reseller_id then req.client_id end;
  if customer is not null and req.status <> 'in_progress' then
    perform add_notification(customer, 'job_completed', p_request_id, auth.uid(),
      'Your job is complete', coalesce(req.issue_type, 'a job'));
  end if;
end;
$$;

revoke all on function mark_job_done(uuid, text) from public;
grant execute on function mark_job_done(uuid, text) to authenticated;

-- The old one-argument signature is gone from the client, but drop it explicitly so no stale
-- overload is left callable.
drop function if exists mark_job_done(uuid);

-- Make the API pick up the new function at once (Supabase usually does this by itself).
notify pgrst, 'reload schema';
