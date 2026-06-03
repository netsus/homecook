-- Keep recipe tags short enough to behave like scan-friendly labels.
update public.recipes as r
   set tags = coalesce((
         select array_agg(btrim(existing_tags.tag) order by existing_tags.ordinality)
           from unnest(r.tags) with ordinality as existing_tags(tag, ordinality)
          where btrim(existing_tags.tag) <> ''
            and char_length(btrim(existing_tags.tag)) <= 12
       ), '{}'::text[]),
       updated_at = now()
 where exists (
         select 1
           from unnest(r.tags) as existing_tags(tag)
          where btrim(existing_tags.tag) = ''
             or char_length(btrim(existing_tags.tag)) > 12
       );

update public.youtube_extraction_sessions as s
   set draft_json = jsonb_set(
         s.draft_json,
         '{tags}',
         coalesce((
           select jsonb_agg(to_jsonb(btrim(draft_tags.tag)) order by draft_tags.ordinality)
             from jsonb_array_elements_text(s.draft_json -> 'tags')
               with ordinality as draft_tags(tag, ordinality)
            where btrim(draft_tags.tag) <> ''
              and char_length(btrim(draft_tags.tag)) <= 12
         ), '[]'::jsonb),
         true
       ),
       updated_at = now()
 where jsonb_typeof(s.draft_json -> 'tags') = 'array'
   and exists (
         select 1
           from jsonb_array_elements_text(s.draft_json -> 'tags') as draft_tags(tag)
          where btrim(draft_tags.tag) = ''
             or char_length(btrim(draft_tags.tag)) > 12
       );
