-- Reconcile the user-approved recipe-nutrition-v2 data on the current full-local DB.
-- The caller must wrap this file in one transaction and set ON_ERROR_STOP=1.

select public.set_account_generation_internal_writer_marker(
  (select current_cutover_attempt_id
   from public.account_generation_capability_state
   where singleton),
  true
);

update public.recipes
set deleted_at=coalesce(deleted_at,clock_timestamp()),
    updated_at=case when deleted_at is null then clock_timestamp() else updated_at end
where id in (
  '0167581a-ff12-449a-8154-253b89c907b5'::uuid,
  '49823604-e997-46ce-9737-f6f95e003308'::uuid,
  'd8ac2659-4c95-48db-8ae7-0dafc781085c'::uuid,
  'ea2811d9-8b56-45ac-8552-91b0845964ff'::uuid,
  '10b49151-38ca-49a2-9134-7d2ceebc0912'::uuid,
  'c41a9c31-765b-453c-8d45-66ef2bed337b'::uuid,
  '550e8400-e29b-41d4-a716-446655440022'::uuid
)
and deleted_at is null;

with reference_map(source_id,target_id,source_label,target_label) as (
  values
    ('57133a3a-629e-4258-bf07-a72b41236d0b'::uuid,'4dfdc5ff-42d8-4c22-b1f7-ff9a0f43d568'::uuid,'간장','양조간장'),
    ('d3e81b83-964b-4c22-8fbb-81c35dcf2074'::uuid,'a75bf43b-c473-44cc-ab3f-44bfcf6a0530'::uuid,'식초','양조식초'),
    ('2eb6bcfc-66bd-47c8-82b4-edd75238c466'::uuid,'b6f2635f-4384-4db6-9123-b2c4c5a1dcb7'::uuid,'버터','무염버터'),
    ('c5b27f0d-5bf8-4c14-8612-a3b5e4512f6a'::uuid,'53f2f08a-40bf-42f0-94f0-99f0d932d521'::uuid,'밀가루','중력분'),
    ('d6d92b38-853f-43c2-b2e1-2b4a591de334'::uuid,'43d7cb22-d01a-55dc-86b0-513c74d9265f'::uuid,'식용유','카놀라유'),
    ('dfa26343-0d41-4750-9e8f-b6cea850e188'::uuid,'550e8400-e29b-41d4-a716-446655440014'::uuid,'돼지고기','돼지고기')
)
update public.recipe_ingredients item
set ingredient_id=reference_map.target_id,
    display_text=case reference_map.source_label
      when '간장' then regexp_replace(item.display_text,'^(맛간장|저염간장|진간장|간장)','양조간장')
      when '식초' then regexp_replace(item.display_text,'^식초','양조식초')
      when '버터' then regexp_replace(item.display_text,'^버터','무염버터')
      when '밀가루' then regexp_replace(item.display_text,'^밀가루','중력분')
      when '식용유' then regexp_replace(item.display_text,'^(식용유|튀김기름)','카놀라유')
      else item.display_text
    end
from reference_map
where item.ingredient_id=reference_map.source_id;

with quantified(id,amount_g,display_text) as (
  values
    ('1626766f-196d-4b01-90e5-3ae410be2bae'::uuid,50::numeric,'대파 50g'),
    ('da2dfb76-27c7-42f6-9af4-e38ce316f744'::uuid,25::numeric,'대파 25g(약간)'),
    ('fdefb094-ecc6-49d7-a82f-25517ec4c0a3'::uuid,8::numeric,'럼 8g(2작은술)'),
    ('424b0251-525b-46ed-9f6e-aa344990f928'::uuid,10::numeric,'무염버터 10g'),
    ('c6df3fc2-0100-4809-a95a-07dae56056aa'::uuid,10::numeric,'무염버터 10g'),
    ('c5231f78-83b9-496e-813d-0916fa39227d'::uuid,1.23::numeric,'소금 1.23g(1/3작은술)'),
    ('ed7fafd6-4480-4015-a98d-2343c27ee46a'::uuid,2.55::numeric,'양조식초 2.55g(1/2작은술)'),
    ('3e90d317-f068-4a2c-9588-7c021bbb07a1'::uuid,2.5::numeric,'참기름 2.5g'),
    ('df280a0c-dcea-409b-8aea-0580f326d1e7'::uuid,2.5::numeric,'참기름 2.5g'),
    ('4d3b7ecd-7f5d-4156-b5b0-da33dea57436'::uuid,3::numeric,'통깨 3g'),
    ('d1fc3e11-6132-48f4-9611-e3946265b02d'::uuid,3::numeric,'통깨 3g'),
    ('7b6cfa3f-daf6-42e3-8906-cb8554bdcccc'::uuid,3::numeric,'통깨 3g'),
    ('c40e99bc-d81e-4f20-9e05-c6479788f309'::uuid,10::numeric,'치커리 10g'),
    ('aea8a20d-c4a5-4398-87c9-bedc594888e7'::uuid,25::numeric,'튀김가루 25g'),
    ('96992854-6d14-44fc-bd68-4fabc64ea4fb'::uuid,0.3::numeric,'후추 0.3g(약간)'),
    ('49cf73a5-a5e4-409a-9229-3a3623b1edc6'::uuid,0.3::numeric,'후추 0.3g(3바퀴)'),
    ('7e8df11f-07cb-47d0-995b-d5849c410d4c'::uuid,0.3::numeric,'후추 0.3g(3바퀴)'),
    ('6c4271ce-1623-44b3-94c9-b389bd67a097'::uuid,20::numeric,'올리브유 20g')
)
update public.recipe_ingredients item
set amount=quantified.amount_g,unit='g',ingredient_type='QUANT',scalable=true,
    display_text=quantified.display_text
from quantified
where item.id=quantified.id
  and (item.amount,item.unit,item.ingredient_type,item.scalable,item.display_text)
    is distinct from
      (quantified.amount_g,'g','QUANT'::public.recipe_ingredient_type,true,quantified.display_text);

select public.set_account_generation_internal_writer_marker(
  (select current_cutover_attempt_id
   from public.account_generation_capability_state
   where singleton),
  false
);

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.recipes
  where id in (
    '0167581a-ff12-449a-8154-253b89c907b5','49823604-e997-46ce-9737-f6f95e003308',
    'd8ac2659-4c95-48db-8ae7-0dafc781085c','ea2811d9-8b56-45ac-8552-91b0845964ff',
    '10b49151-38ca-49a2-9134-7d2ceebc0912','c41a9c31-765b-453c-8d45-66ef2bed337b',
    '550e8400-e29b-41d4-a716-446655440022'
  ) and deleted_at is not null;
  if v_count<>7 then raise exception 'EXPECTED_7_SOFT_DELETED_RECIPES_GOT_%',v_count; end if;

  select count(*) into v_count
  from public.recipe_ingredients item
  where item.id in (
    '1626766f-196d-4b01-90e5-3ae410be2bae','da2dfb76-27c7-42f6-9af4-e38ce316f744',
    'fdefb094-ecc6-49d7-a82f-25517ec4c0a3','424b0251-525b-46ed-9f6e-aa344990f928',
    'c6df3fc2-0100-4809-a95a-07dae56056aa','c5231f78-83b9-496e-813d-0916fa39227d',
    'ed7fafd6-4480-4015-a98d-2343c27ee46a','3e90d317-f068-4a2c-9588-7c021bbb07a1',
    'df280a0c-dcea-409b-8aea-0580f326d1e7','4d3b7ecd-7f5d-4156-b5b0-da33dea57436',
    'd1fc3e11-6132-48f4-9611-e3946265b02d','7b6cfa3f-daf6-42e3-8906-cb8554bdcccc',
    'c40e99bc-d81e-4f20-9e05-c6479788f309','aea8a20d-c4a5-4398-87c9-bedc594888e7',
    '96992854-6d14-44fc-bd68-4fabc64ea4fb','49cf73a5-a5e4-409a-9229-3a3623b1edc6',
    '7e8df11f-07cb-47d0-995b-d5849c410d4c','6c4271ce-1623-44b3-94c9-b389bd67a097'
  ) and item.ingredient_type='QUANT' and item.unit='g' and item.scalable;
  if v_count<>18 then raise exception 'EXPECTED_18_QUANTIFIED_RECIPE_ROWS_GOT_%',v_count; end if;

  with expected(ingredient_id,weight_g) as (
    values
      ('550e8400-e29b-41d4-a716-446655440010'::uuid,160::numeric),
      ('1e49f4be-6b94-4e7f-a492-a68134881e98'::uuid,10::numeric),
      ('a1ee7317-14cc-4803-92f0-70e090827d84'::uuid,40::numeric),
      ('335eff99-f04c-4942-adee-5aea91c32dd9'::uuid,40::numeric),
      ('fc8c99dd-cae6-46d2-9380-8fead38b9509'::uuid,40::numeric),
      ('025bc5c9-fcf0-500a-a32e-8fc8bb64ded5'::uuid,60::numeric),
      ('57d5d75f-3fa5-4540-aac7-9ec97e8ddcb6'::uuid,900::numeric),
      ('f15beb06-d859-455e-980c-f51715603d9a'::uuid,100::numeric),
      ('550e8400-e29b-41d4-a716-446655440017'::uuid,300::numeric),
      ('0e0de2a4-913c-4127-bfce-740daa6181c8'::uuid,200::numeric)
  )
  select count(*) into v_count
  from expected
  where exists (
    select 1 from public.piece_unit_weights piece
    where piece.ingredient_id=expected.ingredient_id
      and piece.size_code='medium' and piece.preparation_state='as_published'
      and piece.weight_g=expected.weight_g
      and piece.review_status='approved' and piece.is_active
  );
  if v_count<>10 then raise exception 'EXPECTED_10_EXACT_PIECE_STANDARDS_GOT_%',v_count; end if;

  with expected(ingredient_id,weight_g) as (
    values
      ('4dfdc5ff-42d8-4c22-b1f7-ff9a0f43d568'::uuid,17.7::numeric),
      ('a75bf43b-c473-44cc-ab3f-44bfcf6a0530'::uuid,15.3::numeric),
      ('1af619c8-1939-41bc-b35d-121e39267afd'::uuid,20::numeric),
      ('487653de-ae9b-499b-af18-ac444d2ed040'::uuid,15::numeric),
      ('be38bc63-ced9-4b9f-84a2-924dde0eb62c'::uuid,15::numeric),
      ('7d1408f1-43bd-4399-a240-117ab14a5a23'::uuid,15::numeric),
      ('68c0c37d-89d0-44cd-94f9-6bf9dfb73aa8'::uuid,15::numeric),
      ('d8e4b087-3629-4f58-8ccd-2185a07d3da5'::uuid,13.5::numeric),
      ('03d5e5b4-b44c-455d-9f9d-564f776c68df'::uuid,20::numeric),
      ('27eb6475-a35b-40dd-87cf-bb90c7c47f05'::uuid,15::numeric),
      ('cdc7f891-1b2d-4645-b6e3-191e9a700d1d'::uuid,15::numeric),
      ('072bbc30-aede-4034-9b51-a256eee26d1b'::uuid,7.4::numeric),
      ('550e8400-e29b-41d4-a716-446655440018'::uuid,11.3::numeric),
      ('81648c47-60e2-4235-a6d1-4dfd0e405ca9'::uuid,11.3::numeric),
      ('9c80ca75-3e3b-4ede-9025-3b954c044ec6'::uuid,8.6::numeric),
      ('9935fd54-6916-4743-9783-06fb457dacca'::uuid,10::numeric)
  )
  select count(*) into v_count
  from expected
  where exists (
    select 1
    from public.ingredient_conversion_assignments assignment
    join public.measurement_source_evidence evidence on evidence.id=assignment.evidence_id
    where assignment.ingredient_id=expected.ingredient_id
      and assignment.preparation_state='as_published'
      and assignment.review_status='approved' and assignment.is_active
      and evidence.normalized_g_per_15ml=expected.weight_g
      and evidence.review_status='approved' and evidence.is_active
  );
  if v_count<>16 then raise exception 'EXPECTED_16_EXACT_VOLUME_ASSIGNMENTS_GOT_%',v_count; end if;

  select count(*) into v_count
  from public.ingredients where standard_name ~ '\)$' or standard_name like '% · %';
  if v_count<>0 then raise exception 'NON_CANONICAL_INGREDIENT_NAMES_%',v_count; end if;

  select count(*) into v_count
  from public.account_generation_cutover_attempts
  where result_json ? '_internal_generation_writer_txid';
  if v_count<>0 then raise exception 'INTERNAL_WRITER_MARKER_LEAK'; end if;
end
$$;
