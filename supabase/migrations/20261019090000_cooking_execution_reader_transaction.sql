-- POST RPCs declared STABLE run in a read-only PostgREST transaction.
-- The reader's unchanged session-authority checks acquire row locks.
-- Keep those checks and the original migration; allow their locking transaction.
begin;
alter function public.read_cooking_execution_quantities(
  uuid, timestamptz, text, integer, timestamptz, uuid, timestamptz
) volatile;
commit;
