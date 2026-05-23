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

    expect(screen.getByRole("heading", { name: "설정" })).toBeTruthy();
    expect(
      screen.queryByRole("navigation", { name: "설정 하단 탭" }),
    ).toBeNull();
  });

  it("does not render bottom tabs on the mobile account push shell", () => {
    render(
      <SettingsMobileScreen
        {...SETTINGS_MOBILE_BASE_PROPS}
        surface="account"
      />,
    );

    expect(screen.getByRole("heading", { name: "계정 정보" })).toBeTruthy();
    expect(
      screen.queryByRole("navigation", { name: "설정 하단 탭" }),
    ).toBeNull();
  });

  it("mobile loading back button navigates to /mypage", async () => {
    installMatchMedia(true);
    mockFetchUserProfile.mockReturnValue(new Promise(() => {}));
    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    const backButton = screen.getByLabelText("뒤로가기");
    expect(backButton).toBeTruthy();

    await user.click(backButton);
    expect(mockRouterReplace).toHaveBeenCalledWith("/mypage");
    expect(mockRouterPush).not.toHaveBeenCalled();
  });

  // --- Loading ---

  it("shows loading skeleton initially", () => {
    mockFetchUserProfile.mockReturnValue(new Promise(() => {}));
    render(<SettingsScreen initialAuthenticated={true} />);
    expect(screen.getByRole("heading", { name: "설정" })).toBeTruthy();
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
    expect(screen.getByRole("heading", { name: "설정" })).toBeTruthy();
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
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    render(<SettingsScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("요리모드 화면 꺼짐 방지")).toBeTruthy();
    });

    expect(screen.getByText("닉네임")).toBeTruthy();
    expect(screen.getByText("집밥러")).toBeTruthy();
    expect(screen.getByText("로그아웃")).toBeTruthy();
    expect(screen.getByText("회원탈퇴")).toBeTruthy();
  });

  it("links the desktop breadcrumb back to the mypage account tab", async () => {
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    render(<SettingsScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("요리모드 화면 꺼짐 방지")).toBeTruthy();
    });

    const breadcrumb = screen.getByRole("navigation", { name: "설정 경로" });
    expect(
      within(breadcrumb).getByRole("link", { name: /마이페이지/ }).getAttribute("href"),
    ).toBe("/mypage?tab=account");
  });

  it("preserves the account tab return target from the settings URL", async () => {
    navigationMocks.searchParams.mockReturnValue(
      new URLSearchParams({ returnTo: "/mypage?tab=account" }),
    );
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    render(<SettingsScreen initialAuthenticated={true} />);

    await waitFor(() => {
      expect(screen.getByText("요리모드 화면 꺼짐 방지")).toBeTruthy();
    });

    const breadcrumb = screen.getByRole("navigation", { name: "설정 경로" });
    expect(
      within(breadcrumb).getByRole("link", { name: /마이페이지/ }).getAttribute("href"),
    ).toBe("/mypage?tab=account");
  });

  // --- Wake lock toggle ---

  it("toggles screen wake lock on click", async () => {
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    mockUpdateSettings.mockResolvedValue({ settings: { screen_wake_lock: true } });

    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("요리모드 화면 꺼짐 방지")).toBeTruthy();
    });

    const toggle = screen.getByRole("switch");
    await user.click(toggle);

    expect(mockUpdateSettings).toHaveBeenCalledWith({ screen_wake_lock: true });
  });

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

  // --- Nickname sheet ---

  it("opens nickname edit sheet and validates input", async () => {
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("닉네임")).toBeTruthy();
    });

    await user.click(screen.getByTestId("nickname-row"));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "닉네임 변경" })).toBeTruthy();
    });

    const input = screen.getByRole("textbox");
    expect(input).toBe(document.activeElement);
    await user.clear(input);
    await user.type(input, "집");

    const saveButton = screen.getByText("변경하기");
    expect(saveButton.closest("button")?.disabled).toBe(true);
  });

  it("exposes nickname row label and closes the nickname sheet from the backdrop", async () => {
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByLabelText("닉네임 변경, 현재 닉네임: 집밥러")).toBeTruthy();
    });

    await user.click(screen.getByLabelText("닉네임 변경, 현재 닉네임: 집밥러"));

    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "닉네임 변경" })).toBeTruthy();
    });

    await user.click(screen.getByTestId("nickname-sheet-backdrop"));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "닉네임 변경" })).toBeNull();
    });
  });

  it("saves nickname successfully and updates display", async () => {
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    mockUpdateNickname.mockResolvedValue({
      ...MOCK_PROFILE,
      nickname: "새집밥러",
    });

    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("닉네임")).toBeTruthy();
    });

    await user.click(screen.getByTestId("nickname-row"));

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "새집밥러");

    await user.click(screen.getByText("변경하기"));

    expect(mockUpdateNickname).toHaveBeenCalledWith("새집밥러");

    await waitFor(() => {
      expect(screen.getByText("새집밥러")).toBeTruthy();
    });
  });

  it("shows visible error in nickname sheet when save fails", async () => {
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    const apiError = new Error("사용할 수 없는 닉네임이에요.");
    Object.assign(apiError, { status: 422, code: "VALIDATION_ERROR", fields: [] });
    mockUpdateNickname.mockRejectedValue(apiError);

    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("닉네임")).toBeTruthy();
    });

    await user.click(screen.getByTestId("nickname-row"));

    const input = screen.getByRole("textbox");
    await user.clear(input);
    await user.type(input, "새집밥러");
    await user.click(screen.getByText("변경하기"));

    await waitFor(() => {
      expect(screen.getByTestId("nickname-error")).toBeTruthy();
      expect(screen.getByText("사용할 수 없는 닉네임이에요.")).toBeTruthy();
    });

    // Sheet should still be open
    expect(screen.getByRole("dialog", { name: "닉네임 변경" })).toBeTruthy();
  });

  // --- Delete account ---

  it("shows delete confirmation dialog and handles cancel", async () => {
    mockFetchUserProfile.mockResolvedValue(MOCK_PROFILE);
    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("회원탈퇴")).toBeTruthy();
    });

    await user.click(screen.getByText("회원탈퇴"));

    await waitFor(() => {
      expect(screen.getByText("정말 계정을 삭제할까요?")).toBeTruthy();
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

    render(<SettingsScreen initialAuthenticated={true} />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByText("회원탈퇴")).toBeTruthy();
    });

    await user.click(screen.getByText("회원탈퇴"));

    await waitFor(() => {
      expect(screen.getByText("정말 계정을 삭제할까요?")).toBeTruthy();
    });

    await user.click(within(screen.getByRole("alertdialog")).getByText("계정 삭제"));

    await waitFor(() => {
      expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockRouterReplace).toHaveBeenCalledWith("/");
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
      expect(screen.getByText("회원탈퇴")).toBeTruthy();
    });

    await user.click(screen.getByText("회원탈퇴"));

    await waitFor(() => {
      expect(screen.getByText("정말 계정을 삭제할까요?")).toBeTruthy();
    });

    await user.click(within(screen.getByRole("alertdialog")).getByText("계정 삭제"));

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
      expect(screen.getByText("회원탈퇴")).toBeTruthy();
    });

    await user.click(screen.getByText("회원탈퇴"));

    await waitFor(() => {
      expect(screen.getByText("정말 계정을 삭제할까요?")).toBeTruthy();
    });

    await user.click(within(screen.getByRole("alertdialog")).getByText("계정 삭제"));

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
      expect(mockLogout).toHaveBeenCalledTimes(1);
      expect(mockRouterReplace).toHaveBeenCalledWith("/");
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
