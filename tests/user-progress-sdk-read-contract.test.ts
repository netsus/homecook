import { createClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { readUserProgress, type UserProgressDbClient } from "@/lib/server/user-progress";

describe("native progress read contract", () => {
  it("accepts the actual default SDK without a type assertion", () => {
    const sdk = createClient("http://progress-read.invalid", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const client: UserProgressDbClient = sdk;
    expect(client).toBe(sdk);
  });

  it.each(["owner", "550e8400-e29b-41d4-a716-446655440001", "owner+with&symbols"])(
    "preserves exactly the existing selected columns and owner filter (%s)", async owner => {
      const requests: Array<{ url: URL; method: string }> = [];
      const sdk = createClient("http://progress-read.invalid", "fixture", {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { fetch: async (input, init) => {
          const url = new URL(input instanceof Request ? input.url : String(input));
          requests.push({ url, method: init?.method ?? "GET" });
          return new Response(JSON.stringify({ user_id: owner, total_xp: 60, current_level: 1,
            level_curve_version: "v2", event_counts: {}, last_event_at: null,
            last_updated_at: "2026-10-19T00:00:00Z" }), {
            headers: { "content-type": "application/json" },
          });
        } },
      });
      const client: UserProgressDbClient = sdk;
      expect(await readUserProgress(client, owner)).toMatchObject({
        data: { level: { total_xp: 60 } }, error: null,
      });
      expect(requests).toHaveLength(1);
      expect(requests[0].method).toBe("GET");
      const expected = sdk.from("user_progress_summary")
        .select("user_id, total_xp, current_level, level_curve_version, event_counts, last_event_at, last_updated_at")
        .eq("user_id", owner);
      const direct = await expected;
      expect(direct.error).toBeNull();
      expect(requests).toHaveLength(2);
      expect(requests[0].url.toString()).toBe(requests[1].url.toString());
      expect(Object.fromEntries(requests[0].url.searchParams)).toEqual({
        select: "user_id,total_xp,current_level,level_curve_version,event_counts,last_event_at,last_updated_at",
        user_id: `eq.${owner}`,
      });
    },
  );

  it("keeps event owner selection and summary upsert when the summary is missing", async () => {
    const requests: Array<{ url: URL; method: string; body: unknown }> = [];
    const sdk = createClient("http://progress-read.invalid", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input, init) => {
        const url = new URL(input instanceof Request ? input.url : String(input));
        const method = init?.method ?? "GET";
        const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
        requests.push({ url, method, body });
        const data = method === "POST" ? body : url.pathname.endsWith("/user_progress_events") ? [{
          event_type: "cooking_completed", source_id: "cook-1", source_key: "cooking_completed:cook-1",
          xp_delta: 60, occurred_at: "2026-10-19T00:00:00Z", source_meta_json: { xp_kind: "first" },
        }] : null;
        return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
      } },
    });
    const client: UserProgressDbClient = sdk;
    expect(await readUserProgress(client, "owner")).toMatchObject({ data: { level: { total_xp: 60 } }, error: null });
    expect(requests.map(({ url, method }) => [url.pathname.split("/").at(-1), method])).toEqual([
      ["user_progress_summary", "GET"], ["user_progress_events", "GET"], ["user_progress_summary", "POST"],
    ]);
    expect(Object.fromEntries(requests[1].url.searchParams)).toEqual({
      select: "event_type,source_id,source_key,xp_delta,occurred_at,source_meta_json", user_id: "eq.owner",
    });
    expect(requests[2].url.searchParams.get("on_conflict")).toBe("user_id");
    expect(requests[2].body).toMatchObject({ user_id: "owner", total_xp: 60, current_level: 1 });
  });

  it("preserves SDK summary errors without falling back to a read or write", async () => {
    const requests: string[] = [];
    const sdk = createClient("http://progress-read.invalid", "fixture", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (_input, init) => {
        requests.push(init?.method ?? "GET");
        return new Response(JSON.stringify({ code: "42501", message: "fixture denied" }), {
          status: 403, headers: { "content-type": "application/json" },
        });
      } },
    });
    const client: UserProgressDbClient = sdk;
    expect(await readUserProgress(client, "owner")).toMatchObject({ data: null, error: { code: "42501" } });
    expect(requests).toEqual(["GET"]);
  });
});
