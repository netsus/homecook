import { expect, test } from "@playwright/test";

import {
  installRecipeDetailRoutes,
  RECIPE_PATH,
} from "./helpers/mock-routes";

const LIKE_RECIPE_UUID = "550e8400-e29b-41d4-a716-446655440022";

test.describe("QA auth and session security smoke", () => {
  test("guest-only write APIs reject unauthenticated requests with the contract envelope", async ({
    request,
  }) => {
    const likeResponse = await request.post(
      `/api/v1/recipes/${LIKE_RECIPE_UUID}/like`,
    );
    const likeBody = await likeResponse.json();

    expect(likeResponse.status()).toBe(401);
    expect(likeBody).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "UNAUTHORIZED",
      },
    });

    const profileResponse = await request.patch("/api/v1/auth/profile", {
      data: {
        nickname: "집밥닉네임",
      },
    });
    const profileBody = await profileResponse.json();

    expect(profileResponse.status()).toBe(401);
    expect(profileBody).toMatchObject({
      success: false,
      data: null,
      error: {
        code: "UNAUTHORIZED",
      },
    });
  });

  test("auth callback sanitizes external return targets", async ({ request }) => {
    const response = await request.get(
      "/auth/callback?error=access_denied&next=https://evil.example",
      {
        maxRedirects: 0,
      },
    );
    const redirectLocation = response.headers().location;

    expect(response.status()).toBe(307);
    expect(redirectLocation).toBeTruthy();
    expect(new URL(redirectLocation ?? response.url()).pathname).toBe("/login");
    expect(new URL(redirectLocation ?? response.url()).searchParams.get("authError")).toBe(
      "oauth_failed",
    );
  });

  test("guest users hit the login gate before protected actions run", async ({
    page,
  }) => {
    await installRecipeDetailRoutes(page);

    await page.goto(RECIPE_PATH);
    await page.getByRole("button", { name: "플래너에 추가" }).click();

    await expect(
      page.getByRole("dialog", { name: "로그인이 필요한 작업이에요" }),
    ).toBeVisible();
    await expect(page.getByText("로그인하면 원래 레시피로 바로 돌아옵니다.")).toBeVisible();
  });
});
