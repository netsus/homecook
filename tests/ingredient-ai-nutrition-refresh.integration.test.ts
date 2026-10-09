import { execFileSync, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { describe, expect, it } from "vitest";
import { refreshIngredientAiRecipeNutrition } from "@/lib/server/ingredient-ai-nutrition-refresh";

// Explicitly opt in with the leader's ownership-validating clone module. This
// test never reads production credentials or uses runSql({ production: true }).
const dbModule = process.env.AI_NUTRITION_REFRESH_TEST_DB_MODULE;
const suite = dbModule ? describe : describe.skip;
const literal = (value: unknown) => `'${String(value).replaceAll("'", "''")}'`;
const json = (value: unknown) => `${literal(JSON.stringify(value))}::jsonb`;

class CloneSession {
  private readonly process: ChildProcessWithoutNullStreams;
  private output = "";
  private errors = "";
  private pending: { marker: string; resolve: (value: string) => void; reject: (error: Error) => void } | null = null;
  constructor(containerId: string, database: string) {
    this.process = spawn("docker", ["exec", "-i", containerId, "psql", "-h", "/tmp/pgsocket",
      "-U", "supabase_admin", "-d", database, "-XqAt", "-v", "ON_ERROR_STOP=1"]);
    this.process.stdout.setEncoding("utf8");
    this.process.stderr.setEncoding("utf8");
    this.process.stderr.on("data", (chunk: string) => { this.errors += chunk; });
    this.process.stdout.on("data", (chunk: string) => {
      this.output += chunk;
      const pending = this.pending;
      if (!pending) return;
      const end = this.output.indexOf(`${pending.marker}\n`);
      if (end < 0) return;
      const value = this.output.slice(0, end).trim();
      this.output = this.output.slice(end + pending.marker.length + 1);
      this.pending = null;
      pending.resolve(value);
    });
    this.process.on("error", (error) => { this.pending?.reject(error); this.pending = null; });
    this.process.on("exit", () => {
      this.pending?.reject(new Error(this.errors || "Isolated psql session exited"));
      this.pending = null;
    });
  }
  query(sql: string): Promise<string> {
    if (this.pending || this.process.exitCode !== null) return Promise.reject(new Error("Isolated session is unavailable"));
    return new Promise((resolve, reject) => {
      const marker = `REFRESH_${randomUUID().replaceAll("-", "")}`;
      this.pending = { marker, resolve, reject };
      this.process.stdin.write(`${sql}\n\\echo ${marker}\n`);
    });
  }
  async close() {
    if (this.process.exitCode !== null) return;
    this.process.stdin.end("\\q\n");
    await once(this.process, "exit");
  }
}

suite("real AI completion to TypeScript refresh roundtrip (isolated rollback)", () => {
  it("creates estimated profiles through the real job RPC, calculates the real bundle and stores the matching snapshot", async () => {
    const operation = await import(/* @vite-ignore */ dbModule!);
    // Reuse the mandated default clone ownership check before establishing a
    // persistent connection (runSql itself creates a new connection per call).
    const database = process.env.AI_NUTRITION_REFRESH_TEST_DATABASE ?? "postgres";
    expect(database).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
    expect(operation.runSql("select current_database();", { database }).trim()).toBe(database);
    const rehearsal = operation.metadata.rehearsal;
    const inspected = JSON.parse(execFileSync("docker", ["inspect", rehearsal.container_id], { encoding: "utf8" }))[0];
    expect(inspected.Config.Labels["homecook.ingredient-curation-test"]).toBe(rehearsal.tag);
    expect(inspected.HostConfig.NetworkMode).toBe("none");
    expect(inspected.Config.Image).toBe(rehearsal.image);
    expect(inspected.Mounts.some((mount: { Type: string }) => mount.Type === "bind")).toBe(false);
    const session = new CloneSession(rehearsal.container_id, database);
    const ingredientId = randomUUID(), recipeId = randomUUID(), rowId = randomUUID();
    const policy = `refresh-test-${randomUUID()}`;
    const rpcNames: string[] = [];
    let writtenSnapshot: Record<string, unknown> | undefined;
    const call = async (name: string, args: Record<string, unknown>) => {
      rpcNames.push(name);
      let parameters: string;
      switch (name) {
        case "claim_ingredient_ai_nutrition_job": parameters = `${literal(args.p_worker_id)},180`; break;
        case "get_ingredient_ai_nutrition_context": parameters = `${literal(args.p_job_id)}::uuid,${literal(args.p_lease_token)}::uuid`; break;
        case "complete_ingredient_ai_nutrition_job": parameters = `${literal(args.p_job_id)}::uuid,${literal(args.p_lease_token)}::uuid,${json(args.p_result)}`; break;
        case "get_ingredient_ai_recipe_refresh_input": parameters = `${literal(args.p_job_id)}::uuid,${literal(args.p_recipe_id)}::uuid`; break;
        case "write_ingredient_ai_recipe_refresh":
          writtenSnapshot = args.p_snapshot as Record<string, unknown>;
          parameters = `${literal(args.p_job_id)}::uuid,${literal(args.p_recipe_id)}::uuid,${json(args.p_snapshot)},${literal(args.p_expected_recipe_updated_at)}::timestamptz,${json(args.p_input_guard)}`;
          break;
        case "acknowledge_ingredient_ai_nutrition_refresh": parameters = `${literal(args.p_job_id)}::uuid,array[${literal(recipeId)}::uuid]`; break;
        default: throw new Error("RPC is outside the isolated test allowlist");
      }
      const text = await session.query(`set local request.path=${literal(`/rpc/${name}`)}; select public.${name}(${parameters});`);
      return { data: JSON.parse(text), error: null };
    };
    try {
      await session.query(`begin isolation level read committed;
        set local statement_timeout='30s'; set local lock_timeout='5s';
        set local idle_in_transaction_session_timeout='30s';
        set local request.jwt.claim.role='service_role'; set local request.jwt.claims='{"role":"service_role"}';
        set local request.headers='{"x-homecook-internal-scope":"ingredient-ai-nutrition"}'; set local request.method='POST';
        do $fixture$ declare v_reviewer uuid; v_cutover uuid; begin
          select id into v_reviewer from public.users where deleted_at is null order by id limit 1;
          if v_reviewer is null then raise exception 'Seeded reviewer required'; end if;
          update private.ingredient_ai_nutrition_settings set enabled=true,reviewed_by=v_reviewer,
            model_id='fixture-model',policy_version=${literal(policy)},claims_today=0 where singleton;
          select current_cutover_attempt_id into v_cutover from public.account_generation_capability_state
            where singleton and state='generation_active';
          if v_cutover is not null then perform public.set_account_generation_internal_writer_marker(v_cutover,true); end if;
          insert into public.ingredients(id,standard_name,category) values(${literal(ingredientId)}::uuid,'AI roundtrip fixture ${ingredientId}','기타');
          insert into public.recipes(id,title,source_type,created_by,visibility,base_servings)
            values(${literal(recipeId)}::uuid,'AI roundtrip fixture ${recipeId}','manual',v_reviewer,'private',2);
          insert into public.recipe_ingredients(id,recipe_id,ingredient_id,ingredient_type,amount,unit,scalable,sort_order)
            values(${literal(rowId)}::uuid,${literal(recipeId)}::uuid,${literal(ingredientId)}::uuid,'QUANT',50,'g',true,0);
          if v_cutover is not null then perform public.set_account_generation_internal_writer_marker(v_cutover,false); end if;
          update private.ingredient_ai_nutrition_jobs set available_at='1900-01-01' where ingredient_id=${literal(ingredientId)}::uuid;
        end $fixture$;`);
      const claimed = (await call("claim_ingredient_ai_nutrition_job", { p_worker_id: "refresh-integration" })).data;
      expect(claimed).toMatchObject({ status: "claimed", ingredient_id: ingredientId });
      expect(await session.query(`select status from private.ingredient_ai_nutrition_jobs where id=${literal(claimed.job_id)}::uuid;`)).toBe("processing");
      const context = (await call("get_ingredient_ai_nutrition_context", { p_job_id: claimed.job_id, p_lease_token: claimed.lease_token })).data;
      expect(context.status).toBe("ready");
      const completed = (await call("complete_ingredient_ai_nutrition_job", {
        p_job_id: claimed.job_id, p_lease_token: claimed.lease_token,
        p_result: { model: context.model, policy_version: context.policy_version, prompt_version: context.prompt_version,
          context_hash: context.context_hash, generated_at: new Date().toISOString(), basis: { amount: 100, unit: "g" },
          assumptions: ["Synthetic values for an isolated rollback test"], uncertainty: "high",
          values: { energy_kcal: 200, carbohydrate_g: 20, protein_g: 10, fat_g: 9, sodium_mg: 100,
            sugars_g: 3, saturated_fat_g: 2, fiber_g: null } },
      })).data;
      expect(completed).toMatchObject({ status: "applied", ingredient_id: ingredientId, affected_recipe_ids: [recipeId] });
      const refreshed = await refreshIngredientAiRecipeNutrition({ rpc: call }, { jobId: claimed.job_id, recipeId });
      expect(refreshed).toMatchObject({ created: true, is_current: true });
      expect(writtenSnapshot).toMatchObject({ calculation_version: "recipe-nutrition-v3", calculation_quality: "estimated",
        scalable_values: { energy_kcal: 100, carbohydrate_g: 10, protein_g: 5, fat_g: 4.5, sodium_mg: 50 },
        warnings: ["AI_NUTRITION_ESTIMATE_USED"] });
      const stored = JSON.parse(await session.query(`select jsonb_build_object(
        'hash',snapshot.input_hash,'quality',snapshot.calculation_quality,'sources',snapshot.sources_json,
        'warnings',snapshot.warnings_json,'values',snapshot.nutrient_status_json,
        'statuses',(select jsonb_object_agg(nutrient_code,value_status) from public.nutrition_values where profile_id=${literal(completed.profile_id)}::uuid),
        'pending',(select ${literal(recipeId)}::uuid=any(pending_recipe_ids) from private.ingredient_ai_nutrition_jobs where id=${literal(claimed.job_id)}::uuid))
        from public.recipe_nutrition_snapshots snapshot where id=${literal(refreshed.snapshot_id)}::uuid;`));
      expect(stored.hash).toBe(writtenSnapshot!.input_hash);
      expect(stored.quality).toBe("estimated");
      expect(stored.sources).toEqual(writtenSnapshot!.sources);
      expect(stored.statuses).toMatchObject({ energy_kcal: "estimated", sodium_mg: "estimated", fiber_g: "missing" });
      expect(stored.values.energy_kcal.amount).toBe(100);
      expect(stored.pending).toBe(true);
      const again = await refreshIngredientAiRecipeNutrition({ rpc: call }, { jobId: claimed.job_id, recipeId });
      expect(again).toMatchObject({ snapshot_id: refreshed.snapshot_id, created: false });
      const ack = (await call("acknowledge_ingredient_ai_nutrition_refresh", { p_job_id: claimed.job_id })).data;
      expect(ack).toMatchObject({ status: "acknowledged", remaining: 0 });
      expect(rpcNames).not.toContain("write_recipe_nutrition_snapshot");
    } finally {
      await session.query("rollback;").catch(() => undefined);
      await session.close();
    }
    const count = operation.runSql(`select count(*) from public.ingredients where id=${literal(ingredientId)}::uuid;`, { database }).trim();
    expect(count).toBe("0");
  }, 45000);
});
