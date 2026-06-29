import { expect, test } from "@playwright/test";

import {
  installRecipeDetailRoutes,
  RECIPE_PATH,
} from "./helpers/mock-routes";

const LIKE_RECIPE_UUID = "550e8400-e29b-41d4-a716-446655440022";
const SECURITY_HEADER_ROUTES = [
  "/",
  "/login",
  RECIPE_PATH,
  "/mypage",
  "/planner",
  "/pantry",
] as const;

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

    const profileResponse = await request.patch("/api/v1/users/me", {
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
    await expect(
      page.getByText("로그인하면 원래 하려던 작업으로 자동 이동해요."),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "로그인" })).toBeVisible();
  });

  test("applies launch security headers to representative routes", async ({
    request,
  }) => {
    for (const route of SECURITY_HEADER_ROUTES) {
      const response = await request.fetch(route, { method: "HEAD" });
      const headers = response.headers();
      const csp = headers["content-security-policy"] ?? "";

      expect(response.status()).toBeLessThan(500);
      expect(headers["x-powered-by"]).toBeUndefined();
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
      expect(headers["permissions-policy"]).toContain("camera=()");
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain("*");
    }
  });
});
