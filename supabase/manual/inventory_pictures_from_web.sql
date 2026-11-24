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

-- From qualitycomputer.com.np (the shop the app's catalog was seeded from, used with the owner's permission -
-- see 0024). A model-less item (a 4-channel DVR, a 64GB card, an HDMI cable) gets the shop's picture of that kind
-- of product, so it is a likeness, not necessarily the exact one in stock.
update finance_items f
   set image_url = v.url, updated_at = now()
  from (values
    ('7a193a9f-5ee5-4c07-aa30-edef2710df62'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/51386/image_512/Brother%20MFC-L6710DW%20Mono%20Laser%20Printer?unique=c198e82'),  -- BROTHER MFC-L6710DW
    ('615450e9-dce5-495f-bafb-18a677ab6978'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/47836/image_512/ZKTeco%20MB2000%20Multi-biometric%20Attendance%20Device?unique=c198e82'),  -- ATTENDANCE MACHINE MB2000
    ('9f637b7a-2016-428f-ae4f-06a9a5de8741'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/51618/image_512/ZKTeco%20ZKP8016%20Thermal%20Printer?unique=c198e82'),  -- ZKTECO THERMAL PRINTER (ZKP8016)
    ('43789265-301c-4a6e-92f2-49a6999b0e36'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/51618/image_512/ZKTeco%20ZKP8016%20Thermal%20Printer?unique=c198e82'),  -- ZKTECO 8016
    ('3f3abf2a-0cbc-40b1-b8b9-efff94db78c1'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/52939/image_512/%5BMU9E3ZP-A%5D%20Apple%20Mac%20Mini%20M4%20%7C%2010-Core%20CPU%20%7C%2010-Core%20GPU%20%7C%2016GB%20Unified%20Memory%20%7C%20512GB%20SSD%20%7C%20Carbon%20Neutral%20%7C%201-Year%20Authorized%20Warranty?unique=c198e82'),  -- APPLE MAC MINI DESKTOP
    ('f431b3e3-93dc-4cfc-9132-81f4e0fec74c'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/40751/image_512/Hikvision%204%20Port%20DVR%20DS-7104HQHI-K1?unique=c198e82'),  -- HIKVISION DVR 4CH
    ('74e8711f-293f-432f-a467-516e12a21a53'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/40755/image_512/Hikvision%208-Port%20DVR%20IDS%207208HQHI-M1-S?unique=c198e82'),  -- HIKVISION DVR 8 CHANNEL
    ('46d81758-c5a2-475d-824c-4f8ea9fc7569'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/44616/image_512/Hikvision%208-Port%20POE%20Switch%20DS-3E0310P-E-M%20%28B%29?unique=c198e82'),  -- HIKVISION ETHERNET SWITCH WITH POE 8 PORT
    ('04bd56ae-a722-4025-8f86-b7d9a460d941'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/44616/image_512/Hikvision%208-Port%20POE%20Switch%20DS-3E0310P-E-M%20%28B%29?unique=c198e82'),  -- HIKVISION POE SWITCH 8 PORT
    ('1eafe736-52d1-4b25-88e5-8efcaac709a5'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/49842/image_512/WD%204TB%20Purple%20Hikvision%20HDD%20%28Surveillance%29%20Internal?unique=c198e82'),  -- HARDDISK 4TB
    ('5721bfcb-6bd3-4c32-84ca-832f85c60958'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/53328/image_512/Lexar%20633x%2064GB%20Micro%20SDXC%20UHS-I%20Flash%20V30%20100MB-s%20Memory%20Card%20%28LMS0633064G-BNNNG%29?unique=c198e82'),  -- MEMORY CARD 64 GB
    ('2de6c0bf-4ed0-4f59-9863-cd519033e444'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/44962/image_512/Technos%20Cat%206%20Cable%20%28305M%29?unique=c198e82'),  -- Cat 6 Cable
    ('8ac7bb14-6fd5-4fbe-9507-884ce1653a63'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/44962/image_512/Technos%20Cat%206%20Cable%20%28305M%29?unique=c198e82'),  -- [XUC-6055] CAT6-NORMAL
    ('76d61608-4745-4f00-bc79-3ff289d52d29'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/51219/image_512/%5B10167%5D%20UGREEN%20HDMI%20Male%20To%20Male%20Cable%205M?unique=c198e82'),  -- HDMI CABLE 5M
    ('64edf290-15aa-4f1a-a084-7063f459317d'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/51217/image_512/%5B10128%5D%20UGREEN%20HDMI%20Male%20To%20Male%20Cable%201.5M?unique=c198e82'),  -- Hdmi Cable 1.5m
    ('c3203037-9a3d-446d-8b26-8a8e50ddb3d2'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/49874/image_512/%5B11634%5D%20UGREEN%20VGA%20Cable%2015M?unique=c198e82'),  -- VGA CABLE 1.5M
    ('0b79f23f-c2d8-4be2-a07d-c5269409e389'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/49874/image_512/%5B11634%5D%20UGREEN%20VGA%20Cable%2015M?unique=c198e82'),  -- VGA CABLE 5M
    ('b3a4a836-a3c1-45c1-937e-efb1a0ecc87f'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/44872/image_512/RJ%2045%20Jack%20AMP%28White%29?unique=c198e82'),  -- RJ45 CONNECTOR
    ('d1bc9e81-d355-412a-b361-0a4b61123380'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/51790/image_512/%5B25851%5D%20UGREEN%204-Port%20USB%203.0%20Hub%20%28CM219%29?unique=c198e82'),  -- UGREEN 4 PORT USB3.0 HUB WITH TYPE-C
    ('5762fa36-f05a-4109-93a5-7bc28e8574e1'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/53447/image_512/%5BHVKB-KB660GCM-BK%5D%20Havit%20KB660GCM%20Wireless%20Keyboard%20%26%20Mouse%20Combo?unique=c198e82'),  -- HAVIT ... KEYBOARD AND MOUSE COMBO
    -- From the app's own catalog (0024, same shop)
    ('a679938b-d2cb-48b2-a56b-929bff004a2a'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/44945/image_512/T95%20Android%20TV%20Box%204GB%20RAM%2032GB%20ROM?unique=5b3aac4')  -- SMART ANDROID TV BOX
  ) as v(id, url)
 where f.id = v.id
   and coalesce(f.image_url, '') = '';

-- Third round, qualitycomputer.com.np again: more of the shop's own pictures for the same kind of product.
update finance_items f
   set image_url = v.url, updated_at = now()
  from (values
    ('a346f9b8-5034-41f8-b99b-88943505c9a2'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/40766/image_512/Hikvision%20DS%202CD1323G0E-I%202MP%20Dome?unique=9c9644f'),  -- HIKVISION 2MP DOME
    ('75d0b04d-ee8d-4d17-b5e1-8a26138845b6'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/40783/image_512/Hikvision%20DS-2CD1143G0E-I%204MP%20Dome?unique=9c9644f'),  -- HIKVISION 4MP IP DOME
    ('0cea3e52-1dc6-4740-b53f-9b4fb210e1c1'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/40762/image_512/Hikvision%20DS%202CD1023G0E-I%202MP%20Bullet?unique=9c9644f'),  -- HIKVISION 2MP IP BULLET
    ('6db0ba82-37a9-4fed-8ffb-0b1451b65cec'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/50007/image_512/Kaspersky%20Plus%20:%20Security%20Performance%20and%20Privacy%202023%203%20Devices%20%7C%201%20Year%20%7C%201%20Key?unique=9c9644f'),  -- KASPERSKY ANTIVIRUS 3 USERS
    ('85c30774-b266-4a6b-a480-3ca0fda037e7'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/49831/image_512/Hiksemi%20E100%20128GB%20SATA%203.0%20SSD?unique=ec4b3fa'),  -- SSD 128
    ('3db2cb6a-711f-4fe0-8bae-d18c4c57eab0'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/50590/image_512/Hiksemi%20E100%20256GB%20SATA%203.0%20SSD?unique=ec4b3fa'),  -- SSD 265GB
    ('98c87d88-1410-4d91-839c-49b253e4ffa1'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/44902/image_512/SP%20Laptop%20RAM%204GB%20DDR4%202666Mhz?unique=9c9644f'),  -- RAM DDR 4GB
    ('6302e127-c5b7-4cb3-a18e-c42dd0771e05'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/53389/image_512/WD%201TB%20Purple%20HDD%20Surveillance%20Internal%20WD10PURZ?unique=9c9644f'),  -- HARDDISK 1 TB
    ('7387a0ca-c125-40cd-94b3-0afd970cfcc8'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/40796/image_512/Hikvision%20Fingerprint%20Access%20Control%20Terminal%20%28DS-K1T804BEF%29?unique=9c9644f'),  -- ACCESS CONTROL
    ('d67ca786-4076-4dd8-bb7e-672936e7910c'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/40796/image_512/Hikvision%20Fingerprint%20Access%20Control%20Terminal%20%28DS-K1T804BEF%29?unique=9c9644f'),  -- ACCESS CONTROL (STANDARD)
    ('59949763-a1b5-47be-b815-ff52219aca6d'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/49108/image_512/BenQ%2022%22%20FHD%20Monitor%20%28GW2283%29?unique=9c9644f'),  -- ENTER 22 inch MONITOR
    ('0cef2d1a-ebc4-4987-91a8-7c2dc0d48434'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/52000/image_512/Intex%20IT-1902%2019%22%2060Hz%20LED%20Monitor?unique=9c9644f'),  -- MONITOR 19 INCH
    ('49bda06a-a315-4711-bfb7-03d7058616c7'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/51466/image_512/Ruijie%20Reyee%20RG-ES106F-P%204-Port%2010-100mbps%20POE%20With%202-Port%20FE%20Unmanaged%20Metal%20Switch?unique=9c9644f'),  -- POE SWITCH 4 PORT
    ('ffae0841-7e78-4aa9-b140-f66083149040'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/44616/image_512/Hikvision%208-Port%20POE%20Switch%20DS-3E0310P-E-M%20%28B%29?unique=9c9644f'),  -- POE SWITCH 8 PORT
    ('1550e1d2-e293-40dd-b18b-72825ceaed81'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/44616/image_512/Hikvision%208-Port%20POE%20Switch%20DS-3E0310P-E-M%20%28B%29?unique=9c9644f'),  -- POE SWITCH 8 PORT WITH GIGA
    ('7d8512ee-7dce-46eb-a9ac-bfa0aed42169'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/44616/image_512/Hikvision%208-Port%20POE%20Switch%20DS-3E0310P-E-M%20%28B%29?unique=9c9644f'),  -- POE SWITCH 8 PORT+2 GIGA
    ('4a35e818-d512-4ccc-a708-2ce27a752897'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/44474/image_512/Dell%20Laptop%20Adapter%2019.5V-3.34A-65W%20%28Big%20Pin%29?unique=9c9644f'),  -- LAPTOP ADAPTOR DELL
    ('e078b1f4-f1b5-4263-8152-da914fe448e4'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/49224/image_512/Okaya%207.2AH-12V%20UPS%20Battery?unique=9c9644f'),  -- UPS BATTERY
    ('0188852e-e568-46c6-a9bc-71088cd38634'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/53143/image_512/Marsriva%20Smart%20Mini%20DC%20UPS%20KP3%20%2810000mAh%29?unique=9c9644f'),  -- DC UPS HITECH BATTERY 8800 MAH
    ('fdf05a93-e2f4-4d8a-ae2f-8b949ef712b5'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/51453/image_512/Rapoo%20B20%20Silent%20Wireless%20Optical%20Mouse%20%281200%20DPI%29?unique=9c9644f'),  -- MOUSE WIRELESS
    ('ba191723-8f15-4e15-9c1e-270d485f82c2'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/53449/image_512/Havit%20MP837%20Gaming%20Mouse%20Pad?unique=9c9644f'),  -- MOUSE PAD
    ('8e33b87e-a36b-4769-a832-269aff7c9d72'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/51114/image_512/Fantech%20ATOM63%20MK874v2%20Mechanical%20Keyboard?unique=9c9644f'),  -- Mechanical Keyboard
    ('c6af9d1e-42c1-437d-ba3f-e55ca018cf75'::uuid, 'https://qualitycomputer.com.np/web/image/product.template/41020/image_512/%5B90464%5D%20UGREEN%20KU001%20Wired%20USB%20Keyboard?unique=9c9644f')  -- KEYBOARD NORMAL
  ) as v(id, url)
 where f.id = v.id
   and coalesce(f.image_url, '') = '';

-- Check: the items that got a picture.
select name, image_url from finance_items where image_url is not null order by name;
