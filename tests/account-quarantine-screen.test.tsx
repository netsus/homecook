// @vitest-environment jsdom

import React from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AccountQuarantineScreen } from "@/components/auth/account-quarantine-screen";
import { ApiFetchError } from "@/lib/api/fetch-json";

const INTENT_KEY = "22222222-2222-4222-8222-222222222222";
const apiMocks = vi.hoisted(() => ({
  createIntent: vi.fn(),
  resolve: vi.fn(),
}));
const navigationMocks = vi.hoisted(() => ({
  replace: vi.fn(),
}));

vi.mock("@/lib/api/account-quarantine", () => ({
  createAccountQuarantineIntent: (...args: unknown[]) =>
    apiMocks.createIntent(...args),
  resolveAccountQuarantine: (...args: unknown[]) =>
    apiMocks.resolve(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigationMocks.replace }),
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: React.PropsWithChildren<{ href: string }>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function createApiError(status: number, code: string, message: string) {
  return new ApiFetchError({
    status,
    code,
    fields: [],
    message,
  });
}

describe("ACCOUNT_QUARANTINE screen", () => {
  beforeEach(() => {
    apiMocks.createIntent.mockReset();
    apiMocks.resolve.mockReset();
    navigationMocks.replace.mockReset();
    apiMocks.createIntent.mockImplementation((action: "activate" | "delete") => ({
      action,
      idempotencyKey: INTENT_KEY,
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps recovery primary and delete behind a separate review step", async () => {
    const user = userEvent.setup();
    render(
      <AccountQuarantineScreen
        gateState="auth-present"
        nextPath="/mypage?tab=saved"
      />,
    );

    expect(screen.getByRole("heading", { name: "계정 보호 중" })).toBeTruthy();
    expect(screen.getByText("일반 마이페이지는 열리지 않아요.")).toBeTruthy();
    expect(screen.queryByText("ACCOUNT_QUARANTINE")).toBeNull();
    expect(screen.queryByText(/현재 계정 세대/)).toBeNull();
    expect(screen.getByLabelText("복구할 계정의 닉네임")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("예: 무먹러"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "계정 복구" })
        .getAttribute("data-variant"),
    ).toBe("primary");
    expect(
      screen.getByRole("button", { name: "삭제 검토" })
        .getAttribute("data-variant"),
    ).toBe("secondary");
    expect(screen.queryByRole("button", { name: "삭제 시작" })).toBeNull();
    expect(screen.queryByTestId("mypage-content")).toBeNull();

    await user.click(screen.getByRole("button", { name: "삭제 검토" }));

    const dialog = screen.getByRole("dialog", {
      name: "정말 계정을 삭제할까요?",
    });
    expect(dialog).toBeTruthy();
    expect(within(dialog).getByText(/공개한 사용자 등록 완제품/)).toBeTruthy();
    expect(within(dialog).getByText(/개인 레시피/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "취소" }));
    expect(apiMocks.resolve).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("locks and isolates the background while delete review is open", async () => {
    const user = userEvent.setup();
    render(
      <AccountQuarantineScreen
        gateState="auth-present"
        nextPath="/mypage"
      />,
    );

    const background = screen.getByTestId("account-quarantine-background");
    await user.click(screen.getByRole("button", { name: "삭제 검토" }));

    expect(document.body.style.overflow).toBe("hidden");
    expect(background.getAttribute("aria-hidden")).toBe("true");
    expect(background.hasAttribute("inert")).toBe(true);

    await user.click(screen.getByRole("button", { name: "취소" }));

    expect(document.body.style.overflow).toBe("");
    expect(background.hasAttribute("aria-hidden")).toBe(false);
    expect(background.hasAttribute("inert")).toBe(false);
  });

  it("validates nickname, disables duplicate recovery, and returns to the saved path", async () => {
    const user = userEvent.setup();
    let complete!: (value: {
      resolution_status: "active";
      account_generation: number;
    }) => void;
    apiMocks.resolve.mockImplementation(() =>
      new Promise((resolve) => {
        complete = resolve;
      }),
    );

    render(
      <AccountQuarantineScreen
        gateState="auth-present"
        nextPath="/mypage?tab=saved"
      />,
    );

    await user.click(screen.getByRole("button", { name: "계정 복구" }));
    expect(screen.getByText("닉네임은 2~30자로 입력해 주세요.")).toBeTruthy();
    expect(apiMocks.resolve).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("복구할 계정의 닉네임"), {
      target: { value: "  집밥러  " },
    });
    await user.click(screen.getByRole("button", { name: "계정 복구" }));

    expect(apiMocks.resolve).toHaveBeenCalledWith({
      action: "activate",
      idempotencyKey: INTENT_KEY,
      nickname: "집밥러",
    });
    expect(screen.getByText("처리 중이에요. 잠시만 기다려 주세요.")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "처리 중" }).hasAttribute("disabled"),
    ).toBe(true);

    complete({ resolution_status: "active", account_generation: 3 });
    await waitFor(() => {
      expect(navigationMocks.replace).toHaveBeenCalledWith(
        "/mypage?tab=saved",
      );
    });
    expect(apiMocks.resolve).toHaveBeenCalledTimes(1);
  });

  it("submits delete once from confirmation and treats cleanup_pending as incomplete", async () => {
    const user = userEvent.setup();
    apiMocks.resolve.mockResolvedValue({
      deletion_status: "cleanup_pending",
    });

    render(
      <AccountQuarantineScreen
        gateState="auth-present"
        nextPath="/mypage"
      />,
    );

    await user.click(screen.getByRole("button", { name: "삭제 검토" }));
    await user.click(screen.getByRole("button", { name: "삭제 시작" }));

    expect(apiMocks.resolve).toHaveBeenCalledWith({
      action: "delete",
      idempotencyKey: INTENT_KEY,
    });
    expect(await screen.findByText(
      "계정 정리를 시작했어요. 아직 완료되지 않았어요.",
    )).toBeTruthy();
    expect(screen.queryByText("계정 삭제가 완료됐어요.")).toBeNull();
    expect(apiMocks.resolve).toHaveBeenCalledTimes(1);
  });

  it("traps confirmation focus and returns it to the delete review trigger", async () => {
    const user = userEvent.setup();
    render(
      <AccountQuarantineScreen
        gateState="auth-present"
        nextPath="/mypage"
      />,
    );

    const reviewButton = screen.getByRole("button", { name: "삭제 검토" });
    await user.click(reviewButton);
    const cancelButton = screen.getByRole("button", { name: "취소" });
    const confirmButton = screen.getByRole("button", { name: "삭제 시작" });

    expect(document.activeElement).toBe(cancelButton);
    await user.tab({ shift: true });
    expect(document.activeElement).toBe(confirmButton);
    await user.tab();
    expect(document.activeElement).toBe(cancelButton);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(document.activeElement).toBe(reviewButton));
    expect(apiMocks.resolve).not.toHaveBeenCalled();
  });

  it("shows auth-absent support only without activate or delete controls", () => {
    render(
      <AccountQuarantineScreen
        gateState="auth-absent"
        nextPath="/mypage"
      />,
    );

    expect(screen.getByRole("heading", { name: "계정 확인이 필요해요" }))
      .toBeTruthy();
    expect(screen.getByText(/자동 복구와 자동 삭제는 제공하지 않아요/))
      .toBeTruthy();
    expect(screen.queryByRole("button", { name: "계정 복구" })).toBeNull();
    expect(screen.queryByRole("button", { name: "삭제 검토" })).toBeNull();
    expect(apiMocks.createIntent).not.toHaveBeenCalled();
  });

  it.each([
    ["loading", "계정 상태를 확인하고 있어요"],
    ["not-applicable", "계정 보호 화면이 필요하지 않아요"],
    ["maintenance", "지금은 계정 전환 작업 중이에요"],
  ] as const)("renders the %s state without mutation controls", (gateState, copy) => {
    render(
      <AccountQuarantineScreen
        gateState={gateState}
        nextPath="/mypage"
      />,
    );

    expect(screen.getByText(copy)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "계정 복구" })).toBeNull();
    expect(screen.queryByRole("button", { name: "삭제 검토" })).toBeNull();
  });

  it("maps stale sessions to login with the same quarantine return intent", async () => {
    const user = userEvent.setup();
    apiMocks.resolve.mockRejectedValue(createApiError(
      409,
      "ACCOUNT_SESSION_STALE",
      "세션을 다시 확인해 주세요.",
    ));

    render(
      <AccountQuarantineScreen
        gateState="auth-present"
        nextPath="/mypage?tab=saved"
      />,
    );
    fireEvent.change(screen.getByLabelText("복구할 계정의 닉네임"), {
      target: { value: "집밥러" },
    });
    await user.click(screen.getByRole("button", { name: "계정 복구" }));

    const login = await screen.findByRole("link", { name: "다시 로그인" });
    expect(login.getAttribute("href")).toBe(
      "/login?next=%2Faccount-quarantine%3Fnext%3D%252Fmypage%253Ftab%253Dsaved",
    );
    expect(screen.queryByTestId("mypage-content")).toBeNull();
  });

  it.each([
    [
      createApiError(
        409,
        "ACCOUNT_QUARANTINE_MANUAL_RECOVERY_REQUIRED",
        "수동 복구가 필요해요.",
      ),
      "계정 확인이 필요해요",
    ],
    [
      createApiError(
        503,
        "ACCOUNT_LIFECYCLE_MAINTENANCE",
        "전환 작업 중이에요.",
      ),
      "지금은 계정 전환 작업 중이에요",
    ],
    [
      createApiError(
        409,
        "IDEMPOTENCY_KEY_REUSED",
        "다른 요청에 사용된 키예요.",
      ),
      "요청 내용이 달라서 처리할 수 없어요",
    ],
    [
      createApiError(
        409,
        "ACCOUNT_DELETING",
        "계정 정리 중이에요.",
      ),
      "계정 정리를 시작했어요. 아직 완료되지 않았어요.",
    ],
  ])("maps exact API errors without exposing normal MYPAGE", async (error, copy) => {
    const user = userEvent.setup();
    apiMocks.resolve.mockRejectedValue(error);
    render(
      <AccountQuarantineScreen
        gateState="auth-present"
        nextPath="/mypage"
      />,
    );
    fireEvent.change(screen.getByLabelText("복구할 계정의 닉네임"), {
      target: { value: "집밥러" },
    });

    await user.click(screen.getByRole("button", { name: "계정 복구" }));

    expect(await screen.findByText(copy)).toBeTruthy();
    expect(screen.queryByTestId("mypage-content")).toBeNull();
  });

  it("retries a transient recovery error with the same idempotency intent", async () => {
    const user = userEvent.setup();
    apiMocks.resolve
      .mockRejectedValueOnce(new Error("temporary network failure"))
      .mockResolvedValueOnce({
        resolution_status: "active",
        account_generation: 3,
      });
    render(
      <AccountQuarantineScreen
        gateState="auth-present"
        nextPath="/mypage"
      />,
    );
    fireEvent.change(screen.getByLabelText("복구할 계정의 닉네임"), {
      target: { value: "집밥러" },
    });

    await user.click(screen.getByRole("button", { name: "계정 복구" }));
    await user.click(await screen.findByRole("button", { name: "다시 시도" }));

    await waitFor(() => {
      expect(navigationMocks.replace).toHaveBeenCalledWith("/mypage");
    });
    expect(apiMocks.createIntent).toHaveBeenCalledTimes(1);
    expect(apiMocks.resolve).toHaveBeenNthCalledWith(1, {
      action: "activate",
      idempotencyKey: INTENT_KEY,
      nickname: "집밥러",
    });
    expect(apiMocks.resolve).toHaveBeenNthCalledWith(2, {
      action: "activate",
      idempotencyKey: INTENT_KEY,
      nickname: "집밥러",
    });
  });
});
