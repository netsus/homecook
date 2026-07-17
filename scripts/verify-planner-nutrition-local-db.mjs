#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import { readLocalSupabaseEnv } from "./lib/local-supabase-env.mjs";

const baseUrl = process.env.PLANNER_NUTRITION_LOCAL_BASE_URL ?? "http://127.0.0.1:3227";
const evidenceDir = path.join(
  process.cwd(),
  "ui/designs/evidence/planner-nutrition-summary/after/real-local-db",
);
const targetTables = [
  "users",
  "meal_plan_columns",
  "meals",
  "product_planner_entries",
  "recipe_nutrition_snapshots",
  "food_products",
  "food_product_nutrition_versions",
  "nutrition_profiles",
  "nutrition_values",
  "nutrition_source_items",
  "nutrition_sources",
];

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function digestRows(rows) {
  const normalizedRows = (rows ?? [])
    .map((row) => JSON.stringify(stableValue(row)))
    .sort();
  return createHash("sha256").update(JSON.stringify(normalizedRows)).digest("hex");
}

async function snapshotTables(supabase) {
  const entries = await Promise.all(
    targetTables.map(async (table) => {
      const result = await supabase.from(table).select("*");
      if (result.error) {
        throw new Error(`local table snapshot failed: ${table}`);
      }
      return [
        table,
        {
          count: result.data?.length ?? 0,
          digest: digestRows(result.data),
        },
      ];
    }),
  );
  return Object.fromEntries(entries);
}

function assertLocalUrl(value, label) {
  const url = new URL(value);
  if (!new Set(["127.0.0.1", "localhost"]).has(url.hostname)) {
    throw new Error(`${label} must use localhost`);
  }
}

async function main() {
  assertLocalUrl(baseUrl, "app base URL");
  const localEnv = readLocalSupabaseEnv();
  assertLocalUrl(localEnv.API_URL, "Supabase API URL");

  const supabase = createClient(localEnv.API_URL, localEnv.SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const userResult = await supabase
    .from("users")
    .select("id")
    .eq("email", "local-tester@homecook.local")
    .single();
  if (userResult.error || !userResult.data) {
    throw new Error("seeded local user is missing");
  }
  const columnResult = await supabase
    .from("meal_plan_columns")
    .select("name")
    .eq("user_id", userResult.data.id);
  if (columnResult.error) {
    throw new Error("seeded local planner columns are unreadable");
  }
  const columnNames = new Set((columnResult.data ?? []).map((column) => column.name));
  const requiredColumnNames = ["아침", "점심", "저녁"];
  if (!requiredColumnNames.every((name) => columnNames.has(name))) {
    throw new Error("seeded local planner columns are incomplete");
  }

  mkdirSync(evidenceDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`${baseUrl}/login?next=%2Fplanner`);

    const initialNutritionResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "GET"
      && new URL(response.url()).pathname === "/api/v1/planner/nutrition"
    );
    await page.getByRole("button", { name: "로컬 테스트 계정으로 시작" }).click();
    await page.waitForURL((url) => url.pathname === "/planner");
    const initialNutritionResponse = await initialNutritionResponsePromise;
    if (initialNutritionResponse.status() !== 200) {
      throw new Error("authenticated planner nutrition request failed");
    }

    const weekSummary = page.getByTestId("planner-week-nutrition-summary");
    await weekSummary.waitFor({ state: "visible" });
    const before = await snapshotTables(supabase);
    const nutritionUrl = new URL(initialNutritionResponse.url());
    const directResult = await page.evaluate(async (requestPath) => {
      const response = await fetch(requestPath, { method: "GET" });
      const payload = await response.json();
      return {
        status: response.status,
        success: payload?.success === true,
        dataKeys: Object.keys(payload?.data ?? {}).sort(),
        summaryKeys: Object.keys(payload?.data?.summary ?? {}).sort(),
        calculationStatus: payload?.data?.summary?.nutrition?.calculation_status ?? null,
      };
    }, `${nutritionUrl.pathname}${nutritionUrl.search}`);
    if (directResult.status !== 200 || !directResult.success) {
      throw new Error("direct planner nutrition GET failed");
    }

    const weekSummaryText = await weekSummary.textContent();
    const falseZeroVisible = /(?:^|\s)0(?:\.0+)?\s*kcal(?:\s|$)/u.test(weekSummaryText ?? "");
    if (falseZeroVisible && directResult.calculationStatus === "unavailable") {
      throw new Error("unavailable nutrition rendered as false zero");
    }
    const weekScreenshot = path.join(evidenceDir, "PLANNER_WEEK-local-supabase-390.png");
    await page.screenshot({ path: weekScreenshot, fullPage: true });

    const mealLink = page.locator('a[href^="/planner/"]').first();
    const mealHref = await mealLink.getAttribute("href");
    if (!mealHref) {
      throw new Error("seeded local meal link is missing");
    }
    const mealNutritionResponsePromise = page.waitForResponse((response) =>
      response.request().method() === "GET"
      && new URL(response.url()).pathname === "/api/v1/planner/nutrition"
    );
    await mealLink.click();
    await page.waitForURL((url) => url.pathname.startsWith("/planner/") && url.pathname !== "/planner");
    const mealNutritionResponse = await mealNutritionResponsePromise;
    if (mealNutritionResponse.status() !== 200) {
      throw new Error("authenticated meal nutrition request failed");
    }
    const mealSummary = page.getByTestId("meal-nutrition-summary");
    await mealSummary.waitFor({ state: "visible" });
    const mealSummaryText = await mealSummary.textContent();
    const mealScreenshot = path.join(evidenceDir, "MEAL_SCREEN-local-supabase-390.png");
    await page.screenshot({ path: mealScreenshot, fullPage: true });
    const after = await snapshotTables(supabase);
    const changedTables = targetTables.filter(
      (table) => before[table].digest !== after[table].digest,
    );
    if (changedTables.length > 0) {
      throw new Error(`read-only smoke changed target tables: ${changedTables.join(", ")}`);
    }

    const evidence = {
      schemaVersion: "1.0",
      environment: "local-supabase",
      fixtureMode: false,
      bootstrap: {
        seededUserPresent: true,
        requiredColumnNames,
        requiredColumnsPresent: true,
      },
      browser: {
        authenticatedLocalAccount: true,
        plannerWeekSummaryVisible: true,
        mealScreenSummaryVisible: true,
        mealPathRestored: mealHref,
        screenshots: [
          path.relative(process.cwd(), weekScreenshot),
          path.relative(process.cwd(), mealScreenshot),
        ],
      },
      request: {
        method: "GET",
        path: nutritionUrl.pathname,
        queryFields: [...nutritionUrl.searchParams.keys()].sort(),
        ...directResult,
        unavailableRenderedAsFalseZero: falseZeroVisible,
        mealSummaryRenderedAsFalseZero: /(?:^|\s)0(?:\.0+)?\s*kcal(?:\s|$)/u.test(
          mealSummaryText ?? "",
        ),
      },
      readOnly: {
        targetTables: Object.fromEntries(
          targetTables.map((table) => [
            table,
            {
              beforeCount: before[table].count,
              afterCount: after[table].count,
              digestUnchanged: before[table].digest === after[table].digest,
            },
          ]),
        ),
        changedTables,
        targetWriteCount: 0,
      },
      safety: {
        productionWriteCount: 0,
        stagingWriteCount: 0,
        externalProviderWriteCount: 0,
        rawProviderRowsPrintedOrCommitted: false,
      },
    };
    writeFileSync(
      path.join(evidenceDir, "real-local-db-smoke.json"),
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write("planner nutrition local DB browser smoke passed\n");
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
