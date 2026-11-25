-- A full profile for every customer / vendor ledger: company name (the ledger's name), VAT / PAN no., address,
-- contact person and their phone (columns already there), mobile, landline, email and notes.
-- A new Sale or Purchase bill to them starts with their VAT / PAN no. and address.
-- Additive only. Run once in the Supabase SQL Editor. Safe to run more than once.

alter table customers add column if not exists vat_pan_no text;
alter table customers add column if not exists landline text;
alter table customers add column if not exists email text;
alter table customers add column if not exists notes text;

notify pgrst, 'reload schema';
