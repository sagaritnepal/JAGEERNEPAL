-- The reseller can say what a job is for when they create or edit it: the product(s) the technician
-- will fit or supply, and the service charge for the visit - so the technician does not have to work
-- out or guess the product when completing it (see request-details.tsx).
--   job_products   : [{ "name": "EZVIZ H7C Dual 2K", "quantity": 1, "cost": 7899 }, ...] - the same
--                    shape as job_cards.parts_used, so it pre-fills the technician's parts list.
--   service_charge : the charge for the service itself, pre-fills the technician's labor line.
-- Both are only a plan: the technician can still change what is recorded on the job card, and
-- quoted_price (what the customer is billed) is left exactly as it was.
-- Additive only. Safe to run more than once.

alter table service_requests
  add column if not exists job_products jsonb not null default '[]'::jsonb,
  add column if not exists service_charge numeric not null default 0;
