import { performance } from "node:perf_hooks";

import { describe, expect, it, vi } from "vitest";

const enabled =
  process.env.HOMECOOK_PREPARED_FOOD_SEARCH_ROUTE_PERFORMANCE === "1";
const postgrestUrl =
  process.env.HOMECOOK_PREPARED_FOOD_SEARCH_POSTGREST_URL ?? "";
const serviceToken =
  process.env.HOMECOOK_PREPARED_FOOD_SEARCH_SERVICE_TOKEN ?? "";
const actorId =
  process.env.HOMECOOK_PREPARED_FOOD_SEARCH_ACTOR_ID ?? "";

const routeClient = {
  auth: {
    getUser: vi.fn(async () => ({
      data: { user: actorId ? { id: actorId } : null },
    })),
  },
  rpc: vi.fn(),
};

const serviceClient = {
  async rpc(name: string, args: Record<string, unknown>) {
    const response = await fetch(`${postgrestUrl}/rpc/${name}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${serviceToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args),
    });
    const body = await response.json();
    if (!response.ok) {
      return {
        data: null,
        error: {
          code: String(body?.code ?? response.status),
          message: String(body?.message ?? "PostgREST RPC failed"),
        },
      };
    }
    return { data: body, error: null };
  },
};

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient: vi.fn(async () => routeClient),
  createServiceRoleClient: vi.fn(() => serviceClient),
}));

function percentile95(values: number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Infinity;
}

describe.runIf(enabled)("prepared food search route performance", () => {
  it("keeps authenticated route-core p95 within 600ms on the full denominator", async () => {
    expect(postgrestUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(actorId).toMatch(/^[0-9a-f-]{36}$/i);

    const { GET } = await import(
      "@/app/api/v1/food-catalog/search/route"
    );
    const requestUrl =
      "http://localhost/api/v1/food-catalog/search"
      + "?q=%EC%97%B0%EC%84%B8%ED%81%AC%EB%A6%BC%EB%B9%B5"
      + "&types=ingredient,food_product&limit=20";

    const coldStartedAt = performance.now();
    const coldResponse = await GET(new Request(requestUrl));
    const coldBody = await coldResponse.json();
    const coldDuration = performance.now() - coldStartedAt;
    expect(coldResponse.status).toBe(200);
    expect(coldBody.success).toBe(true);

    for (let warmup = 0; warmup < 5; warmup += 1) {
      const response = await GET(new Request(requestUrl));
      expect(response.status).toBe(200);
    }

    const durations: number[] = [];
    for (let sample = 0; sample < 20; sample += 1) {
      const startedAt = performance.now();
      const response = await GET(new Request(requestUrl));
      const body = await response.json();
      durations.push(performance.now() - startedAt);
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
    }

    const p95 = percentile95(durations);
    process.stdout.write(
      `prepared-food-search route cold=${coldDuration.toFixed(2)}ms `
        + `p95=${p95.toFixed(2)}ms samples=${durations.length}\n`,
    );
    expect(p95).toBeLessThanOrEqual(600);
  }, 120_000);
});
