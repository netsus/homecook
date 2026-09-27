import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

const projectId = process.env.HOMECOOK_ISOLATED_RUNTIME_PROJECT_ID?.trim();
const databaseUrl = process.env.HOMECOOK_ISOLATED_RUNTIME_DATABASE_URL?.trim();
const container = `supabase_db_${projectId}`;
const owner = "8c000000-0000-4000-8000-000000000001";
const other = "8c000000-0000-4000-8000-000000000002";
const signature = "public.search_food_catalog_ranked(uuid,text,text[],text,integer,jsonb,text,integer)";
const migration = "supabase/migrations/20260922040000_food_catalog_search_candidates.sql";
const addedPredicate = `
              and public.normalize_food_search_text(
                coalesce(product.brand::text || ' ', '') || product.name::text,
                true
              ) OPERATOR(public.%>) v_compact_query`;
let baselineDefinition: string;

function psql(sql: string) {
  const result = spawnSync("docker", [
    "exec", "-i", container, "psql", "-X", "-U", "supabase_admin", "-d", "postgres",
    "-Atq", "-v", "ON_ERROR_STOP=1",
  ], { input: sql, encoding: "utf8", timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
// Direct isolated SQL follows the suite's admin transport, while the function's
// actor guard reads this synthetic caller. Do not widen the replay's RPC ACL.
const asOwner = `set local request.jwt.claims = '{"role":"authenticated","sub":"${owner}"}';`;
const search = (q: string, source = "null", types = "array['food_product']", cursor = "null", version = "null", limit = 20) =>
  `public.search_food_catalog_ranked('${owner}',${quote(q)},${types},${source},${version},${cursor},repeat('a',64),${limit})`;
const withVersion = (baseline: boolean, query: string) => psql(`begin;
  ${baseline ? baselineDefinition : ""}
  ${asOwner}
  set local enable_seqscan=off;
  set local pg_trgm.word_similarity_threshold='0.95';
  ${query}
  rollback;`);

// Every resource belongs to the runner's fresh hcg target. No production URL is
// accepted; fixtures are synthetic and disappear when the owned cluster stops.
describe.skipIf(!projectId && !databaseUrl)("food search indexed candidate admission", () => {
  beforeAll(() => {
    expect(projectId).toMatch(/^hcg_\d+_[a-f0-9]{6}$/u);
    expect(databaseUrl).toMatch(/^postgresql:\/\/[^@\s]+@(?:127\.0\.0\.1|\[::1\]):\d+\/postgres$/u);
    const inspected = spawnSync("docker", ["inspect", container], { encoding: "utf8", timeout: 10_000 });
    expect(inspected.status, inspected.stderr).toBe(0);
    const [state] = JSON.parse(inspected.stdout);
    expect(state.Config.Labels["com.docker.compose.project"]).toBe(projectId);
    expect(state.NetworkSettings.Ports["5432/tcp"]?.map((port: { HostPort: string }) => port.HostPort))
      .toContain(new URL(databaseUrl!).port);

    const definition = psql(`select pg_get_functiondef('${signature}'::regprocedure);`);
    expect(definition.split(addedPredicate)).toHaveLength(3);
    baselineDefinition = definition.replaceAll(addedPredicate, "")
      .replace(/^ SET "?pg_trgm\.word_similarity_threshold"? TO '0\.3'\n/mu, "") + ";";
    expect(baselineDefinition).not.toContain("OPERATOR(public.%>)");
    expect(baselineDefinition).not.toContain("word_similarity_threshold");

    psql(`begin;
      set local request.jwt.claim.role='service_role';
      set local request.jwt.claims='{"role":"service_role","sub":"${owner}"}';
      set constraints all deferred;
      insert into auth.users(id,created_at,email) values
        ('${owner}','2026-01-01','candidate-a@example.invalid'),
        ('${other}','2026-01-01','candidate-b@example.invalid');
      insert into public.users(id,nickname,social_provider,social_id) values
        ('${owner}','candidate-a','google','candidate-a'),
        ('${other}','candidate-b','google','candidate-b');
      insert into public.ingredients(id,standard_name,category,default_unit)
        values ('8c000000-0000-4000-8000-000000000003','검색검증 치즈','유제품','g');
      do $fixture$
      declare i integer; product uuid; version_id uuid; profile uuid; actor uuid; title text;
      begin
        for i in 1..438 loop
          product:=gen_random_uuid(); version_id:=gen_random_uuid(); profile:=gen_random_uuid();
          actor:=case when i=433 then '${other}'::uuid else '${owner}'::uuid end;
          title:=case when i<=430 then '후보한도 치즈'
            when i between 431 and 435 then '곰곰 모짜렐라 치즈'
            when i=436 then 'ｍｉｌｋ １２３'
            when i=437 then 'ACME oat-milk' else 'cream cheeze' end;
          insert into public.food_products(id,owner_user_id,visibility,source_type,moderation_status,
            name,current_nutrition_version_id,created_at,deleted_at)
          values(product,actor,case when i in (432,433) then 'private' else 'public' end,'manual',
            case when i=434 then 'hidden_by_operator' else 'visible' end,title,version_id,
            '2026-01-01',case when i=435 then '2026-01-02'::timestamptz else null end);
          insert into public.nutrition_profiles(id,profile_kind,normalization_method,basis_amount,basis_unit,
            version,review_status,is_active,created_by)
          values(profile,'product_label','as_labeled',100,'g',1,'self_reported',true,actor);
          perform public.insert_manual_food_product_values(profile,
            '{"energy_kcal":80,"carbohydrate_g":6,"protein_g":5,"fat_g":4,"sodium_mg":20}');
          insert into public.food_product_nutrition_versions(id,product_id,nutrition_profile_id,version,
            basis_relations_json,created_by) values(version_id,product,profile,1,'[]',actor);
        end loop;
      end $fixture$;
      commit;
      analyze public.food_products;
    `);
  });

  it("preserves exact payloads and ranking for short, spaced, compact, typo and NFKC queries", () => {
    const queries = ["곰", "곰곰", "곰곰 치즈", "곰곰치즈", "치즈", "milk123", "ACME oat", "cream cheese", "zznoresult", ""];
    const sql = `select jsonb_agg(${search("", "null", "array['ingredient','food_product']").replace("''", "q")}
      order by q) from (values ${queries.map(q => `(${quote(q)})`).join(",")}) input(q);`;
    expect(JSON.parse(withVersion(false, sql))).toEqual(JSON.parse(withVersion(true, sql)));
  });

  it("preserves the capped candidate set, tied ranks and all v2 cursor pages above 400 matches", () => {
    const sql = `do $compare$
      declare page jsonb; cursor jsonb:=null; version integer:=null; pages jsonb:='[]';
      begin
        for i in 1..9 loop
          page:=${search("후보한도 치즈", "null", "array['food_product']", "cursor", "version", 50)};
          pages:=pages||jsonb_build_array(page);
          exit when not (page->>'has_next')::boolean;
          cursor:=page->'next_cursor_tuple'; version:=2;
        end loop;
        perform set_config('candidate_test.pages',pages::text,true);
      end $compare$;
      select current_setting('candidate_test.pages');`;
    const current = JSON.parse(withVersion(false, sql)) as Array<{ items: unknown[]; has_next: boolean }>;
    expect(current.reduce((sum, page) => sum + page.items.length, 0)).toBe(400);
    expect(current.at(-1)?.has_next).toBe(false);
    expect(current).toEqual(JSON.parse(withVersion(true, sql)));
  });

  it("retains public/community/mine scope and excludes another account, hidden and deleted products", () => {
    const sql = `select jsonb_build_object('all',${search("곰곰 치즈")},
      'community',${search("곰곰 치즈", "'community'")},'mine',${search("곰곰 치즈", "'mine'")},
      'public',${search("곰곰 치즈", "'public'")});`;
    const current = JSON.parse(withVersion(false, sql));
    expect(current.all.items).toHaveLength(2);
    expect(current.community.items).toHaveLength(1);
    expect(current.mine.items).toHaveLength(1);
    expect(current.public.items).toHaveLength(0);
    expect(current).toEqual(JSON.parse(withVersion(true, sql)));
    psql(`begin; ${asOwner}
      do $denied$ begin
        begin perform public.search_food_catalog_ranked('${other}','치즈',array['food_product'],null,null,null,repeat('a',64),20);
          raise exception 'foreign actor accepted';
        exception when raise_exception then if sqlerrm<>'FORBIDDEN' then raise; end if; end;
      end $denied$; rollback;`);
  });

  it("keeps strict threshold admission for a broad string corpus and restores the caller threshold", () => {
    const result = JSON.parse(psql(`begin; set local pg_trgm.word_similarity_threshold='0.3';
      with corpus as (select value from (values ('곰곰치즈'),('곰곰모짜렐라치즈'),('치즈'),('creamcheese'),
        ('creamcheeze'),('abc'),('abcd'),('xyzabc'),('oatmilk'),('milk'),('abc def')) x(value)
        union all select substr(md5(i::text),1,3+(i%12)) from generate_series(1,80) i),
      pairs as (select a.value as needle,b.value as document,public.word_similarity(a.value,b.value) as score
        from corpus a cross join corpus b)
      select jsonb_build_object('mismatches',count(*) filter(where (score>0.3) is distinct from
          (score>0.3 and document OPERATOR(public.%>) needle)),
        'near_boundary',count(*) filter(where score between 0.25 and 0.35)) from pairs;
      rollback;`));
    expect(result.mismatches).toBe(0);
    expect(result.near_boundary).toBeGreaterThan(0);
    expect(withVersion(false, `select (${search("곰곰 치즈")}->'items') is not null;
      select current_setting('pg_trgm.word_similarity_threshold');`).split("\n").at(-1)).toBe("0.95");
  });

  it("preserves v1 product cursors and immutable nutrition payloads", () => {
    const sql = `with first_page as (select ${search("후보한도 치즈", "'community'", "array['food_product']", "null", "null", 2)} as result)
      select ${search("후보한도 치즈", "'community'", "array['food_product']",
    "jsonb_build_object('created_at',result->'next_cursor_tuple'->>'created_at','stable_id',result->'next_cursor_tuple'->>'stable_id')", "1", 2)}
      from first_page;`;
    expect(JSON.parse(withVersion(false, sql))).toEqual(JSON.parse(withVersion(true, sql)));
  });

  it("is idempotent and leaves the guarded YouTube catalog fingerprint unchanged", () => {
    const fingerprint = (baseline: boolean) => psql(`begin; ${baseline ? baselineDefinition : ""}
      set local request.jwt.claims='{"role":"authenticated","sub":"${owner}"}';
      select public.read_youtube_extraction_enqueue_readiness()->>'catalog_fingerprint'; rollback;`);
    const before = fingerprint(true);
    expect(fingerprint(false)).toBe(before);
    const definition = psql(`select pg_get_functiondef('${signature}'::regprocedure);`);
    psql(readFileSync(migration, "utf8"));
    expect(psql(`select pg_get_functiondef('${signature}'::regprocedure);`)).toBe(definition);
    expect(fingerprint(false)).toBe(before);
  });
});
