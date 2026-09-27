-- Directly authored public recipes remain manageable by their owner. A fork is
-- still private, and another person's public recipe only exposes fork context.
begin;
do $manual_owner_context$
declare
  v_definition text := pg_get_functiondef('public.read_recipe_snapshot_entrypoint_context(uuid,timestamptz,text,integer,timestamptz,uuid)'::regprocedure);
  v_old text := $old$      when recipe.created_by = p_owner_uuid
        and recipe.visibility = 'private'
        then 'edit_context'$old$;
  v_new text := $new$      when recipe.created_by = p_owner_uuid
        and (recipe.visibility = 'private' or (
          recipe.visibility = 'public' and recipe.source_type = 'manual'
          and recipe.origin_recipe_id is null
        ))
        then 'edit_context'$new$;
begin
  if strpos(v_definition, v_new) > 0 then return; end if;
  if (length(v_definition)-length(replace(v_definition,v_old,'')))/length(v_old) <> 1 then
    raise exception 'MANUAL_PUBLIC_OWNER_CONTEXT_SOURCE_DRIFT';
  end if;
  -- Preserve the existing session verifier, visibility/deletion predicate,
  -- rollout flags, owner-only private image IDs, grants and function signature.
  execute replace(v_definition,v_old,v_new);
end;
$manual_owner_context$;
notify pgrst, 'reload schema';
commit;
