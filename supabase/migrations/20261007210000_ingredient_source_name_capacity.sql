-- Preserve full official source names used by reviewed nutrition matching.
-- Only the synonym capacity changes; ingredient identities and matching rules
-- stay unchanged. search_name is the existing last column, so re-adding it
-- preserves the public column order and its original generated expression.
begin;

-- Its two dependent search indexes are removed with the generated column.
-- RESTRICT rejects unexpected external dependencies instead of removing them.
alter table public.ingredient_synonyms
  drop column search_name restrict;

alter table public.ingredient_synonyms
  alter column synonym type varchar(512);

alter table public.ingredient_synonyms
  add column search_name text
    generated always as (public.normalize_ingredient_search_name(synonym)) stored;

create index ingredient_synonyms_search_name_idx
  on public.ingredient_synonyms (search_name, ingredient_id);
create index ingredient_synonyms_search_name_trgm_idx
  on public.ingredient_synonyms using gin (search_name gin_trgm_ops);

commit;
