-- Add ordered multi-method support for recipe steps and apply pilot 30 manual corrections.
-- Generated from docs/workpacks/28-external-ingredient-data-ingest-gate/pilot-30-quality-edit-decisions-2026-06-26.json and the local review HTML payload.

insert into public.cooking_methods (
  code,
  label,
  color_key,
  category_code,
  is_system,
  display_order
)
values
  ('prep', '손질', 'gray', 'prep_handling', true, 5),
  ('grind', '갈기', 'gray', 'prep_handling', true, 24),
  ('mash', '으깨기', 'gray', 'prep_handling', true, 26),
  ('roll', '밀기', 'gray', 'prep_handling', true, 28),
  ('sieve', '체', 'gray', 'prep_handling', true, 29),
  ('infuse', '우리기', 'green', 'preprocessing', true, 45),
  ('cook_rice', '밥하기', 'red', 'moist_heat', true, 55),
  ('fill', '채우기', 'green', 'mix_braise', true, 145),
  ('finish', '마무리', 'green', 'mix_braise', true, 155),
  ('auto_salt', '절이기', 'unassigned', 'preprocessing', false, 999)
on conflict (code) do update set
  label = excluded.label,
  color_key = excluded.color_key,
  category_code = excluded.category_code,
  is_system = excluded.is_system,
  display_order = excluded.display_order;

create table if not exists public.recipe_step_cooking_methods (
  id uuid primary key default gen_random_uuid(),
  step_id uuid not null references public.recipe_steps(id) on delete cascade,
  method_id uuid not null references public.cooking_methods(id) on delete restrict,
  position integer not null,
  created_at timestamptz not null default now(),
  constraint recipe_step_cooking_methods_position_positive check (position > 0),
  constraint recipe_step_cooking_methods_step_method_unique unique (step_id, method_id),
  constraint recipe_step_cooking_methods_step_position_unique unique (step_id, position)
);

create index if not exists recipe_step_cooking_methods_step_position_idx
  on public.recipe_step_cooking_methods (step_id, position asc);

create index if not exists recipe_step_cooking_methods_method_idx
  on public.recipe_step_cooking_methods (method_id);

grant select on public.recipe_step_cooking_methods to anon, authenticated;

insert into public.recipe_step_cooking_methods (step_id, method_id, position)
select step.id, step.cooking_method_id, 1
  from public.recipe_steps step
 where not exists (
   select 1
     from public.recipe_step_cooking_methods existing
    where existing.step_id = step.id
 )
   and step.cooking_method_id is not null;

create temp table tmp_pilot30_step_methods (
  recipe_id uuid not null,
  step_number integer not null,
  position integer not null,
  method_label text not null
) on commit drop;

insert into tmp_pilot30_step_methods (recipe_id, step_number, position, method_label)
values
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 1::integer, 1::integer, '우리기'::text),
  ('82b6a95a-d524-5a39-8c97-0fb6b230b5a4'::uuid, 6::integer, 1::integer, '마무리'::text),
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 6::integer, 1::integer, '마무리'::text),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 1::integer, 1::integer, '썰기'::text),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 1::integer, 2::integer, '굽기'::text),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 2::integer, 1::integer, '끓이기'::text),
  ('298da2db-51e4-50da-9295-034d6e77045b'::uuid, 2::integer, 2::integer, '갈기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 1::integer, 1::integer, '밥하기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 6::integer, 1::integer, '마무리'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 4::integer, 1::integer, '다지기'::text),
  ('12dbf6ae-8783-52c6-a1e4-8280fcfe16b2'::uuid, 4::integer, 2::integer, '볶기'::text),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 1::integer, 1::integer, '밀기'::text),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 2::integer, 1::integer, '삶기'::text),
  ('0a54f6c0-0ac3-59ea-97f9-4b4f58156ecf'::uuid, 2::integer, 2::integer, '으깨기'::text),
  ('c2693c74-4109-5f64-8a69-865acd0ef77f'::uuid, 2::integer, 1::integer, '체'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 3::integer, 1::integer, '썰기'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 3::integer, 2::integer, '볶기'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 5::integer, 1::integer, '볶기'::text),
  ('a5a7fc1e-ceef-5970-9a85-b60377ce72f8'::uuid, 5::integer, 2::integer, '졸이기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 2::integer, 1::integer, '다지기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 2::integer, 2::integer, '썰기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 5::integer, 1::integer, '채우기'::text),
  ('ff795de4-16d5-563c-af83-9fd8c4a9fda4'::uuid, 6::integer, 1::integer, '마무리'::text),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 1::integer, 1::integer, '썰기'::text),
  ('2af320dd-544b-58df-8c9d-8a9a8d5fc585'::uuid, 1::integer, 2::integer, '섞기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 2::integer, 1::integer, '썰기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 2::integer, 2::integer, '볶기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 5::integer, 1::integer, '체'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 5::integer, 2::integer, '섞기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 6::integer, 1::integer, '부치기'::text),
  ('72307be5-40e0-5fa3-a7f1-e350b02b445d'::uuid, 6::integer, 2::integer, '마무리'::text),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 1::integer, 1::integer, '볶기'::text),
  ('f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid, 1::integer, 2::integer, '섞기'::text),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 2::integer, 1::integer, '썰기'::text),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 2::integer, 2::integer, '오븐굽기'::text),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 3::integer, 1::integer, '굽기'::text),
  ('dc2c7bf6-2470-5dbf-bca5-08c56b6fa10a'::uuid, 3::integer, 2::integer, '마무리'::text),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 4::integer, 1::integer, '체'::text),
  ('bf0b1e5e-df1c-5293-843a-47f835040c72'::uuid, 4::integer, 2::integer, '섞기'::text),
  ('2240c082-e0cb-5eda-9ce8-4e9d1c4b52c8'::uuid, 2::integer, 1::integer, '갈기'::text),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 3::integer, 1::integer, '섞기'::text),
  ('4358a8a3-cac1-5173-86df-ee15a5960131'::uuid, 3::integer, 2::integer, '채우기'::text),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 1::integer, 1::integer, '데치기'::text),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 1::integer, 2::integer, '갈기'::text),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 2::integer, 1::integer, '찌기'::text),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 2::integer, 2::integer, '으깨기'::text),
  ('3c578726-7058-5ba3-ac43-951e98ef2a61'::uuid, 2::integer, 3::integer, '다지기'::text),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 1::integer, 1::integer, '갈기'::text),
  ('bad91971-54e4-52b5-8c40-3335c55c83b8'::uuid, 1::integer, 2::integer, '다지기'::text),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 1::integer, 1::integer, '손질'::text),
  ('ef8a2ea5-848a-5a09-9525-26a233911832'::uuid, 5::integer, 1::integer, '체'::text),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 2::integer, 1::integer, '썰기'::text),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 2::integer, 2::integer, '데치기'::text),
  ('b7badda4-d285-5b6d-8c61-81d387f137ed'::uuid, 4::integer, 1::integer, '갈기'::text),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 5::integer, 1::integer, '썰기'::text),
  ('8cb5c8e7-7566-5a93-ba06-28d3d3ad12bb'::uuid, 5::integer, 2::integer, '볶기'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 1::integer, 1::integer, '손질'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 1::integer, 2::integer, '다지기'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 6::integer, 1::integer, '채우기'::text),
  ('7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid, 6::integer, 2::integer, '굽기'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 1::integer, 1::integer, '손질'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 2::integer, 1::integer, '손질'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 6::integer, 1::integer, '볶기'::text),
  ('381fb996-b8ab-5a0e-84fe-401a9ddb5387'::uuid, 6::integer, 2::integer, '끓이기'::text);

do $$
declare
  v_missing text;
  v_missing_steps text;
begin
  select string_agg(distinct q.method_label, ', ' order by q.method_label)
    into v_missing
    from tmp_pilot30_step_methods q
    left join public.cooking_methods method on method.label = q.method_label
   where method.id is null;

  if v_missing is not null then
    raise exception 'Pilot 30 multi-method correction missing cooking methods: %', v_missing;
  end if;

  select string_agg(distinct q.recipe_id::text || '#' || q.step_number::text, ', ' order by q.recipe_id::text || '#' || q.step_number::text)
    into v_missing_steps
    from tmp_pilot30_step_methods q
    left join public.recipe_steps step
      on step.recipe_id = q.recipe_id
     and step.step_number = q.step_number
   where step.id is null;

  if v_missing_steps is not null then
    raise exception 'Pilot 30 multi-method correction missing recipe steps: %', v_missing_steps;
  end if;
end $$;

delete from public.recipe_step_cooking_methods link
 using public.recipe_steps step
 where link.step_id = step.id
   and exists (
     select 1
       from tmp_pilot30_step_methods q
      where q.recipe_id = step.recipe_id
        and q.step_number = step.step_number
   );

insert into public.recipe_step_cooking_methods (step_id, method_id, position)
select step.id, method.id, q.position
  from tmp_pilot30_step_methods q
  join public.recipe_steps step
    on step.recipe_id = q.recipe_id
   and step.step_number = q.step_number
  join public.cooking_methods method
    on method.label = q.method_label
 order by q.recipe_id, q.step_number, q.position;

update public.recipe_steps step
   set cooking_method_id = method.id
  from tmp_pilot30_step_methods q
  join public.cooking_methods method
    on method.label = q.method_label
 where step.recipe_id = q.recipe_id
   and step.step_number = q.step_number
   and q.position = 1;

update public.recipe_ingredients ingredient
   set component_label = '레몬마요네즈 소스'
  from public.ingredients master
 where ingredient.ingredient_id = master.id
   and ingredient.recipe_id = 'f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid
   and master.standard_name = '참기름'
   and ingredient.display_text = '참기름 약간'
   and ingredient.sort_order = 2;

update public.recipe_ingredients ingredient
   set ingredient_id = new_master.id
  from public.ingredients current_master,
       public.ingredients new_master
 where ingredient.ingredient_id = current_master.id
   and ingredient.recipe_id = '7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid
   and current_master.standard_name = '파프리카'
   and new_master.standard_name = '미니파프리카'
   and ingredient.display_text = '미니파프리카 20g';

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
    from public.recipe_ingredients ingredient
    join public.ingredients master on master.id = ingredient.ingredient_id
   where ingredient.recipe_id = 'f8f195c4-b7d7-58da-bd81-07d35357db59'::uuid
     and master.standard_name = '참기름'
     and ingredient.display_text = '참기름 약간'
     and ingredient.sort_order = 2
     and ingredient.component_label = '레몬마요네즈 소스';

  if v_count <> 1 then
    raise exception 'Pilot 30 ingredient component correction failed for 돌나물 샐러드 참기름: %', v_count;
  end if;

  select count(*) into v_count
    from public.recipe_ingredients ingredient
    join public.ingredients master on master.id = ingredient.ingredient_id
   where ingredient.recipe_id = '7da19cdd-f8f9-59d6-9583-378b0225b5f5'::uuid
     and master.standard_name = '미니파프리카'
     and ingredient.display_text = '미니파프리카 20g';

  if v_count <> 1 then
    raise exception 'Pilot 30 ingredient standard-name correction failed for 오징어콩순대 미니파프리카: %', v_count;
  end if;
end $$;

create temp table tmp_pilot30_thumbnail_updates (
  recipe_id uuid not null,
  thumbnail_url text not null
) on commit drop;

insert into tmp_pilot30_thumbnail_updates (recipe_id, thumbnail_url)
values
  ('9e9e82c1-f7bc-5372-9588-0f242cc8239d'::uuid, 'https://www.foodsafetykorea.go.kr/uploadimg/cook/20_00386_06.png'::text);

update public.recipes recipe
   set thumbnail_url = image.thumbnail_url,
       updated_at = now()
  from tmp_pilot30_thumbnail_updates image
 where recipe.id = image.recipe_id
   and recipe.thumbnail_url is distinct from image.thumbnail_url;

update public.recipe_sources source
   set extraction_meta_json = source.extraction_meta_json
     || jsonb_build_object(
       'pilot30_multi_method_corrected_at', '2026-06-27T00:00:00.000Z',
       'pilot30_multi_method_correction_source', 'docs/workpacks/28-external-ingredient-data-ingest-gate/pilot-30-quality-edit-decisions-2026-06-26.json'
     )
 where source.recipe_id in (
   select distinct recipe_id from tmp_pilot30_step_methods
 );

do $$
declare
  v_expected integer;
  v_actual integer;
begin
  select count(*) into v_expected from tmp_pilot30_step_methods;

  select count(*) into v_actual
    from tmp_pilot30_step_methods q
    join public.recipe_steps step
      on step.recipe_id = q.recipe_id
     and step.step_number = q.step_number
    join public.recipe_step_cooking_methods link
      on link.step_id = step.id
     and link.position = q.position
    join public.cooking_methods method
      on method.id = link.method_id
     and method.label = q.method_label;

  if v_expected <> v_actual then
    raise exception 'Pilot 30 multi-method correction count mismatch: expected %, actual %', v_expected, v_actual;
  end if;
end $$;
