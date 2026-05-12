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

function isMobileViewport(page: Page) {
  return (page.viewportSize()?.width ?? 1280) < 768;
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

interface MockColumn {
  id: string;
  name: string;
  sort_order: number;
}

function makeDefaultColumns(): MockColumn[] {
  return [
    { id: "col-1", name: "아침", sort_order: 0 },
    { id: "col-2", name: "점심", sort_order: 1 },
    { id: "col-3", name: "저녁", sort_order: 2 },
  ];
}

async function installColumnRoutes(
  page: Page,
  options?: {
    columns?: MockColumn[];
    columnsError?: boolean;
    createError?: { code: string; message: string; status: number };
    renameError?: { code: string; message: string; status: number };
    deleteError?: { code: string; message: string; status: number };
  },
) {
  const columns = options?.columns ?? makeDefaultColumns();
  const columnsError = options?.columnsError ?? false;

  await page.route("**/api/v1/planner/columns", async (route) => {
    if (route.request().method() === "GET") {
      if (columnsError) {
        await route.fulfill({
          status: 500,
          json: { success: false, data: null, error: { code: "INTERNAL_ERROR", message: "끼니 컬럼을 불러오지 못했어요.", fields: [] } },
        });
      } else {
        await route.fulfill({
          json: { success: true, data: { columns: [...columns] }, error: null },
        });
      }
    } else if (route.request().method() === "POST") {
      if (options?.createError) {
        await route.fulfill({
          status: options.createError.status,
          json: { success: false, data: null, error: { code: options.createError.code, message: options.createError.message, fields: [] } },
        });
      } else {
        const body = route.request().postDataJSON() as { name: string };
        const newColumn: MockColumn = {
          id: `col-${Date.now()}`,
          name: body.name.trim(),
          sort_order: columns.length,
        };
        columns.push(newColumn);
        await route.fulfill({
          status: 201,
          json: { success: true, data: { column: newColumn }, error: null },
        });
      }
    } else {
      await route.fulfill({ status: 405 });
    }
  });

  await page.route("**/api/v1/planner/columns/*", async (route) => {
    const url = route.request().url();
    const columnId = url.split("/planner/columns/")[1]?.split("?")[0];

    if (route.request().method() === "PATCH") {
      if (options?.renameError) {
        await route.fulfill({
          status: options.renameError.status,
          json: { success: false, data: null, error: { code: options.renameError.code, message: options.renameError.message, fields: [] } },
        });
      } else {
        const body = route.request().postDataJSON() as { name: string };
        const col = columns.find((c) => c.id === columnId);
        if (col) {
          col.name = body.name.trim();
          await route.fulfill({
            json: { success: true, data: { column: { ...col } }, error: null },
          });
        } else {
          await route.fulfill({
            status: 404,
            json: { success: false, data: null, error: { code: "RESOURCE_NOT_FOUND", message: "끼니 컬럼을 찾을 수 없어요.", fields: [] } },
          });
        }
      }
    } else if (route.request().method() === "DELETE") {
      if (options?.deleteError) {
        await route.fulfill({
          status: options.deleteError.status,
          json: { success: false, data: null, error: { code: options.deleteError.code, message: options.deleteError.message, fields: [] } },
        });
      } else {
        const idx = columns.findIndex((c) => c.id === columnId);
        if (idx >= 0) {
          columns.splice(idx, 1);
          columns.forEach((c, i) => { c.sort_order = i; });
          await route.fulfill({
            json: { success: true, data: { deleted: true }, error: null },
          });
        } else {
          await route.fulfill({
            status: 404,
            json: { success: false, data: null, error: { code: "RESOURCE_NOT_FOUND", message: "끼니 컬럼을 찾을 수 없어요.", fields: [] } },
          });
        }
      }
    } else {
      await route.fulfill({ status: 405 });
    }
  });

  return { columns };
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
    await installColumnRoutes(page);
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
    await expect(page.getByLabel("뒤로가기")).toBeVisible();
    if (isMobileViewport(page)) {
      await expect(page.getByText("화면 켜둠")).toBeVisible();
      await expect(page.getByText("음성 안내")).toBeVisible();
      await expect(page.getByText("타이머 끝나면 다음 단계 자동")).toBeVisible();
      await expect(page.getByText("플래너 끼니 컬럼")).toBeVisible();
    } else {
      await expect(page.getByText("요리모드 화면 꺼짐 방지")).toBeVisible();
      await expect(page.getByText("닉네임")).toBeVisible();
      await expect(page.getByText("집밥러")).toBeVisible();
      await expect(page.getByText("로그아웃")).toBeVisible();
      await expect(page.getByText("회원탈퇴")).toBeVisible();
    }
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
    await installColumnRoutes(page);
    await page.goto("/settings");

    const toggle = page.getByRole("switch", {
      name: isMobileViewport(page) ? "화면 켜둠" : "요리모드 화면 꺼짐 방지",
    });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  test("settings toggle failure reverts value and shows error", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page, { settingsError: true });
    await installColumnRoutes(page);
    await page.goto("/settings");

    const toggle = page.getByRole("switch", {
      name: isMobileViewport(page) ? "화면 켜둠" : "요리모드 화면 꺼짐 방지",
    });
    await expect(toggle).toHaveAttribute("aria-checked", "false");

    await toggle.click();

    await expect(page.getByText("설정을 저장하지 못했어요.")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  test("opens nickname edit sheet and saves", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await installColumnRoutes(page);
    await page.goto(isMobileViewport(page) ? "/settings?view=account" : "/settings");

    await expect(page.getByText("집밥러")).toBeVisible();
    await page.getByTestId("nickname-row").click();

    await expect(
      page.getByRole("dialog").getByRole("heading", { name: "닉네임 변경" }),
    ).toBeVisible();

    const input = page.getByRole("textbox");
    await input.fill("새집밥러");
    await page.getByRole("button", {
      name: isMobileViewport(page) ? "저장" : "변경하기",
    }).click();

    await expect(page.getByText("새집밥러")).toBeVisible();
  });

  test("logout confirm triggers API and navigates home", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await installColumnRoutes(page);
    await page.goto(isMobileViewport(page) ? "/settings?view=account" : "/settings");

    await expect(page.getByText("로그아웃")).toBeVisible();
    await page.getByRole("button", { name: "로그아웃" }).click();

    await expect(page.getByText(isMobileViewport(page) ? "로그아웃 할까요?" : "로그아웃할까요?")).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", {
      name: isMobileViewport(page) ? "로그아웃" : "로그아웃하기",
    }).click();

    await page.waitForURL("/");
  });

  test("logout failure keeps dialog open and shows error", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page, { logoutError: true });
    await installColumnRoutes(page);
    await page.goto(isMobileViewport(page) ? "/settings?view=account" : "/settings");

    await expect(page.getByText("로그아웃")).toBeVisible();
    await page.getByRole("button", { name: "로그아웃" }).click();

    await expect(page.getByText(isMobileViewport(page) ? "로그아웃 할까요?" : "로그아웃할까요?")).toBeVisible();
    await page.getByRole("alertdialog").getByRole("button", {
      name: isMobileViewport(page) ? "로그아웃" : "로그아웃하기",
    }).click();

    await expect(page.getByTestId("dialog-error")).toBeVisible();
    await expect(page.getByText("로그아웃에 실패했어요.")).toBeVisible();
    await expect(page.getByText(isMobileViewport(page) ? "로그아웃 할까요?" : "로그아웃할까요?")).toBeVisible();
    await expect(page).toHaveURL(/\/settings(?:\?view=account)?$/);
  });

  test("delete confirm triggers API and navigates home", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await installColumnRoutes(page);
    await page.goto(isMobileViewport(page) ? "/settings?view=account" : "/settings");

    await expect(page.getByText("회원탈퇴")).toBeVisible();
    await page.getByText("회원탈퇴").click();

    await expect(page.getByText("정말 탈퇴하시겠어요?")).toBeVisible();
    await page.getByText("탈퇴하기").click();

    await page.waitForURL("/");
  });

  test("delete failure keeps dialog open and shows error", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page, { deleteError: true });
    await installColumnRoutes(page);
    await page.goto(isMobileViewport(page) ? "/settings?view=account" : "/settings");

    await expect(page.getByText("회원탈퇴")).toBeVisible();
    await page.getByText("회원탈퇴").click();

    await expect(page.getByText("정말 탈퇴하시겠어요?")).toBeVisible();
    await page.getByText("탈퇴하기").click();

    await expect(page.getByTestId("dialog-error")).toBeVisible();
    await expect(page.getByText("탈퇴에 실패했어요.")).toBeVisible();
    await expect(page.getByText("정말 탈퇴하시겠어요?")).toBeVisible();
    await expect(page).toHaveURL(/\/settings(?:\?view=account)?$/);
  });

  test("delete confirm dialog can be cancelled", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await installColumnRoutes(page);
    await page.goto(isMobileViewport(page) ? "/settings?view=account" : "/settings");

    await expect(page.getByText("회원탈퇴")).toBeVisible();
    await page.getByText("회원탈퇴").click();

    await expect(page.getByText("정말 탈퇴하시겠어요?")).toBeVisible();
    await page.getByText("취소").click();

    await expect(page.getByText("정말 탈퇴하시겠어요?")).not.toBeVisible();
  });

  test("delete succeeds but logout cleanup fails shows error and stays", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page, { logoutError: true });
    await installColumnRoutes(page);
    await page.goto(isMobileViewport(page) ? "/settings?view=account" : "/settings");

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
    await installColumnRoutes(page);
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

  test("MYPAGE settings row opens /settings", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    // Install routes for both mypage and settings
    await installSettingsRoutes(page);
    await installColumnRoutes(page);
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
    await expect(page.getByLabel("설정")).toHaveCount(0);
    await page.getByTestId("mypage-settings-link").click();

    await page.waitForURL("/settings");
    await expect(page.getByText("설정")).toBeVisible();
  });
});

test.describe("SETTINGS planner column management", () => {
  test("shows column list with default 3 columns", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await installColumnRoutes(page);
    await page.goto("/settings");

    await expect(page.getByTestId("column-management-section")).toBeVisible();
    await expect(
      page.getByText(isMobileViewport(page) ? "플래너 끼니 컬럼" : "끼니 컬럼 관리"),
    ).toBeVisible();

    const list = page.getByTestId("column-list");
    await expect(list).toBeVisible();
    await expect(list.getByText("아침")).toBeVisible();
    await expect(list.getByText("점심")).toBeVisible();
    await expect(list.getByText("저녁")).toBeVisible();
  });

  test("adds a new column", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await installColumnRoutes(page);
    await page.goto("/settings");

    await expect(page.getByTestId("column-list")).toBeVisible();
    await page.getByTestId("add-column-button").click();

    await expect(page.getByRole("heading", { name: "끼니 컬럼 추가" })).toBeVisible();

    const input = page.getByTestId("add-column-input");
    await input.fill("간식");
    await page.getByTestId("add-column-save").click();

    await expect(page.getByTestId("add-column-sheet-backdrop")).not.toBeVisible();
    await expect(page.getByTestId("column-list").getByText("간식")).toBeVisible();
  });

  test("renames a column", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await installColumnRoutes(page);
    await page.goto("/settings");

    await expect(page.getByTestId("column-list")).toBeVisible();
    await page.getByTestId("rename-column-col-1").click();

    await expect(page.getByText("끼니 이름 변경")).toBeVisible();

    const input = page.getByTestId("rename-column-input");
    await input.clear();
    await input.fill("브런치");
    await page.getByTestId("rename-column-save").click();

    await expect(page.getByTestId("rename-column-sheet-backdrop")).not.toBeVisible();
    await expect(page.getByTestId("column-list").getByText("브런치")).toBeVisible();
  });

  test("deletes an empty column", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await installColumnRoutes(page);
    await page.goto("/settings");

    await expect(page.getByTestId("column-list")).toBeVisible();
    await page.getByTestId("delete-column-col-3").click();

    await expect(page.getByText("끼니 컬럼 삭제")).toBeVisible();
    await expect(page.getByText('"저녁" 컬럼을 삭제할까요?')).toBeVisible();
    await page.getByText("삭제하기").click();

    await expect(page.getByText("끼니 컬럼 삭제")).not.toBeVisible();
    await expect(page.getByTestId("column-list").getByText("저녁")).not.toBeVisible();
  });

  test("shows add limit message when 5 columns exist", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await installColumnRoutes(page, {
      columns: [
        { id: "col-1", name: "아침", sort_order: 0 },
        { id: "col-2", name: "점심", sort_order: 1 },
        { id: "col-3", name: "저녁", sort_order: 2 },
        { id: "col-4", name: "간식", sort_order: 3 },
        { id: "col-5", name: "야식", sort_order: 4 },
      ],
    });
    await page.goto("/settings");

    await expect(page.getByTestId("column-list")).toBeVisible();
    const addButton = page.getByTestId("add-column-button");
    await expect(addButton).toBeDisabled();
    await expect(addButton).toContainText("최대 5개");
  });

  test("disables delete button when only 1 column exists", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await installColumnRoutes(page, {
      columns: [{ id: "col-1", name: "아침", sort_order: 0 }],
    });
    await page.goto("/settings");

    await expect(page.getByTestId("column-list")).toBeVisible();
    await expect(page.getByTestId("delete-column-col-1")).toBeDisabled();
  });

  test("shows error when column add returns COLUMN_LIMIT_REACHED", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await installColumnRoutes(page, {
      createError: { code: "COLUMN_LIMIT_REACHED", message: "끼니 컬럼은 최대 5개까지 만들 수 있어요.", status: 409 },
    });
    await page.goto("/settings");

    await expect(page.getByTestId("column-list")).toBeVisible();
    await page.getByTestId("add-column-button").click();

    const input = page.getByTestId("add-column-input");
    await input.fill("야식");
    await page.getByTestId("add-column-save").click();

    await expect(page.getByTestId("add-column-sheet-error")).toContainText("최대 5개");
  });

  test("shows error when column add returns COLUMN_NAME_DUPLICATE", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await installColumnRoutes(page, {
      createError: { code: "COLUMN_NAME_DUPLICATE", message: "이미 있는 끼니 이름이에요.", status: 409 },
    });
    await page.goto("/settings");

    await expect(page.getByTestId("column-list")).toBeVisible();
    await page.getByTestId("add-column-button").click();

    const input = page.getByTestId("add-column-input");
    await input.fill("아침");
    await page.getByTestId("add-column-save").click();

    await expect(page.getByTestId("add-column-sheet-error")).toContainText("이미 있는 끼니 이름");
  });

  test("shows error when column delete returns COLUMN_HAS_MEALS", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await installColumnRoutes(page, {
      deleteError: { code: "COLUMN_HAS_MEALS", message: "식사가 등록된 컬럼은 삭제할 수 없어요.", status: 409 },
    });
    await page.goto("/settings");

    await expect(page.getByTestId("column-list")).toBeVisible();
    await page.getByTestId("delete-column-col-3").click();

    await expect(page.getByText("끼니 컬럼 삭제")).toBeVisible();
    await page.getByText("삭제하기").click();

    await expect(page.getByTestId("dialog-error")).toContainText("식사가 등록된 컬럼은 삭제할 수 없어요");
  });

  test("shows error when column rename returns COLUMN_NAME_DUPLICATE", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await installColumnRoutes(page, {
      renameError: { code: "COLUMN_NAME_DUPLICATE", message: "이미 있는 끼니 이름이에요.", status: 409 },
    });
    await page.goto("/settings");

    await expect(page.getByTestId("column-list")).toBeVisible();
    await page.getByTestId("rename-column-col-1").click();

    const input = page.getByTestId("rename-column-input");
    await input.clear();
    await input.fill("점심");
    await page.getByTestId("rename-column-save").click();

    await expect(page.getByTestId("rename-column-sheet-error")).toContainText("이미 있는 끼니 이름");
  });

  test("shows column loading skeleton", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);

    const deferred: { resolve: (() => void) | null } = { resolve: null };
    await page.route("**/api/v1/planner/columns", async (route) => {
      await new Promise<void>((resolve) => { deferred.resolve = resolve; });
      await route.fulfill({
        json: { success: true, data: { columns: makeDefaultColumns() }, error: null },
      });
    });

    await page.goto("/settings");

    await expect(page.getByTestId("columns-loading")).toBeVisible();
    deferred.resolve?.();
    await expect(page.getByTestId("column-list")).toBeVisible();
  });

  test("shows column load error with retry", async ({ page }) => {
    await setAuthOverride(page, "authenticated");
    await installSettingsRoutes(page);
    await installColumnRoutes(page, { columnsError: true });
    await page.goto("/settings");

    await expect(page.getByTestId("columns-error")).toBeVisible();
    await expect(page.getByTestId("columns-error")).toContainText("끼니 컬럼을 불러오지 못했어요");
  });

  test("column management is hidden for unauthenticated users", async ({ page }) => {
    await setAuthOverride(page, "guest");
    await page.goto("/settings");

    await expect(page.getByRole("heading", { name: "로그인이 필요해요" })).toBeVisible();
    await expect(page.getByTestId("column-management-section")).not.toBeVisible();
  });
});
