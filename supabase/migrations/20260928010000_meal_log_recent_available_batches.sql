begin;

-- Recent foods must not offer consumed/discarded cooked batches, including
-- historical batches whose weight ledger has not been initialized. Leave
-- existing meal entries and their nutrition/quantity history untouched.
do $repair_recent_batches$
declare
  definition text := pg_get_functiondef('public.get_recent_meal_log_sources(uuid,timestamptz,text,integer,timestamptz,integer,date,uuid)'::regprocedure);
  old_clause text := 'batch.id=entry.cooked_batch_id and batch.user_id=p_owner_uuid)';
  new_clause text := 'batch.id=entry.cooked_batch_id and batch.user_id=p_owner_uuid and batch.status=''leftover'' and batch.batch_status is distinct from ''depleted'')';
begin
  if (length(definition) - length(replace(definition, old_clause, ''))) / length(old_clause) <> 1 then
    raise exception 'RECENT_MEAL_LOG_BATCH_FILTER_SHAPE_CHANGED';
  end if;
  execute replace(definition, old_clause, new_clause);
end;
$repair_recent_batches$;

commit;
