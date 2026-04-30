import { expect, test, type Page } from "@playwright/test";

const E2E_AUTH_OVERRIDE_KEY = "homecook.e2e-auth-override";

async function setAuthOverride(page: Page, value: "authenticated" | "guest") {
  await page.addInitScript(
    ({ key, state }) => {
      window.localStorage.setItem(key, state);
    },
    { key: E2E_AUTH_OVERRIDE_KEY, state: value },
  );
}

interface MockProfile {
  id: string;
  nickname: string;
  email: string;
  profile_image_url: string | null;
  social_provider: string;
  settings: { screen_wake_lock: boolean };
}

function makeMockProfile(overrides?: Partial<MockProfile>): MockProfile {
  return {
    id: "user-1",
    nickname: "집밥러",
    email: "user@example.com",
    profile_image_url: null,
    social_provider: "kakao",
    settings: { screen_wake_lock: false },
    ...overrides,
  };
}

async function installSettingsRoutes(
  page: Page,
  options?: {
    profile?: MockProfile;
    settingsError?: boolean;
    logoutError?: boolean;
    deleteError?: boolean;
  },
) {
  const profile = options?.profile ?? makeMockProfile();
  const settingsError = options?.settingsError ?? false;
  const logoutError = options?.logoutError ?? false;
  const deleteError = options?.deleteError ?? false;

  await page.route("**/api/v1/users/me/settings", async (route) => {
    if (settingsError) {
      await route.fulfill({
        status: 500,
        json: {
          success: false,
          data: null,
          error: { code: "INTERNAL_ERROR", message: "설정을 저장하지 못했어요.", fields: [] },
        },
      });
    } else {
      const body = route.request().postDataJSON();
      profile.settings = { ...profile.settings, ...body };
      await route.fulfill({
        json: {
          success: true,
          data: { settings: profile.settings },
          error: null,
        },
      });
    }
  });

  await page.route("**/api/v1/users/me", async (route) => {
    if (route.request().method() === "PATCH") {
      const body = route.request().postDataJSON();
      if (body.nickname) {
        profile.nickname = body.nickname;
      }
      await route.fulfill({
        json: {
          success: true,
          data: { ...profile },
          error: null,
        },
      });
    } else if (route.request().method() === "DELETE") {
      if (deleteError) {
        await route.fulfill({
          status: 500,
          json: {
            success: false,
            data: null,
            error: { code: "INTERNAL_ERROR", message: "탈퇴에 실패했어요.", fields: [] },
          },
        });
      } else {
        await route.fulfill({
          json: {
            success: true,
            data: { deleted: true },
            error: null,
          },
        });
      }
    } else {
      await route.fulfill({
        json: {
          success: true,
          data: { ...profile },
          error: null,
        },
      });
    }
  });

  await page.route("**/api/v1/auth/logout", async (route) => {
    if (logoutError) {
      await route.fulfill({
        status: 500,
        json: {
          success: false,
          data: null,
          error: { code: "INTERNAL_ERROR", message: "로그아웃에 실패했어요.", fields: [] },
        },
      });
    } else {
      await route.fulfill({
        json: {
          success: true,
          data: { logged_out: true },
          error: null,
        },
      });
    }
  });
}

test.describe("SETTINGS screen", () => {
  test("shows settings items when authenticated", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
    await expect(page.getByLabel("뒤로가기")).toBeVisible();
    await expect(page.getByText("요리모드 화면 꺼짐 방지")).toBeVisible();
    await expect(page.getByText("닉네임")).toBeVisible();
    await expect(page.getByText("집밥러")).toBeVisible();
    await expect(page.getByText("로그아웃")).toBeVisible();
    await expect(page.getByText("회원탈퇴")).toBeVisible();
  });

  test("shows login gate with login link for unauthenticated users", async ({ page }) => {
    await setAuthOverride(page, "guest");
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "로그인이 필요해요" })).toBeVisible();

    const loginLink = page.getByText("로그인 화면으로 이동");
    await expect(loginLink).toBeVisible();
    await expect(loginLink).toHaveAttribute("href", "/login?next=/settings");

    await expect(page.getByText("홈으로 돌아가기")).toBeVisible();
  });

  test("toggles screen wake lock", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await page.goto("/settings");

    await expect(page.getByRole("switch")).toBeVisible();
    const toggle = page.getByRole("switch");
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  test("opens nickname edit sheet and saves", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await page.goto("/settings");

    await expect(page.getByText("집밥러")).toBeVisible();
    await page.getByTestId("nickname-row").click();

    await expect(page.getByText("닉네임 변경")).toBeVisible();

    const input = page.getByRole("textbox");
    await input.fill("새집밥러");
    await page.getByRole("button", { name: "변경하기" }).click();

    await expect(page.getByText("새집밥러")).toBeVisible();
  });

  test("logout confirm triggers API and navigates home", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await page.goto("/settings");

    await expect(page.getByText("로그아웃")).toBeVisible();
    await page.getByText("로그아웃").click();

    await expect(page.getByText("로그아웃할까요?")).toBeVisible();
    await page.getByText("로그아웃하기").click();

    await page.waitForURL("/");
  });

  test("delete confirm triggers API and navigates home", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await page.goto("/settings");

    await expect(page.getByText("회원탈퇴")).toBeVisible();
    await page.getByText("회원탈퇴").click();

    await expect(page.getByText("정말 탈퇴하시겠어요?")).toBeVisible();
    await page.getByText("탈퇴하기").click();

    await page.waitForURL("/");
  });

  test("delete confirm dialog can be cancelled", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await page.goto("/settings");

    await expect(page.getByText("회원탈퇴")).toBeVisible();
    await page.getByText("회원탈퇴").click();

    await expect(page.getByText("정말 탈퇴하시겠어요?")).toBeVisible();
    await page.getByText("취소").click();

    await expect(page.getByText("정말 탈퇴하시겠어요?")).not.toBeVisible();
  });

  test("delete succeeds but logout cleanup fails shows error and stays", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page, { logoutError: true });
    await page.goto("/settings");

    await expect(page.getByText("회원탈퇴")).toBeVisible();
    await page.getByText("회원탈퇴").click();

    await expect(page.getByText("정말 탈퇴하시겠어요?")).toBeVisible();
    await page.getByText("탈퇴하기").click();

    await expect(page.getByTestId("dialog-error")).toBeVisible();
    await expect(page.getByText("탈퇴는 완료되었으나 로그아웃에 실패했어요. 브라우저를 닫아주세요.")).toBeVisible();

    // Dialog should still be open, not navigated
    await expect(page.getByText("정말 탈퇴하시겠어요?")).toBeVisible();
  });

  test("back button navigates to /mypage", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    // Need mypage routes for navigation target
    await page.route("**/api/v1/recipe-books", async (route) => {
      await route.fulfill({
        json: { success: true, data: { books: [] }, error: null },
      });
    });
    await page.route("**/api/v1/shopping/lists**", async (route) => {
      await route.fulfill({
        json: { success: true, data: { items: [], next_cursor: null, has_next: false }, error: null },
      });
    });

    await page.goto("/settings");
    await expect(page.getByLabel("뒤로가기")).toBeVisible();
    await page.getByLabel("뒤로가기").click();

    await page.waitForURL("/mypage");
  });

  test("MYPAGE gear button opens /settings", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    // Install routes for both mypage and settings
    await installSettingsRoutes(page);
    // Also need mypage routes for the mypage screen
    await page.route("**/api/v1/recipe-books", async (route) => {
      await route.fulfill({
        json: { success: true, data: { books: [] }, error: null },
      });
    });
    await page.route("**/api/v1/shopping/lists**", async (route) => {
      await route.fulfill({
        json: { success: true, data: { items: [], next_cursor: null, has_next: false }, error: null },
      });
    });

    await page.goto("/mypage");
    await expect(page.getByLabel("설정")).toBeVisible();
    await page.getByLabel("설정").click();

    await page.waitForURL("/settings");
    await expect(page.getByText("설정")).toBeVisible();
  });
});
