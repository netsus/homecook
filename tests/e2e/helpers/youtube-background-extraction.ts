import type { Page } from "@playwright/test";

const JOB_ID = "11111111-1111-4111-8111-111111111111";

export async function installEmptyYoutubeNotificationRoutes(page: Page) {
  await page.route(
    (url) => url.pathname.startsWith("/api/v1/users/me/youtube-extraction-jobs"),
    async (route) => {
      const pathname = new URL(route.request().url()).pathname;
      if (pathname.endsWith("/delivered")) {
        await route.fulfill({
          json: { success: true, data: { delivered_count: 0 }, error: null },
        });
        return;
      }
      if (pathname.endsWith("/seen")) {
        await route.fulfill({
          json: { success: true, data: { seen_count: 0 }, error: null },
        });
        return;
      }
      await route.fulfill({
        json: {
          success: true,
          data: { items: [], next_cursor: null },
          error: null,
        },
      });
    },
  );
}

export async function installCompletedYoutubeExtractionRoutes(
  page: Page,
  draft: { extraction_id: string } & Record<string, unknown>,
  options: { enqueueDelayMs?: number; keepQueued?: boolean } = {},
) {
  await installEmptyYoutubeNotificationRoutes(page);

  await page.route(
    (url) => url.pathname === "/api/v1/recipes/youtube/extraction-jobs",
    async (route) => {
      if (options.enqueueDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, options.enqueueDelayMs));
      }
      await route.fulfill({
        status: 202,
        json: {
          success: true,
          data: {
            job_id: JOB_ID,
            status: "queued",
            deduplicated: false,
            submitted_at: "2026-08-14T01:00:00.000Z",
          },
          error: null,
        },
      });
    },
  );

  await page.route(
    (url) => url.pathname === `/api/v1/recipes/youtube/extraction-jobs/${JOB_ID}`,
    async (route) => {
      const keepQueued = options.keepQueued === true;
      await route.fulfill({
        json: {
          success: true,
          data: {
            job_id: JOB_ID,
            status: keepQueued ? "queued" : "succeeded",
            submitted_at: "2026-08-14T01:00:00.000Z",
            started_at: keepQueued ? null : "2026-08-14T01:00:01.000Z",
            completed_at: keepQueued ? null : "2026-08-14T01:03:00.000Z",
            result: keepQueued
              ? null
              : {
                  extraction_id: draft.extraction_id,
                  review_path: `/menu/add/youtube?extractionId=${encodeURIComponent(draft.extraction_id)}`,
                  recipe_id: null,
                  recipe_path: null,
                },
            error: null,
            can_retry: false,
          },
          error: null,
        },
      });
    },
  );

  await page.route(
    (url) => url.pathname === `/api/v1/recipes/youtube/extractions/${draft.extraction_id}`,
    async (route) => {
      await route.fulfill({
        json: {
          success: true,
          data: {
            status: "draft",
            draft,
            recipe_id: null,
            recipe_path: null,
          },
          error: null,
        },
      });
    },
  );
}
