/**
 * UX Latency Timing Harness
 *
 * Measures route-entry latency for key Homecook surfaces.
 * Uses mock routes so timing reflects client-side rendering and data resolution,
 * not real API latency.
 *
 * Overlay/sheet timing is not covered here — overlay interactions are
 * validated qualitatively via manual QA (see acceptance.md Manual QA section).
 *
 * Canonical production-like execution:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000 \
 *   PLAYWRIGHT_REUSE_EXISTING_SERVER=1 \
 *   pnpm exec playwright test tests/e2e/qa-ux-latency.spec.ts --project=mobile-chrome
 */
import { expect, test, type Page } from "@playwright/test";

import {
  installAccountLibraryVisualRoutes,
  installCookingVisualRoutes,
  installDiscoveryRoutes,
  installLeftoversVisualRoutes,
  installMealDetailRoutes,
  installPantryShoppingVisualRoutes,
  installPlannerWeekRoutes,
  installRecipeDetailRoutes,
  COOK_MODE_VISUAL_PATH,
  ATE_LIST_VISUAL_PATH,
  LEFTOVERS_VISUAL_PATH,
  MEAL_VISUAL_PATH,
  MYPAGE_VISUAL_PATH,
  RECIPE_PATH,
  RECIPEBOOK_DETAIL_VISUAL_PATH,
  setE2EAuthOverride,
  SETTINGS_VISUAL_PATH,
  SHOPPING_DETAIL_VISUAL_PATH,
} from "./helpers/mock-routes";

/* ---------- Types ---------- */

interface TimingResult {
  surface_id: string;
  entry_kind: "route";
  cold_or_warm: "cold" | "warm";
  run_index: number;
  navigation_start_ms: number;
  shell_visible_ms: number;
  critical_content_visible_ms: number;
  interactive_ms: number;
  notes: string;
}

/* ---------- Constants ---------- */

/**
 * Per-selector timeout.
 * Must accommodate Next.js dev-server on-demand compilation on cold runs.
 * Production-like builds resolve in <5 s; dev-server first-page can take 20-30 s.
 */
const SELECTOR_TIMEOUT_MS = 30_000;

/** Per-test timeout — cold (up to 30 s) + warm runs + overhead. */
const TEST_TIMEOUT_MS = 120_000;
const WARM_RUN_COUNT = 5;

/* ---------- Helpers ---------- */

/**
 * Measures how long it takes for a selector to appear after a navigation or action.
 * Returns elapsed milliseconds from the start mark, or -1 if the selector timed out.
 */
async function measureUntilVisible(
  page: Page,
  selector: string,
  startMs: number,
  timeoutMs = SELECTOR_TIMEOUT_MS,
): Promise<number> {
  try {
    // Use waitForFunction instead of waitForSelector to find ANY matching
    // element with a non-zero bounding box.  This is necessary because some
    // pages render both a web and mobile layout; the web version may come
    // first in DOM order but be hidden (display:none) on mobile viewport.
    // waitForSelector locks onto the first DOM match and never checks later ones.
    await page.waitForFunction(
      (sel: string) => {
        const els = document.querySelectorAll(sel);
        return Array.from(els).some((el) => {
          const rect = el.getBoundingClientRect();
          return rect.width > 0 && rect.height > 0;
        });
      },
      selector,
      { timeout: timeoutMs },
    );
  } catch {
    return -1;
  }
  return Date.now() - startMs;
}

/**
 * Measures route-entry latency by navigating to a path and timing key milestones.
 */
async function measureRouteEntry(
  page: Page,
  surfaceId: string,
  path: string,
  contentSelector: string,
  opts: { cold: boolean; runIndex: number },
): Promise<TimingResult> {
  const startMs = Date.now();

  await page.goto(path, { waitUntil: "commit" });

  const shellMs = await measureUntilVisible(
    page,
    "main, [data-testid='app-shell'], nav, header",
    startMs,
  );

  const contentMs = await measureUntilVisible(page, contentSelector, startMs);

  return {
    surface_id: surfaceId,
    entry_kind: "route",
    cold_or_warm: opts.cold ? "cold" : "warm",
    run_index: opts.runIndex,
    navigation_start_ms: 0,
    shell_visible_ms: shellMs,
    critical_content_visible_ms: contentMs,
    interactive_ms: contentMs,
    notes: contentMs === -1 ? "content selector timed out" : "",
  };
}

/* ---------- Test Suite ---------- */

test.describe("UX Latency Timing Harness", () => {
  test.describe.configure({ mode: "serial" });

  test.describe("Route entry timing — authenticated", () => {
    test.beforeEach(async ({ page }) => {
      await setE2EAuthOverride(page, "authenticated");
    });

    /*
     * Content selectors are chosen from actual data-testid values and CSS classes
     * found in each component file. Comma-separated selectors provide fallbacks
     * for mobile vs web layouts.
     */
    const authenticatedRoutes: Array<{
      id: string;
      path: string;
      contentSelector: string;
      install: (page: Page) => Promise<void>;
    }> = [
      {
        id: "HOME",
        path: "/",
        // HOME has no top-level data-testid; RecipeCard renders <article> elements.
        // recipe-card-bookmark appears on each card when recipes load.
        contentSelector:
          "[data-testid='recipe-card-bookmark']",
        install: installDiscoveryRoutes,
      },
      {
        id: "RECIPE_DETAIL",
        path: RECIPE_PATH,
        contentSelector:
          "[data-testid='recipe-detail-hero']",
        install: installRecipeDetailRoutes,
      },
      {
        id: "PLANNER_WEEK",
        path: "/planner",
        contentSelector:
          "[data-testid='planner-week-body'], [data-testid='planner-week-shell']",
        install: installPlannerWeekRoutes,
      },
      {
        id: "MEAL_SCREEN",
        path: MEAL_VISUAL_PATH,
        // meal-screen-add-cta appears in both ready and empty states
        contentSelector:
          "[data-testid='meal-screen-add-cta'], [data-testid='meal-screen-empty'], [data-testid='web-meal-list']",
        install: async (page: Page) => {
          await installPlannerWeekRoutes(page);
          await installMealDetailRoutes(page);
        },
      },
      {
        id: "MYPAGE",
        path: MYPAGE_VISUAL_PATH,
        contentSelector:
          "[data-testid='mypage-profile'], [data-testid='mypage-skeleton']",
        install: installAccountLibraryVisualRoutes,
      },
      {
        id: "LEFTOVERS",
        path: LEFTOVERS_VISUAL_PATH,
        contentSelector:
          "[data-testid='leftovers-screen']",
        install: installLeftoversVisualRoutes,
      },
      {
        id: "ATE_LIST",
        path: ATE_LIST_VISUAL_PATH,
        contentSelector:
          "[data-testid='ate-list-screen']",
        install: installLeftoversVisualRoutes,
      },
      {
        id: "SETTINGS",
        path: SETTINGS_VISUAL_PATH,
        // settings has column-management-section (web) or settings-loading / nickname-row (mobile)
        contentSelector:
          "[data-testid='column-management-section'], [data-testid='nickname-row'], [data-testid='settings-loading']",
        install: installAccountLibraryVisualRoutes,
      },
      {
        id: "RECIPEBOOK_DETAIL",
        path: RECIPEBOOK_DETAIL_VISUAL_PATH,
        contentSelector:
          "[data-testid='recipebook-detail-header'], [data-testid='recipebook-detail-list'], [data-testid='recipebook-detail-mobile']",
        install: installAccountLibraryVisualRoutes,
      },
      {
        id: "SHOPPING_DETAIL",
        path: SHOPPING_DETAIL_VISUAL_PATH,
        contentSelector:
          "[data-testid='shopping-detail-mobile'], [data-testid='shopping-detail-embedded']",
        install: installPantryShoppingVisualRoutes,
      },
      {
        id: "COOK_MODE",
        path: COOK_MODE_VISUAL_PATH,
        contentSelector:
          "[data-testid='cook-mode-screen']",
        install: installCookingVisualRoutes,
      },
    ];

    for (const route of authenticatedRoutes) {
      test(`${route.id} — route entry timing`, async ({ page }) => {
        test.setTimeout(TEST_TIMEOUT_MS);
        await route.install(page);

        // Cold run
        const cold = await measureRouteEntry(
          page,
          route.id,
          route.path,
          route.contentSelector,
          { cold: true, runIndex: 0 },
        );

        if (cold.critical_content_visible_ms === -1) {
          // eslint-disable-next-line no-console
          console.log(
            `[ux-latency] ${route.id} COLD: content selector timed out — selector: ${route.contentSelector}`,
          );
          expect.soft(
            cold.critical_content_visible_ms,
            `${route.id} cold: content selector "${route.contentSelector}" never appeared`,
          ).toBeGreaterThanOrEqual(0);
          return;
        }

        // Warm runs — navigate away then back
        const warmResults: TimingResult[] = [];
        for (let i = 1; i <= WARM_RUN_COUNT; i++) {
          await page.goto("about:blank", { waitUntil: "commit" });
          await page.waitForTimeout(100);
          await setE2EAuthOverride(page, "authenticated");

          const warm = await measureRouteEntry(
            page,
            route.id,
            route.path,
            route.contentSelector,
            { cold: false, runIndex: i },
          );
          warmResults.push(warm);
        }

        const validWarmMs = warmResults
          .map((r) => r.critical_content_visible_ms)
          .filter((ms) => ms >= 0)
          .sort((a, b) => a - b);
        const warmMedian = validWarmMs[Math.floor(validWarmMs.length / 2)] ?? -1;

        const summary = {
          surface: route.id,
          cold_content_ms: cold.critical_content_visible_ms,
          warm_median_content_ms: warmMedian,
          warm_runs: warmResults.map((r) => r.critical_content_visible_ms),
        };

        // eslint-disable-next-line no-console
        console.log(`[ux-latency] ${JSON.stringify(summary)}`);

        expect(cold.critical_content_visible_ms).toBeLessThan(SELECTOR_TIMEOUT_MS);
        expect(
          validWarmMs.length,
          `${route.id}: all warm runs should find critical content`,
        ).toBe(warmResults.length);
      });
    }
  });

  test.describe("Route entry timing — guest (HOME only)", () => {
    test("HOME guest — route entry timing", async ({ page }) => {
      test.setTimeout(TEST_TIMEOUT_MS);
      await setE2EAuthOverride(page, "guest");
      await installDiscoveryRoutes(page);

      const cold = await measureRouteEntry(
        page,
        "HOME_GUEST",
        "/",
        "[data-testid='recipe-card-bookmark']",
        { cold: true, runIndex: 0 },
      );

      // eslint-disable-next-line no-console
      console.log(
        `[ux-latency] ${JSON.stringify({
          surface: "HOME_GUEST",
          cold_content_ms: cold.critical_content_visible_ms,
        })}`,
      );

      if (cold.critical_content_visible_ms === -1) {
        expect.soft(
          cold.critical_content_visible_ms,
          "HOME_GUEST: content selector timed out",
        ).toBeGreaterThanOrEqual(0);
        return;
      }

      expect(cold.critical_content_visible_ms).toBeLessThan(SELECTOR_TIMEOUT_MS);
    });
  });
});
