-- A customer's review can carry a few quick tags alongside the star rating
-- and comment - a fixed vocabulary (lib/constants/reviewTags.ts), not a
-- category table, since the wording may change without a migration.
-- Additive only. Safe to run once against the existing schema.

alter table reviews add column if not exists tags text[] not null default '{}';
