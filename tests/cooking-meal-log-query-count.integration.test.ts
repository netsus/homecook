import { writeFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  measureQueryCountGrowth,
} from "../scripts/lib/cooking-meal-log-release-evidence.mjs";

const enabled = process.env.HOMECOOK_CML14_QUERY_COUNT === "1";
const outputPath = process.env.HOMECOOK_CML14_QUERY_COUNT_OUTPUT ?? "";
let activeRecorder: (() => void) | null = null;

const routeClient = {
  auth: {
    getUser: vi.fn(async () => ({
      data: { user: { id: "c1000000-0000-4000-8000-000000000001" } },
    })),
  },
  rpc: vi.fn(async (_name: string, args: Record<string, unknown>) => {
    activeRecorder?.();
    const limit = Number(args.p_limit ?? 0);
    return {
      data: {
        items: Array.from({ length: limit }, (_, index) => ({
          id: `measured-${index + 1}`,
          type: "ingredient",
        })),
        has_next: false,
        next_cursor_tuple: null,
      },
      error: null,
    };
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createRouteHandlerClient: vi.fn(async () => routeClient),
}));

describe.runIf(enabled)("#14 actual route query-count evidence", () => {
  it("measures 1-item and 20-item service-boundary calls", async () => {
    expect(outputPath).toMatch(/query-count-measurement\.json$/u);
    const { GET } = await import("@/app/api/v1/food-catalog/search/route");
    const measurement = await measureQueryCountGrowth({
      surface: "food-catalog-search-route",
      execute: async (size: number, recordQuery: () => void) => {
        activeRecorder = recordQuery;
        try {
          const response = await GET(new Request(
            "http://localhost/api/v1/food-catalog/search"
              + `?q=test&types=ingredient,food_product&limit=${size}`,
          ));
          expect(response.status).toBe(200);
          const body = await response.json();
          expect(body.success).toBe(true);
          expect(body.data.items).toHaveLength(size);
        } finally {
          activeRecorder = null;
        }
      },
    });

    expect(measurement).toMatchObject({
      list1_query_count: 1,
      list20_query_count: 1,
      item_level_n_plus_one: 0,
    });
    writeFileSync(
      outputPath,
      `${JSON.stringify({
        measurement_kind: "actual-route-service-boundary",
        checks: [measurement],
      }, null, 2)}\n`,
      { encoding: "utf8", flag: "wx", mode: 0o600 },
    );
  });
});
