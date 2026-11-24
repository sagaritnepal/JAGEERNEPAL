-- Inventory pictures found on the web, for the branded items that had none.
--
-- NOT a migration: run once by hand in the Supabase SQL Editor (after 0121_inventory_item_pictures.sql).
-- Each picture is the product's photo on the maker's or a retailer's site, linked (not copied): if that site
-- moves or removes it, the picture goes blank and can be replaced with the camera button in Inventory.
-- Only items that still have no picture are touched, so a photo already added by hand is never overwritten.
-- Safe to run more than once.

update finance_items f
   set image_url = v.url, updated_at = now()
  from (values
    -- EZVIZ (ezviz.com)
    ('f11eb27f-e818-4fef-9056-9ea916581dba'::uuid, 'https://mfs.ezvizlife.com/440cecf7c6f38e94c6827ab67a4e464b.jpg'),  -- EZVIZ H6C-3MP
    ('091852aa-869e-46ea-8fe2-070ab3547882'::uuid, 'https://mfs.ezvizlife.com/b23107954fb48e726d7bf79a7591227d.png'),  -- EZVIZ H7C 2K
    ('d9710d6c-f119-4275-8dc3-965705249edc'::uuid, 'https://mfs.ezvizlife.com/df6b54ca5abd887d3ea08a487fce96a0.jpg'),  -- EZVIZ H8C 3MP
    ('e98c7a67-8026-49cf-8ad2-e40c7891c5ec'::uuid, 'https://mfs.ezvizlife.com/073776431d630895e1e9d72b079ae733.jpg'),  -- EZVIZ H9C DUAL LENS

    -- Brother printers (brother.ca, brother.com.ph, brother.co.za, applegadgetsbd.com)
    ('e99b2d7a-f2c7-4a5a-b4f3-3e69a134c30b'::uuid, 'https://adminapi.applegadgetsbd.com/storage/media/large/Brother-DCP-B7620DW-Multifunction-Mono-Laser-Printer-6909.png'),  -- [DCP-B7620DW]
    ('2bfbd02c-1ebd-4d17-a085-2d7cceef15f3'::uuid, 'https://cdn-tp1.mozu.com/21830-33325/cms/33325/files/a613313b-cf86-484c-8b1a-209801a27850?max=500'),  -- [DCP-L2540DW]
    ('c562d335-0aea-49ec-b9ae-5a32a1fc307e'::uuid, 'https://cdn-tp1.mozu.com/21830-33325/cms/33325/files/a613313b-cf86-484c-8b1a-209801a27850?max=500'),  -- BROTHER DCP-L2540 DW PRINTER
    ('bf816721-9e0c-46c3-9c6c-de3d3bc1d9fa'::uuid, 'https://www.brother.com.ph/-/media/ap2/philippines/products/dcp-t430w/dcp-t430w.webp?rev=e7f2e83469b64f1390e729abe46e67b6&hash=4A52FC4723653105CB21D78C3375872F'),  -- [DCP-T430W]
    ('abac4b7e-5ef9-49dc-a485-272a5b76a814'::uuid, 'https://www.brother.com.ph/-/media/ap2/philippines/products/dcp-t430w/dcp-t430w.webp?rev=e7f2e83469b64f1390e729abe46e67b6&hash=4A52FC4723653105CB21D78C3375872F'),  -- BROTHER DCP-T430W COLOR
    ('5dd76f5e-8eac-4b70-9d8a-58a61dbbb48c'::uuid, 'https://www.brother.co.za/-/media/ap2/south-africa/products/hl-l2365dw/brother-printers_hl-l2365dw.webp?rev=1a8a5fb98dc24075841122972ca01089&hash=671B80B557B0BEAE19B3942879FCE4E2'),  -- [HL-L2365DW]

    -- Toner and ink (unixnetworkbd.com, stationeryworld.com.sg)
    ('a244f82f-a55e-463f-95b4-0d4f5e7e144e'::uuid, 'https://unixnetworkbd.com/image/cache/catalog/product/brother-tn-b028-black-toner-cartridge-500x500.webp'),  -- [TN-B028]
    ('924eb5d2-dda6-4190-ba52-fefc6ccf61ae'::uuid, 'https://df3k2q0k3bu2n.cloudfront.net/static/images/CARTCA810XL-1_sq.jpg'),  -- CANON 810XL BLACK CARTRIDGE
    ('e8238816-c826-4167-a124-90b0cb465702'::uuid, 'https://df3k2q0k3bu2n.cloudfront.net/static/images/CARTCA810XL-1_sq.jpg'),  -- CANON 810XL INK CARTRIDGE
    ('e6863813-4cc6-465e-801c-fd45558d71d9'::uuid, 'https://df3k2q0k3bu2n.cloudfront.net/static/images/CARTCA811XL-3_sq.jpg'),  -- CANON 811XL INK CARTRIDGE

    -- ZKTeco K40 (ayoubcomputers.com)
    ('7492fb84-5bc0-48b6-bcfa-3809f234ff77'::uuid, 'https://cdn11.bigcommerce.com/s-sp9oc95xrw/images/stencil/1280x1280/products/49401/124684/Layer_1_18__44089.1758954875.png?c=2'),  -- K40-PRO-ATTENDANCE DEVICE
    ('bc4b1962-cf82-458b-aecf-6738dd4429d9'::uuid, 'https://cdn11.bigcommerce.com/s-sp9oc95xrw/images/stencil/1280x1280/products/49401/124684/Layer_1_18__44089.1758954875.png?c=2'),  -- ATTENDANCE MACHINE K-40 SECOND HAND
    ('18565727-0a87-401e-8178-3d7dfbd9e0ee'::uuid, 'https://cdn11.bigcommerce.com/s-sp9oc95xrw/images/stencil/1280x1280/products/49401/124684/Layer_1_18__44089.1758954875.png?c=2'),  -- Attendance Machine K40 Second Hand

    -- Logitech G102 (logitechg.com - the G102 is sold as the G203 in some regions; same mouse)
    ('eccbdc14-a97b-4b79-8665-7073e586c60b'::uuid, 'https://resource.logitechg.com/w_544,h_466,ar_7:6,c_pad,q_auto,f_auto,dpr_1.0/d_transparent.gif/content/dam/gaming/en/products/refreshed-g203/2025-update/g203-mouse-top-angle-black-gallery-1.png')  -- MOUSE G102
  ) as v(id, url)
 where f.id = v.id
   and coalesce(f.image_url, '') = '';

-- Check: the items that got a picture.
select name, image_url from finance_items where image_url is not null order by name;
