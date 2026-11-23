-- A job can optionally point back at an earlier completed job it's really a
-- return trip for - picked by hand when the job is created (see
-- request-details.tsx), never guessed. Lets "repeat visits" be counted
-- accurately on the technician dashboard instead of inferred from timing.
-- Additive only. Safe to run once against the existing schema.

alter table service_requests
  add column if not exists repeat_of_request_id uuid references service_requests(id);
