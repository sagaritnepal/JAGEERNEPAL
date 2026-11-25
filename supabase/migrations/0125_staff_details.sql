-- Staff & Access: a staff member can be added with just their details - name, mobile, email, address, PAN no.,
-- none of them required - with or without a Jageer account. One with an account (found by their mobile) can
-- later be given access to the portal; one without is a record of who works in the shop.
-- Additive only. Run once in the Supabase SQL Editor (after 0123). Safe to run more than once.

alter table staff_access add column if not exists member_email text;
alter table staff_access add column if not exists member_address text;
alter table staff_access add column if not exists member_pan text;

-- No longer every row needs an account or a manual employee behind it.
alter table staff_access drop constraint if exists staff_access_who_check;

notify pgrst, 'reload schema';
