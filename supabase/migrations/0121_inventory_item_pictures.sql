-- A picture for every item in the Inventory.
--
-- The Inventory shows a picture for each item, but only a catalog product could have one, and only an admin
-- could upload it. From here a shop owner can give any of their items a picture from the Inventory:
--   1. finance_items (an item typed into a bill, not a catalog product) gets an image_url, like products.
--   2. Anyone signed in may add a picture under catalog-images/items/<their id>/ - their own folder only.
--      (A product's picture is saved on the product itself, which its seller may already update.)
--
-- Additive only. Run once in the Supabase SQL Editor. Safe to run more than once.

alter table finance_items add column if not exists image_url text;

drop policy if exists catalog_images_insert_own_items on storage.objects;
create policy catalog_images_insert_own_items on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'catalog-images'
    and (storage.foldername(name))[1] = 'items'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
