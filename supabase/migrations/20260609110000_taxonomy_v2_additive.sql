-- Add taxonomy v2 registries and nullable shadow metadata while preserving
-- the existing v1 ingredients.category and cooking-method response contracts.

create table if not exists public.ingredient_category_groups (
  code varchar(50) primary key,
  label varchar(50) not null unique,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.ingredient_categories (
  code varchar(50) primary key,
  group_code varchar(50) not null references public.ingredient_category_groups(code),
  label varchar(50) not null,
  legacy_category varchar(50) not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.ingredients
  add column if not exists category_code varchar(50);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ingredients_category_code_fkey'
  ) then
    alter table public.ingredients
      add constraint ingredients_category_code_fkey
      foreign key (category_code)
      references public.ingredient_categories(code);
  end if;
end;
$$;

create index if not exists ingredients_category_code_idx
  on public.ingredients (category_code);

insert into public.ingredient_category_groups (code, label, display_order, is_active)
values
  ('grain_noodle_ricecake', '곡류/면/떡', 10, true),
  ('vegetable_mushroom', '채소/버섯', 20, true),
  ('fruit_nut', '과일/견과', 30, true),
  ('protein', '단백질', 40, true),
  ('seafood', '해산물', 50, true),
  ('dairy_alternative', '유제품/대체유', 60, true),
  ('seasoning_condiment', '양념/조미', 70, true),
  ('processed_other', '가공/기타', 80, true)
on conflict (code) do update set
  label = excluded.label,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

insert into public.ingredient_categories (
  code,
  group_code,
  label,
  legacy_category,
  display_order,
  is_active
)
values
  ('rice_meal', 'grain_noodle_ricecake', '밥/쌀', '곡류', 10, true),
  ('noodle_pasta', 'grain_noodle_ricecake', '면/파스타', '곡류', 20, true),
  ('bread_ricecake_cereal', 'grain_noodle_ricecake', '빵/떡/시리얼', '곡류', 30, true),
  ('leaf_namul', 'vegetable_mushroom', '잎/나물채소', '채소', 40, true),
  ('root_stem', 'vegetable_mushroom', '뿌리/줄기채소', '채소', 50, true),
  ('fruiting_vegetable_mushroom', 'vegetable_mushroom', '열매채소/버섯', '채소', 60, true),
  ('fruit', 'fruit_nut', '과일', '과일', 70, true),
  ('nut_seed_dried_fruit', 'fruit_nut', '견과/씨앗/건과일', '과일', 80, true),
  ('pork_beef_lamb', 'protein', '돼지/소/양', '육류', 90, true),
  ('chicken_duck', 'protein', '닭/오리', '육류', 100, true),
  ('egg', 'protein', '달걀', '기타', 110, true),
  ('tofu_bean', 'protein', '두부/콩류', '기타', 120, true),
  ('fish_shellfish_crustacean', 'seafood', '생선/갑각/조개', '해산물', 130, true),
  ('seaweed_dried_fish_fishcake', 'seafood', '해조/건어물/어묵', '해산물', 140, true),
  ('milk_yogurt_cream', 'dairy_alternative', '우유/요거트/크림', '유제품', 150, true),
  ('cheese_butter_alt_milk', 'dairy_alternative', '치즈/버터/대체유', '유제품', 160, true),
  ('paste_sauce', 'seasoning_condiment', '장류/소스', '양념', 170, true),
  ('spice_herb', 'seasoning_condiment', '향신료/허브', '양념', 180, true),
  ('oil_vinegar_sugar_stock', 'seasoning_condiment', '기름/식초/당류/육수', '양념', 190, true),
  ('kimchi_pickle_can', 'processed_other', '김치/절임/통조림', '기타', 200, true),
  ('frozen_ready_drink_other', 'processed_other', '냉동/간편식/음료/기타', '기타', 210, true)
on conflict (code) do update set
  group_code = excluded.group_code,
  label = excluded.label,
  legacy_category = excluded.legacy_category,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

with category_mapping (standard_name, legacy_category, category_code) as (
  values
    ('쌀', '곡류', 'rice_meal'),
    ('밥', '곡류', 'rice_meal'),
    ('귀리', '곡류', 'rice_meal'),
    ('국수', '곡류', 'noodle_pasta'),
    ('중력분', '곡류', 'bread_ricecake_cereal'),
    ('양파', '채소', 'root_stem'),
    ('대파', '채소', 'root_stem'),
    ('감자', '채소', 'root_stem'),
    ('당근', '채소', 'root_stem'),
    ('가지', '채소', 'fruiting_vegetable_mushroom'),
    ('딸기', '과일', 'fruit'),
    ('생딸기', '과일', 'fruit'),
    ('사과', '과일', 'fruit'),
    ('바나나', '과일', 'fruit'),
    ('레몬', '과일', 'fruit'),
    ('라임', '과일', 'fruit'),
    ('오렌지', '과일', 'fruit'),
    ('귤', '과일', 'fruit'),
    ('배', '과일', 'fruit'),
    ('키위', '과일', 'fruit'),
    ('복숭아', '과일', 'fruit'),
    ('포도', '과일', 'fruit'),
    ('블루베리', '과일', 'fruit'),
    ('망고', '과일', 'fruit'),
    ('소고기', '육류', 'pork_beef_lamb'),
    ('돼지고기', '육류', 'pork_beef_lamb'),
    ('닭고기', '육류', 'chicken_duck'),
    ('닭가슴살', '육류', 'chicken_duck'),
    ('달걀', '기타', 'egg'),
    ('계란', '기타', 'egg'),
    ('두부', '기타', 'tofu_bean'),
    ('새우', '해산물', 'fish_shellfish_crustacean'),
    ('다랑어', '해산물', 'fish_shellfish_crustacean'),
    ('고등어', '해산물', 'fish_shellfish_crustacean'),
    ('김', '해산물', 'seaweed_dried_fish_fishcake'),
    ('다시마', '해산물', 'seaweed_dried_fish_fishcake'),
    ('어묵', '해산물', 'seaweed_dried_fish_fishcake'),
    ('우유', '유제품', 'milk_yogurt_cream'),
    ('요거트', '유제품', 'milk_yogurt_cream'),
    ('치즈', '유제품', 'cheese_butter_alt_milk'),
    ('버터', '유제품', 'cheese_butter_alt_milk'),
    ('간장', '양념', 'paste_sauce'),
    ('고추장', '양념', 'paste_sauce'),
    ('된장', '양념', 'paste_sauce'),
    ('연겨자', '양념', 'paste_sauce'),
    ('소금', '양념', 'spice_herb'),
    ('후추', '양념', 'spice_herb'),
    ('허브솔트', '양념', 'spice_herb'),
    ('고춧가루', '양념', 'spice_herb'),
    ('참기름', '양념', 'oil_vinegar_sugar_stock'),
    ('들기름', '양념', 'oil_vinegar_sugar_stock'),
    ('식용유', '양념', 'oil_vinegar_sugar_stock'),
    ('올리브유', '양념', 'oil_vinegar_sugar_stock'),
    ('설탕', '양념', 'oil_vinegar_sugar_stock'),
    ('김치', '기타', 'kimchi_pickle_can')
)
update public.ingredients as ingredients
set
  category = category_mapping.legacy_category,
  category_code = category_mapping.category_code
from category_mapping
where ingredients.standard_name = category_mapping.standard_name
  and (
    ingredients.category is distinct from category_mapping.legacy_category
    or ingredients.category_code is distinct from category_mapping.category_code
  );

create table if not exists public.cooking_method_categories (
  code varchar(50) primary key,
  label varchar(50) not null unique,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.cooking_methods
  alter column label type varchar(20);

alter table public.cooking_methods
  add column if not exists category_code varchar(50);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cooking_methods_category_code_fkey'
  ) then
    alter table public.cooking_methods
      add constraint cooking_methods_category_code_fkey
      foreign key (category_code)
      references public.cooking_method_categories(code);
  end if;
end;
$$;

create index if not exists cooking_methods_category_code_idx
  on public.cooking_methods (category_code);

create table if not exists public.cooking_method_synonyms (
  id uuid primary key default gen_random_uuid(),
  method_code varchar(20) not null references public.cooking_methods(code) on delete cascade,
  synonym varchar(50) not null,
  match_kind varchar(20) not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint cooking_method_synonyms_match_kind_check
    check (match_kind in ('exact', 'contains', 'regex')),
  unique (method_code, synonym)
);

create index if not exists cooking_method_synonyms_synonym_idx
  on public.cooking_method_synonyms (synonym);

insert into public.cooking_method_categories (code, label, display_order, is_active)
values
  ('prep_handling', '준비/손질', 10, true),
  ('preprocessing', '전처리', 20, true),
  ('moist_heat', '물/수분 조리', 30, true),
  ('pan_oil', '팬/기름 조리', 40, true),
  ('mix_braise', '혼합/조림', 50, true),
  ('appliance', '기기 조리', 60, true)
on conflict (code) do update set
  label = excluded.label,
  display_order = excluded.display_order,
  is_active = excluded.is_active;

insert into public.cooking_methods (
  code,
  label,
  color_key,
  category_code,
  is_system,
  display_order
)
values
  ('slice', '썰기', 'gray', 'prep_handling', true, 10),
  ('mince', '다지기', 'gray', 'prep_handling', true, 20),
  ('thaw', '해동', 'gray', 'preprocessing', true, 30),
  ('pre_season', '밑간', 'green', 'preprocessing', true, 40),
  ('pickle', '절이기', 'green', 'preprocessing', true, 50),
  ('boil', '끓이기', 'red', 'moist_heat', true, 60),
  ('parboil', '삶기', 'red', 'moist_heat', true, 70),
  ('blanch', '데치기', 'lime', 'moist_heat', true, 80),
  ('steam', '찌기', 'blue', 'moist_heat', true, 90),
  ('stir_fry', '볶기', 'orange', 'pan_oil', true, 100),
  ('grill', '굽기', 'brown', 'pan_oil', true, 110),
  ('pan_fry', '부치기', 'yellow', 'pan_oil', true, 120),
  ('deep_fry', '튀기기', 'yellow', 'pan_oil', true, 130),
  ('mix', '섞기', 'gray', 'mix_braise', true, 140),
  ('toss', '무치기', 'green', 'mix_braise', true, 150),
  ('braise', '조리기', 'red', 'mix_braise', true, 160),
  ('reduce', '졸이기', 'red', 'mix_braise', true, 170),
  ('microwave', '전자레인지', 'gray', 'appliance', true, 180),
  ('oven_bake', '오븐굽기', 'brown', 'appliance', true, 190),
  ('air_fryer', '에어프라이어', 'yellow', 'appliance', true, 200)
on conflict (code) do update set
  label = excluded.label,
  color_key = excluded.color_key,
  category_code = excluded.category_code,
  is_system = excluded.is_system,
  display_order = excluded.display_order;

insert into public.cooking_method_synonyms (method_code, synonym, match_kind, is_active)
values
  ('slice', '채썰기', 'exact', true),
  ('slice', '잘라요', 'contains', true),
  ('mince', '곱게 다지기', 'contains', true),
  ('pre_season', '재우기', 'exact', true),
  ('pre_season', '밑간해', 'contains', true),
  ('boil', '끓여요', 'contains', true),
  ('parboil', '삶아요', 'contains', true),
  ('steam', '쪄요', 'contains', true),
  ('stir_fry', '팬에 볶기', 'contains', true),
  ('grill', '노릇하게', 'contains', true),
  ('pan_fry', '부쳐요', 'contains', true),
  ('deep_fry', '튀겨요', 'contains', true),
  ('toss', '버무리기', 'exact', true),
  ('braise', '조려요', 'contains', true),
  ('reduce', '졸여요', 'contains', true),
  ('microwave', '전자렌지', 'exact', true),
  ('oven_bake', '오븐', 'contains', true),
  ('air_fryer', '에어프라이어에', 'contains', true)
on conflict (method_code, synonym) do update set
  match_kind = excluded.match_kind,
  is_active = excluded.is_active;

create or replace function public.register_youtube_ingredient(
  p_standard_name text,
  p_category text,
  p_category_code text,
  p_default_unit text,
  p_synonym text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_standard_name text := regexp_replace(trim(coalesce(p_standard_name, '')), '[[:space:]]+', ' ', 'g');
  v_category text := trim(coalesce(p_category, ''));
  v_category_code text := nullif(trim(coalesce(p_category_code, '')), '');
  v_default_unit text := nullif(trim(coalesce(p_default_unit, '')), '');
  v_synonym text := nullif(lower(trim(coalesce(p_synonym, ''))), '');
  v_ingredient public.ingredients%rowtype;
  v_synonym_status text := 'not_requested';
  v_warnings text[] := array[]::text[];
  v_inserted_count integer := 0;
begin
  if v_category_code is not null then
    select code, legacy_category
      into v_category_code, v_category
      from public.ingredient_categories
      where code = v_category_code
        and is_active = true;

    if not found then
      raise exception 'invalid ingredient registration input';
    end if;
  elsif v_category not in ('채소', '과일', '육류', '해산물', '양념', '유제품', '곡류', '기타') then
    raise exception 'invalid ingredient registration input';
  else
    v_category_code := case v_category
      when '채소' then 'root_stem'
      when '과일' then 'fruit'
      when '육류' then 'pork_beef_lamb'
      when '해산물' then 'fish_shellfish_crustacean'
      when '양념' then 'paste_sauce'
      when '유제품' then 'milk_yogurt_cream'
      when '곡류' then 'rice_meal'
      else 'frozen_ready_drink_other'
    end;
  end if;

  if v_standard_name = ''
    or char_length(v_standard_name) > 100
    or coalesce(p_standard_name, '') ~ '[[:cntrl:]]'
    or (v_default_unit is not null and char_length(v_default_unit) > 20)
    or (coalesce(p_default_unit, '') ~ '[[:cntrl:]]')
    or (v_synonym is not null and char_length(v_synonym) > 100)
    or (coalesce(p_synonym, '') ~ '[[:cntrl:]]')
  then
    raise exception 'invalid ingredient registration input';
  end if;

  insert into public.ingredients (standard_name, category, category_code, default_unit)
  values (v_standard_name, v_category, v_category_code, v_default_unit)
  on conflict (standard_name) do nothing;

  select *
    into v_ingredient
    from public.ingredients
    where standard_name = v_standard_name;

  if not found then
    raise exception 'ingredient registration failed';
  end if;

  if v_ingredient.category_code is null then
    update public.ingredients
      set category = v_category,
          category_code = v_category_code
      where id = v_ingredient.id
      returning * into v_ingredient;
  end if;

  if v_synonym is null then
    v_synonym_status := 'not_requested';
  elsif lower(trim(v_synonym)) = lower(trim(v_ingredient.standard_name)) then
    v_synonym_status := 'skipped_same_as_standard';
  elsif exists (
    select 1
    from public.ingredient_synonyms
    where synonym = v_synonym
      and ingredient_id <> v_ingredient.id
  ) then
    v_synonym_status := 'skipped_ambiguous';
    v_warnings := array_append(v_warnings, '같은 동의어가 다른 재료에 이미 연결되어 동의어 저장을 건너뛰었어요.');
  else
    insert into public.ingredient_synonyms (ingredient_id, synonym)
    values (v_ingredient.id, v_synonym)
    on conflict (ingredient_id, synonym) do nothing;

    get diagnostics v_inserted_count = row_count;
    if v_inserted_count = 0 then
      v_synonym_status := 'already_attached';
    else
      v_synonym_status := 'attached';
    end if;
  end if;

  return jsonb_build_object(
    'ingredient_id', v_ingredient.id,
    'standard_name', v_ingredient.standard_name,
    'category', v_ingredient.category,
    'category_code', v_ingredient.category_code,
    'default_unit', v_ingredient.default_unit,
    'synonym_status', v_synonym_status,
    'warnings', to_jsonb(v_warnings)
  );
end;
$$;

create or replace function public.register_youtube_ingredient(
  p_standard_name text,
  p_category text,
  p_default_unit text,
  p_synonym text
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select public.register_youtube_ingredient(
    p_standard_name,
    p_category,
    null,
    p_default_unit,
    p_synonym
  );
$$;

grant select on public.ingredient_category_groups to anon, authenticated;
grant select on public.ingredient_categories to anon, authenticated;
grant select on public.cooking_method_categories to anon, authenticated;
grant select on public.cooking_method_synonyms to anon, authenticated;

grant execute on function public.register_youtube_ingredient(
  text,
  text,
  text,
  text,
  text
) to authenticated, service_role;

grant execute on function public.register_youtube_ingredient(
  text,
  text,
  text,
  text
) to authenticated, service_role;
