// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SettingsScreen } from "@/components/settings/settings-screen";
import { SettingsMobileScreen } from "@/components/settings/settings-mobile-screen";

const mockFetchUserProfile = vi.fn();
const mockUpdateSettings = vi.fn();
const mockUpdateNickname = vi.fn();
const mockDeleteAccount = vi.fn();
const mockLogout = vi.fn();
const mockUpdatePlannerColumn = vi.fn();

vi.mock("@/lib/api/mypage", () => ({
  fetchUserProfile: (...args: unknown[]) => mockFetchUserProfile(...args),
  updateSettings: (...args: unknown[]) => mockUpdateSettings(...args),
  updateNickname: (...args: unknown[]) => mockUpdateNickname(...args),
  deleteAccount: (...args: unknown[]) => mockDeleteAccount(...args),
  logout: (...args: unknown[]) => mockLogout(...args),
  isMypageApiError: (error: unknown) => error instanceof Error && "status" in error,
}));

vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  }),
}));

vi.mock("@/lib/supabase/env", () => ({
  hasSupabasePublicEnv: () => false,
}));

vi.mock("@/lib/auth/e2e-auth-override", () => ({
  readE2EAuthOverride: () => null,
  withE2EAuthOverrideHeaders: (init?: RequestInit) => init ?? {},
}));

vi.mock("@/lib/api/planner", () => ({
  fetchPlannerColumns: vi.fn(async () => ({
    columns: [
      { id: "col-1", name: "아침", sort_order: 0 },
      { id: "col-2", name: "점심", sort_order: 1 },
      { id: "col-3", name: "저녁", sort_order: 2 },
    ],
  })),
  createPlannerColumn: vi.fn(async (name: string) => ({
    column: { id: "col-new", name, sort_order: 3 },
  })),
  updatePlannerColumn: (...args: unknown[]) => mockUpdatePlannerColumn(...args),
  deletePlannerColumn: vi.fn(async () => ({ deleted: true })),
  isPlannerApiError: (error: unknown) =>
    error instanceof Error && "status" in error,
}));

const mockRouterReplace = vi.fn();
const mockRouterPush = vi.fn();
const navigationMocks = vi.hoisted(() => ({
  searchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
    back: vi.fn(),
  }),
  useSearchParams: () => navigationMocks.searchParams(),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    prefetch: _prefetch,
    ...rest
  }: React.PropsWithChildren<{ href: string; prefetch?: boolean }>) => {
    void _prefetch;

    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
}));

vi.mock("@/components/shared/content-state", () => ({
  ContentState: ({
    title,
    description,
    children,
  }: {
    title: string;
    description: string;
    children?: React.ReactNode;
  }) => (
    <div data-testid="content-state">
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  ),
}));

vi.mock("@/components/auth/social-login-buttons", () => ({
  SocialLoginButtons: ({ nextPath }: { nextPath: string }) => (
    <div data-testid="social-login-buttons" data-next-path={nextPath}>
      소셜 로그인
    </div>
  ),
}));

const MOCK_PROFILE = {
  id: "user-1",
  nickname: "집밥러",
  email: "user@example.com",
  profile_image_url: null,
  social_provider: "kakao" as const,
  settings: { screen_wake_lock: false },
};

const SETTINGS_MOBILE_BASE_PROPS = {
  columnAddError: null,
  columnAddInput: "",
  columnAddSaveDisabled: true,
  columnRenameError: null,
  columnRenameInput: "",
  columnRenameSaveDisabled: true,
  columnsEditMode: false,
  columnsError: null,
  columnsLoading: false,
  deleteColumnError: null,
  deleteColumnTarget: null,
  deleteError: null,
  errorMessage: null,
  feedbackMessage: null,
  isAddingColumn: false,
  isDeleting: false,
  isDeletingColumn: false,
  isLoggingOut: false,
  isRenamingColumn: false,
  isSavingNickname: false,
  logoutError: null,
  nicknameError: null,
  nicknameInput: "",
  nicknameSaveDisabled: true,
  plannerColumns: [],
  profile: MOCK_PROFILE,
  renameTarget: null,
  showColumnAddSheet: false,
  showDeleteDialog: false,
  showLogoutDialog: false,
  showNicknameSheet: false,
  surface: "settings" as const,
  onAddColumn: vi.fn(),
  onCloseColumnAddSheet: vi.fn(),
  onCloseDeleteColumnDialog: vi.fn(),
  onCloseDeleteDialog: vi.fn(),
  onCloseLogoutDialog: vi.fn(),
  onCloseNicknameSheet: vi.fn(),
  onCloseRenameColumnSheet: vi.fn(),
  onColumnsEditModeChange: vi.fn(),
  onColumnAddInputChange: vi.fn(),
  onColumnRenameInputChange: vi.fn(),
  onConfirmDelete: vi.fn(),
  onConfirmDeleteColumn: vi.fn(),
  onConfirmLogout: vi.fn(),
  onDeleteColumnTarget: vi.fn(),
  onMoveColumn: vi.fn(),
  onOpenColumnAddSheet: vi.fn(),
  onOpenDeleteDialog: vi.fn(),
  onOpenLogoutDialog: vi.fn(),
  onOpenNicknameSheet: vi.fn(),
  onRenameColumn: vi.fn(),
  onRenameColumnTarget: vi.fn(),
  onRetryColumns: vi.fn(),
  onSaveNickname: vi.fn(),
  onToggleWakeLock: vi.fn(),
  onNicknameInputChange: vi.fn(),
};

function installMatchMedia(matchesAppView: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 1023px)" ? matchesAppView : !matchesAppView,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("SettingsScreen", () => {
  beforeEach(() => {
    installMatchMedia(false);
    mockFetchUserProfile.mockReset();
    mockUpdateSettings.mockReset();
    mockUpdateNickname.mockReset();
    mockDeleteAccount.mockReset();
    mockLogout.mockReset();
    mockUpdatePlannerColumn.mockReset();
    mockUpdatePlannerColumn.mockImplementation(
      async (columnId: string, updates: { name?: string; sort_order?: number } | string) => ({
        column: {
          id: columnId,
          name: typeof updates === "string" ? updates : `끼니-${columnId}`,
          sort_order: typeof updates === "object" && typeof updates.sort_order === "number"
            ? updates.sort_order
            : 0,
        },
      }),
    );
    mockRouterReplace.mockReset();
    mockRouterPush.mockReset();
    navigationMocks.searchParams.mockReset();
    navigationMocks.searchParams.mockReturnValue(new URLSearchParams());
  });

  afterEach(() => {
    cleanup();
    Reflect.deleteProperty(window, "matchMedia");
  });

  // --- AppBar ---

  it("does not render bottom tabs on the mobile push settings shell", () => {
    render(<SettingsMobileScreen {...SETTINGS_MOBILE_BASE_PROPS} />);

    expect(screen.getByRole("heading", { name: "환경설정" })).toBeTruthy();
    expect(
      screen.queryByRole("navigation", { name: "설정 하단 탭" }),
    ).toBeNull();
  });

  it("keeps the mobile account query on the same settings shell", () => {
    render(
      <SettingsMobileScreen
        {...SETTINGS_MOBILE_BASE_PROPS}
        surface="account"
      />,
    );

    expect(screen.getByRole("heading", { name: "환경설정" })).toBeTruthy();
    expect(
      screen.queryByRole("navigation", { name: "설정 하단 탭" }),
    ).toBeNull();
  });

  it("uses the web settings structure on mobile without inert save buttons", () => {
    render(
      <SettingsMobileScreen
        {...SETTINGS_MOBILE_BASE_PROPS}
        plannerColumns={[
          { id: "col-1", name: "아침", sort_order: 0 },
          { id: "col-2", name: "점심", sort_order: 1 },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "끼니 관리" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "요리 모드" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "계정" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "위험 영역" })).toBeTruthy();
    expect(screen.getByTestId("column-item-col-1").className).toContain(
      "settings-column-row",
    );
    expect(screen.queryByText("닉네임 변경")).toBeNull();
    expect(screen.queryByRole("button", { name: "저장" })).toBeNull();
    expect(screen.queryByRole("button", { name: "취소" })).toBeNull();
    expect(screen.getByRole("button", { name: "끼니 삭제" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "끼니 삭제" }).className).toContain(
      "web-settings-delete-button",
    );
    expect(screen.queryByRole("button", { name: "편집" })).toBeNull();
    expect(
      screen.queryByText(/식사가 있는 끼니는 삭제할 수 없어요/),
    ).toBeNull();
    expect(
      screen.getByText(/드래그해서 바꾼 순서는 플래너에 그대로 표시돼요/),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "점심 위로 이동" }).className).toContain(
      "web-settings-reorder-button",
    );
    expect(
      screen.getByRole("button", { name: "점심 위로 이동" }).querySelector("svg"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "점심 위로 이동" }).textContent).toBe("");
    expect(screen.getByRole("button", { name: "아침 아래로 이동" }).className).toContain(
      "web-settings-reorder-button",
    );
    expect(screen.getByText("계정 삭제").className).toContain("text-[var(--danger)]");
    expect(
      screen.getByText(
        "개인 기록은 삭제되고, 공개한 사용자 등록 완제품은 등록자 정보 없이 읽기 전용으로 남아 다른 사용자의 기존 식단 기록을 보호해요.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "계정 삭제하기" }).className).toContain(
      "min-h-11",
    );
  });

  it("reserves the mobile column-management layout while columns load", () => {
    render(
      <SettingsMobileScreen
        {...SETTINGS_MOBILE_BASE_PROPS}
        columnsLoading={true}
        plannerColumns={[]}
      />,
    );

    const section = screen.getByTestId("column-management-section");

    expect(
      within(section).getAllByTestId("settings-mobile-column-loading-row"),
    ).toHaveLength(3);
    expect(
      within(section).getByTestId("settings-mobile-column-add-loading"),
    ).toBeTruthy();
    expect(
      within(section).getByTestId("settings-mobile-column-help-loading"),
    ).toBeTruthy();
  });

  it("renders the mobile settings account profile image when it is available", () => {
    render(
      <SettingsMobileScreen
        {...SETTINGS_MOBILE_BASE_PROPS}
        profile={{
          ...MOCK_PROFILE,
          profile_image_url: "https://example.com/profile.png",
        }}
      />,
    );

    expect(screen.getByTestId("settings-mobile-account-profile-image")).toBeTruthy();
    expect(screen.queryByTestId("settings-mobile-account-profile-fallback")).toBeNull();
  });

  it("renders the mobile settings notification as a floating toast", () => {
    render(
      <SettingsMobileScreen
        {...SETTINGS_MOBILE_BASE_PROPS}
        feedbackMessage={{ message: "설정을 저장했어요.", tone: "success" }}
      />,
    );

    const toast = screen.getByTestId("settings-error-toast");
    expect(toast.className).toContain("fixed");
    expect(toast.className).toContain("z-50");
    expect(toast.className).toContain("top-");
    expect(toast.className).not.toContain("bottom-");
    expect(toast.className).toContain("pointer-events-none");
    expect(toast.className).toContain("growth-toast-card-xp");
    expect(toast.className).toContain("border-[var(--growth-toast-xp-border)]");
  });

  it("keeps meal edit and delete controls outside the meal name field", () => {
    render(
      <SettingsMobileScreen
        {...SETTINGS_MOBILE_BASE_PROPS}
        columnsEditMode
        plannerColumns={[
          { id: "col-1", name: "아침", sort_order: 0 },
          { id: "col-2", name: "점심", sort_order: 1 },
        ]}
      />,
    );

    const mealName = screen.getByTestId("column-name-col-1");
    expect(within(mealName).queryByRole("button")).toBeNull();
    expect(screen.getByRole("button", { name: "아침 이름 변경" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "아침 끼니 삭제" })).toBeTruthy();
  });

  it("hides the meal add form when five meals already exist", () => {
    render(
      <SettingsMobileScreen
        {...SETTINGS_MOBILE_BASE_PROPS}
        plannerColumns={[
          { id: "col-1", name: "아침", sort_order: 0 },
          { id: "col-2", name: "점심", sort_order: 1 },
          { id: "col-3", name: "저녁", sort_order: 2 },
          { id: "col-4", name: "간식", sort_order: 3 },
          { id: "col-5", name: "야식", sort_order: 4 },
        ]}
      />,
    );

    expect(screen.queryByTestId("add-column-input")).toBeNull();
    expect(screen.queryByTestId("add-column-button")).toBeNull();
    expect(
      screen.queryByText("끼니는 최대 5개까지 사용할 수 있어요.", { exact: true }),
    ).toBeNull();
    expect(
      screen.getByText(
        "끼니는 최대 5개까지 사용할 수 있어요. 드래그해서 바꾼 순서는 플래너에 그대로 표시돼요.",
      ),
    ).toBeTruthy();
  });

  it("moves meals with accessible reorder controls", () => {
    const onMoveColumn = vi.fn();
    render(
      <SettingsMobileScreen
        {...SETTINGS_MOBILE_BASE_PROPS}
        onMoveColumn={onMoveColumn}
        plannerColumns={[
          { id: "col-1", name: "아침", sort_order: 0 },
          { id: "col-2", name: "점심", sort_order: 1 },
        ]}
      />,
    );

    screen.getByRole("button", { name: "점심 위로 이동" }).click();

    expect(onMoveColumn).toHaveBeenCalledWith("col-2", 0);
  });

  it("mobile loading back button navigates to /mypage", async () => {
    installMatchMedia(true);
    mockFetchUserProfile.mockReturnValue(new Promise(() => {}));
    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    const backButton = screen.getByLabelText("뒤로 가기");
    expect(backButton).toBeTruthy();

    await user.click(backButton);
    expect(mockRouterReplace).toHaveBeenCalledWith("/mypage");
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  // --- Loading ---

  it("shows loading skeleton initially", () => {
    mockFetchUserProfile.mockReturnValue(new Promise(() => {}));
    render(<SettingsScreen initialAuthenticated={true} />);
    expect(screen.getByRole("heading", { name: "환경설정" })).toBeTruthy();
    expect(screen.getByTestId("settings-loading")).toBeTruthy();
  });

  it("keeps the desktop loading skeleton inside the web settings shell", () => {
    mockFetchUserProfile.mockReturnValue(new Promise(() => {}));

    render(<SettingsScreen initialAuthenticated={true} />);

    const loading = screen.getByTestId("settings-loading");
    expect(loading.closest(".web-settings-shell")).toBeTruthy();
    expect(
      screen.getByRole("navigation", { name: "데스크탑 주요 메뉴" }),
    ).toBeTruthy();
  });

  it("uses the mobile loading shell for settings/account routes", () => {
    installMatchMedia(true);
    mockFetchUserProfile.mockReturnValue(new Promise(() => {}));

    render(<SettingsScreen initialAuthenticated={true} />);

    expect(screen.getByTestId("settings-mobile-loading")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "환경설정" })).toBeTruthy();
  });

  it("mirrors the mobile settings section structure while loading", () => {
    installMatchMedia(true);
    mockFetchUserProfile.mockReturnValue(new Promise(() => {}));

    render(<SettingsScreen initialAuthenticated={true} />);

    const loading = screen.getByTestId("settings-loading");
    const loadingSections = within(loading).getAllByRole("region");

    expect(loadingSections).toHaveLength(4);
    expect(
      within(loading).getByRole("region", { name: "끼니 관리 로딩" }),
    ).toBeTruthy();
    expect(
      within(loading).getByRole("region", { name: "요리 모드 로딩" }),
    ).toBeTruthy();
    expect(
      within(loading).getByRole("region", { name: "계정 로딩" }),
    ).toBeTruthy();
    expect(
      within(loading).getByRole("region", { name: "위험 영역 로딩" }),
    ).toBeTruthy();
    expect(
      within(
        within(loading).getByRole("region", { name: "끼니 관리 로딩" }),
      ).getAllByTestId("settings-mobile-column-loading-row"),
    ).toHaveLength(3);
  });

  // --- Login gate ---

  it("shows login gate with SocialLoginButtons and login link for unauthenticated users", () => {
    render(<SettingsScreen initialAuthenticated={false} />);
    expect(screen.getByText("로그인이 필요해요")).toBeTruthy();
    const loginButtons = screen.getByTestId("social-login-buttons");
    expect(loginButtons).toBeTruthy();
    expect(loginButtons.getAttribute("data-next-path")).toBe("/settings");

    // Explicit login link with return-to-action
    const loginLink = screen.getByText("로그인 화면으로 이동");
    expect(loginLink).toBeTruthy();
    expect(loginLink.closest("a")?.getAttribute("href")).toBe("/login?next=/settings");

    expect(screen.getByText("홈으로 돌아가기")).toBeTruthy();
  });

  it("returns to the login gate when profile loading receives 401", async () => {
    const apiError = new Error("로그인이 필요해요.");
    Object.assign(apiError, { status: 401, code: "UNAUTHORIZED", fields: [] });
    mockFetchUserProfile.mockRejectedValue(apiError);

    render(<SettingsScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("로그인이 필요해요")).toBeTruthy();
    });

    expect(screen.getByTestId("social-login-buttons")).toBeTruthy();
    expect(screen.queryByText("데이터를 불러오지 못했어요")).toBeNull();
  });

  // --- Settings items rendering ---

  it("renders settings items after loading", async () => {
    mockFetchUserProfile.mockResolvedValue({
      ...MOCK_PROFILE,
      profile_image_url: "https://example.com/profile.png",
    });
    render(<SettingsScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("요리모드 화면 켜둠")).toBeTruthy();
    });

    expect(screen.getByText("집밥러")).toBeTruthy();
    expect(screen.getByText("로그아웃")).toBeTruthy();
    expect(screen.getByText("계정 삭제하기")).toBeTruthy();
    expect(screen.queryByText("닉네임 변경")).toBeNull();
    expect(screen.getByTestId("settings-account-profile-image")).toBeTruthy();
    expect(screen.getByTestId("column-management-section").className).toContain(
      "web-settings-bordered-section",
    );
    expect(screen.getByTestId("settings-cook-mode-section").className).toContain(
      "web-settings-bordered-section",
    );
    expect(screen.getByTestId("settings-account-section").className).toContain(
      "web-settings-bordered-section",
    );
    expect(screen.getByTestId("settings-danger-section").className).toContain(
      "web-settings-bordered-section",
    );
    expect(screen.getByRole("button", { name: "끼니 삭제" }).className).toContain(
      "web-settings-delete-button",
    );
    expect(
      screen.getByRole("button", { name: "끼니 삭제" }).closest(".web-settings-column-description-row"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("button", { name: "끼니 삭제" })
        .closest(".web-settings-column-description-row")?.textContent,
    ).toContain(
      "끼니는 최대 5개까지 사용할 수 있어요. 드래그해서 바꾼 순서는 플래너에 그대로 표시돼요.",
    );
  });

  it("links the desktop breadcrumb back to the mypage preferences tab", async () => {
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    render(<SettingsScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("요리모드 화면 켜둠")).toBeTruthy();
    });

    const breadcrumb = screen.getByRole("navigation", { name: "설정 경로" });
    expect(
      within(breadcrumb).getByRole("link", { name: /마이페이지/ }).getAttribute("href"),
    ).toBe("/mypage?tab=preferences");
  });

  it("normalizes an old account tab return target to preferences", async () => {
    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams({ returnTo: "/mypage?tab=account" }),
    );
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    render(<SettingsScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("요리모드 화면 켜둠")).toBeTruthy();
    });

    const breadcrumb = screen.getByRole("navigation", { name: "설정 경로" });
    expect(
      within(breadcrumb).getByRole("link", { name: /마이페이지/ }).getAttribute("href"),
    ).toBe("/mypage?tab=preferences");
  });

  // --- Wake lock toggle ---

  it("toggles screen wake lock on click", async () => {
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    mockUpdateSettings.mockResolvedValue({ settings: { screen_wake_lock: true } });

    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("요리모드 화면 켜둠")).toBeTruthy();
    });

    const toggle = screen.getByRole("switch");
    await user.click(toggle);

    expect(mockUpdateSettings).toHaveBeenCalledWith({ screen_wake_lock: true });
  });

  it("shows a saved notification on mobile after changing wake lock", async () => {
    installMatchMedia(true);
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    mockUpdateSettings.mockResolvedValue({ settings: { screen_wake_lock: true } });

    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole("switch")).toBeTruthy();
    });

    await user.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(screen.getByText("설정을 저장했어요.")).toBeTruthy();
    });
  });

  it("dismisses the mobile settings notification automatically", async () => {
    installMatchMedia(true);
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    mockUpdateSettings.mockResolvedValue({ settings: { screen_wake_lock: true } });
    const user = userEvent.setup();

    render(<SettingsScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByRole("switch")).toBeTruthy();
    });

    await user.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(screen.getByText("설정을 저장했어요.")).toBeTruthy();
    });

    await new Promise((resolve) => setTimeout(resolve, 3200));

    await waitFor(() => {
      expect(screen.queryByText("설정을 저장했어요.")).toBeNull();
    });
  }, 8000);

  it("shows error when settings toggle fails, reverts, and clears error on retry success", async () => {
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    const apiError = new Error("설정을 저장하지 못했어요.");
    Object.assign(apiError, { status: 500, code: "INTERNAL_ERROR", fields: [] });
    mockUpdateSettings.mockRejectedValueOnce(apiError);

    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole("switch")).toBeTruthy();
    });

    // First click - fails
    await user.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(screen.getByText("설정을 저장하지 못했어요.")).toBeTruthy();
    });

    // Check toggle reverted to off
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");

    // Second click - succeeds, stale error should be cleared
    mockUpdateSettings.mockResolvedValueOnce({ settings: { screen_wake_lock: true } });
    await user.click(screen.getByRole("switch"));

    await waitFor(() => {
      expect(screen.queryByText("설정을 저장하지 못했어요.")).toBeNull();
    });
  });

  // --- Account surface alignment ---

  it("does not expose nickname editing from settings routes", async () => {
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    render(<SettingsScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("집밥러")).toBeTruthy();
    });

    expect(screen.queryByTestId("nickname-row")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "닉네임 변경" })).toBeNull();
    expect(screen.queryByText("닉네임 변경")).toBeNull();
  });

  // --- Delete account ---

  it("shows delete confirmation dialog and handles cancel", async () => {
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("계정 삭제하기")).toBeTruthy();
    });

    await user.click(screen.getByText("계정 삭제하기"));

    await waitFor(() => {
      expect(screen.getByText("정말 계정을 삭제할까요?")).toBeTruthy();
      expect(
        screen.getByText(
          "레시피북, 플래너, 장보기, 팬트리 등 개인 기록은 삭제되며 되돌릴 수 없어요. 공개한 사용자 등록 완제품은 등록자 정보 없이 읽기 전용으로 남아 다른 사용자의 기존 식단 기록을 보호해요.",
        ),
      ).toBeTruthy();
    });

    await user.click(screen.getByText("취소"));

    await waitFor(() => {
      expect(screen.queryByText("정말 계정을 삭제할까요?")).toBeNull();
    });
  });

  it("deletes account, calls logout for cleanup, and navigates home", async () => {
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    mockDeleteAccount.mockResolvedValue({ deleted: true });
    mockLogout.mockResolvedValue({ logged_out: true });
    localStorage.setItem("homecook:last-auth-provider:v1", "google");
    document.cookie = "homecook-last-auth-provider=google; Path=/";

    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("계정 삭제하기")).toBeTruthy();
    });

    await user.click(screen.getByText("계정 삭제하기"));

    await waitFor(() => {
      expect(screen.getByText("정말 계정을 삭제할까요?")).toBeTruthy();
    });

    await user.click(within(screen.getByRole("alertdialog")).getByText("탈퇴하기"));

    await waitFor(() => {
      expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockRouterReplace).toHaveBeenCalledWith("/");
      expect(localStorage.getItem("homecook:last-auth-provider:v1")).toBeNull();
      expect(document.cookie).not.toContain("homecook-last-auth-provider=");
    });
  });

  it("shows error and stays on dialog when delete fails", async () => {
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    const apiError = new Error("탈퇴에 실패했어요.");
    Object.assign(apiError, { status: 500, code: "INTERNAL_ERROR", fields: [] });
    mockDeleteAccount.mockRejectedValue(apiError);

    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("계정 삭제하기")).toBeTruthy();
    });

    await user.click(screen.getByText("계정 삭제하기"));

    await waitFor(() => {
      expect(screen.getByText("정말 계정을 삭제할까요?")).toBeTruthy();
    });

    await user.click(within(screen.getByRole("alertdialog")).getByText("탈퇴하기"));

    await waitFor(() => {
      expect(screen.getByTestId("dialog-error")).toBeTruthy();
      expect(screen.getByText("탈퇴에 실패했어요.")).toBeTruthy();
    });

    // Dialog should still be open
    expect(screen.getByText("정말 계정을 삭제할까요?")).toBeTruthy();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("shows error and stays on dialog when delete succeeds but logout cleanup fails", async () => {
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    mockDeleteAccount.mockResolvedValue({ deleted: true });
    const logoutError = new Error("로그아웃에 실패했어요.");
    Object.assign(logoutError, { status: 500, code: "INTERNAL_ERROR", fields: [] });
    mockLogout.mockRejectedValue(logoutError);

    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("계정 삭제하기")).toBeTruthy();
    });

    await user.click(screen.getByText("계정 삭제하기"));

    await waitFor(() => {
      expect(screen.getByText("정말 계정을 삭제할까요?")).toBeTruthy();
    });

    await user.click(within(screen.getByRole("alertdialog")).getByText("탈퇴하기"));

    await waitFor(() => {
      expect(screen.getByTestId("dialog-error")).toBeTruthy();
      expect(
        screen.getByText("탈퇴는 완료되었으나 로그아웃에 실패했어요. 브라우저를 닫아주세요."),
      ).toBeTruthy();
    });

    // Dialog should still be open, no navigation
    expect(screen.getByText("정말 계정을 삭제할까요?")).toBeTruthy();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  // --- Logout ---

  it("calls logout and navigates home on success", async () => {
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    mockLogout.mockResolvedValue({ logged_out: true });
    localStorage.setItem("homecook:last-auth-provider:v1", "naver");
    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("로그아웃")).toBeTruthy();
    });

    await user.click(screen.getByText("로그아웃"));

    await waitFor(() => {
      expect(screen.getByText("로그아웃 할까요?")).toBeTruthy();
    });
    expect(screen.getByText("다시 로그인해야 식단·팬트리가 동기화돼요.")).toBeTruthy();

    await user.click(within(screen.getByRole("alertdialog")).getByText("로그아웃"));

    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockRouterReplace).toHaveBeenCalledWith("/");
      expect(localStorage.getItem("homecook:last-auth-provider:v1")).toBe("naver");
    });
  });

  it("shows error and stays on dialog when logout fails", async () => {
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    const apiError = new Error("로그아웃에 실패했어요.");
    Object.assign(apiError, { status: 500, code: "INTERNAL_ERROR", fields: [] });
    mockLogout.mockRejectedValue(apiError);

    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("로그아웃")).toBeTruthy();
    });

    await user.click(screen.getByText("로그아웃"));

    await waitFor(() => {
      expect(screen.getByText("로그아웃 할까요?")).toBeTruthy();
    });

    await user.click(within(screen.getByRole("alertdialog")).getByText("로그아웃"));

    await waitFor(() => {
      expect(screen.getByTestId("dialog-error")).toBeTruthy();
      expect(screen.getByText("로그아웃에 실패했어요.")).toBeTruthy();
    });

    // Dialog should still be open
    expect(screen.getByText("로그아웃 할까요?")).toBeTruthy();
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  // --- Error state ---

  it("shows error state when profile loading fails", async () => {
    const apiError = new Error("데이터를 불러오지 못했어요.");
    Object.assign(apiError, { status: 500, code: "INTERNAL_ERROR", fields: [] });
    mockFetchUserProfile.mockRejectedValue(apiError);

    render(<SettingsScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("데이터를 불러오지 못했어요")).toBeTruthy();
    });

    expect(screen.getByText("다시 시도")).toBeTruthy();
  });
});
