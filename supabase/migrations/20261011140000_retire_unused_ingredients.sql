-- Retire white cream and liquid seafood broth from current catalog selection.
-- Historical recipe rows and immutable nutrition/content snapshots retain IDs.
-- Catalog data retirement is applied by the separately reviewed data transaction.
begin;

do $ingredient_retirement$
declare
  v_before jsonb;
  v_after jsonb;
  v_definition text;
  v_acl text[];
begin
  select jsonb_build_object(
    'owner', pg_get_userbyid(p.proowner),
    'acl', to_jsonb(p.proacl),
    'config', to_jsonb(p.proconfig),
    'security_definer', p.prosecdef,
    'volatility', p.provolatile,
    'parallel', p.proparallel
  ), pg_get_functiondef(p.oid),
    array(select entry::text from unnest(p.proacl) entry order by entry::text)
  into v_before, v_definition, v_acl
  from pg_proc p
  where p.oid = 'public.is_selectable_catalog_ingredient(uuid)'::regprocedure;

  if md5(v_definition) is distinct from '9552e668d10219c6a7bdcb00a645a0fb'
    or v_before->>'owner' is distinct from 'supabase_admin'
    or v_before->>'security_definer' is distinct from 'false'
    or v_acl is distinct from array[
      'postgres=X/supabase_admin',
      'supabase_admin=X/supabase_admin',
      'youtube_extraction_worker_rpc_owner=X/supabase_admin'
    ]::text[]
  then
    raise exception 'ingredient retirement preimage mismatch';
  end if;

  execute $definition$
CREATE OR REPLACE FUNCTION public.is_selectable_catalog_ingredient(p_id uuid)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'pg_catalog', 'pg_temp'
AS $function$
  select p_id <> all (array[
    'b530cbdf-7d78-4dca-b43e-7b43a9114084', 'bfc4f826-5d6b-426d-9e26-9177eb89b086',
    '6752fedc-101f-484f-97dd-da34f1954980', 'ae9befb4-ba46-4761-922d-cef4dbad93e1',
    'c3b23d90-0cf1-4820-8be4-531eede986f1', 'fa597781-a191-45f7-a3e8-3a19931858b2',
    '3bc3fefb-c280-46fe-83fa-937ddb14f06b', '167bda6c-abdf-4057-84c1-d013ce38312f',
    'ecf31d7f-dcf9-4e02-87aa-3d41cc54f582', 'ccddaf85-4700-47f6-97cd-7c1c1b4d6b30',
    '0a128a83-b012-4197-83a2-1895b77fd882', '07694d02-8cd7-4047-ac4d-4078739c3c73',
    'dfa26343-0d41-4750-9e8f-b6cea850e188', '49488a14-bcce-41c0-8a4f-24a4691b273d',
    '5363ddb9-ee58-4b8a-884d-a84b80fd064c', '99a58a07-e130-4299-a058-3cb424edeb89',
    'fd75d45d-0d54-48c8-9b1b-04b750666c99',
    '47528b57-dc5b-4391-878a-1ded89521a60', '319d0dce-12d7-45ef-b8db-2ff521d9f89b',
    '31eac531-4b86-4c91-86ae-cc62e1f36984', '9361798b-6518-43e6-a19a-ef3328e1ab3f',
    '5a3c50a9-3c3e-4aa6-a59e-1786f4877f13', '49587faf-2b79-441a-b6da-6112381ebc6b',
    '9f094241-b1da-4481-b140-8dedcf80563a', 'cfaabb5e-482d-481b-8016-45bac54d1a01',
    '290ff750-add0-455f-a407-325b71e2d51f', 'ef4fa64d-94f6-5328-a5c2-fef92ef26ed8'
  ]::uuid[])
$function$;
  $definition$;

  select jsonb_build_object(
    'owner', pg_get_userbyid(p.proowner),
    'acl', to_jsonb(p.proacl),
    'config', to_jsonb(p.proconfig),
    'security_definer', p.prosecdef,
    'volatility', p.provolatile,
    'parallel', p.proparallel
  ) into v_after
  from pg_proc p
  where p.oid = 'public.is_selectable_catalog_ingredient(uuid)'::regprocedure;
  if v_after is distinct from v_before then
    raise exception 'ingredient retirement changed function authority';
  end if;
end;
$ingredient_retirement$;

commit;
