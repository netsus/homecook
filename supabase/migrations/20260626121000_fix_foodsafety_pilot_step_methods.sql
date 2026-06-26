-- Reclassify FoodSafety pilot recipe steps by each step instruction.
-- The source API provides a recipe-level method only, so the first seed copied
-- that method to every step. This follow-up keeps the 30 reviewed pilot recipes
-- but assigns more useful per-step method tags for recipe detail/cook mode UI.

with inferred_steps as (
  select
    step.id as step_id,
    case
      when step.instruction ~ '튀기|튀김' then '튀기기'
      when step.instruction ~ '오븐' then '오븐굽기'
      when step.instruction ~ '찜기|찜통|찐다|쪄|쪄낸|쪄 낸|찐' then '찌기'
      when step.instruction ~ '데치|데쳐|데친' then '데치기'
      when step.instruction ~ '삶' then '삶기'
      when step.instruction ~ '부침|부쳐|부치' then '부치기'
      when step.instruction ~ '굽|구운|그릴' then '굽기'
      when step.instruction ~ '볶' then '볶기'
      when step.instruction ~ '졸인|졸인다' then '졸이기'
      when step.instruction ~ '끓|한소끔|한 소큼' then '끓이기'
      when step.instruction ~ '마리네이드|밑간|간 한다|간을 해' then '밑간'
      when step.instruction ~ '절여|절인|소금에.*절|담가|담구' then '절이기'
      when step.instruction ~ '다지|다진|송송' then '다지기'
      when step.instruction ~ '버무|무치' then '무치기'
      when step.instruction ~ '채 썰|채를 썰|썰|자른|자르고|칼집|가른|포를 떠|손질|껍질|꼭지|씨를 제거|물기|씻' then '썰기'
      when step.instruction ~ '섞|혼합|소스|드레싱|양념속|소를 만들|반죽|갈아|갈고|넣고.*만들|담고|완성|곁들' then '섞기'
      else current_method.label
    end as method_label
  from public.recipe_steps step
  join public.recipe_sources source on source.recipe_id = step.recipe_id
  join public.cooking_methods current_method on current_method.id = step.cooking_method_id
  where source.extraction_meta_json->>'reviewed_scope' = 'pilot_30_user_reviewed'
)
update public.recipe_steps step
   set cooking_method_id = method.id
  from inferred_steps inferred
  join public.cooking_methods method on method.label = inferred.method_label
 where step.id = inferred.step_id
   and step.cooking_method_id <> method.id;

do $$
declare
  v_step_count integer;
  v_distinct_method_count integer;
begin
  select count(*), count(distinct method.label)
    into v_step_count, v_distinct_method_count
    from public.recipe_steps step
    join public.recipe_sources source on source.recipe_id = step.recipe_id
    join public.cooking_methods method on method.id = step.cooking_method_id
   where source.extraction_meta_json->>'reviewed_scope' = 'pilot_30_user_reviewed';

  if v_step_count <> 146 then
    raise exception 'FoodSafety pilot step method fix expected 146 steps, got %', v_step_count;
  end if;

  if v_distinct_method_count < 8 then
    raise exception 'FoodSafety pilot step method fix expected diversified methods, got %', v_distinct_method_count;
  end if;
end $$;
