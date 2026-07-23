import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getInitialAuthenticated: vi.fn(),
  readGate: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/lib/server/account-generation/quarantine-gate", () => ({
  readAccountQuarantineGate: mocks.readGate,
}));

vi.mock("@/lib/auth/server-initial-auth", () => ({
  getInitialAuthenticatedFromServer: mocks.getInitialAuthenticated,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: React.PropsWithChildren) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

vi.mock("@/components/mypage/mypage-screen", () => ({
  MypageScreen: () => <div data-testid="mypage-content">normal mypage</div>,
}));

vi.mock("@/components/auth/account-quarantine-screen", () => ({
  AccountQuarantineScreen: ({
    gateState,
    nextPath,
  }: {
    gateState: string;
    nextPath: string;
  }) => (
    <div data-gate-state={gateState} data-next-path={nextPath}>
      quarantine
    </div>
  ),
}));

describe("ACCOUNT_QUARANTINE route and MYPAGE gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("React", React);
    mocks.redirect.mockImplementation((path: string) => {
      throw new Error(`NEXT_REDIRECT:${path}`);
    });
    mocks.getInitialAuthenticated.mockResolvedValue(true);
    mocks.readGate.mockResolvedValue({
      state: "auth-present",
      hasSession: true,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rechecks direct quarantine visits and preserves the safe return path", async () => {
    const { default: AccountQuarantinePage } = await import(
      "@/app/account-quarantine/page"
    );
    const result = await AccountQuarantinePage({
      searchParams: Promise.resolve({ next: "/mypage?restore=recipebook-tab" }),
    });
    const html = renderToStaticMarkup(result);

    expect(html).toContain('data-gate-state="auth-present"');
    expect(html).toContain(
      'data-next-path="/mypage?restore=recipebook-tab"',
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("redirects non-quarantined direct visits instead of exposing the screen", async () => {
    mocks.readGate.mockResolvedValue({
      state: "not-applicable",
      hasSession: false,
    });
    const { default: AccountQuarantinePage } = await import(
      "@/app/account-quarantine/page"
    );

    await expect(AccountQuarantinePage({
      searchParams: Promise.resolve({ next: "https://evil.example" }),
    })).rejects.toThrow("NEXT_REDIRECT:/mypage");
    expect(mocks.redirect).toHaveBeenCalledWith("/mypage");
  });

  it("renders quarantine before normal MYPAGE content", async () => {
    const { default: MypagePage } = await import("@/app/mypage/page");
    const result = await MypagePage({
      searchParams: Promise.resolve({
        restore: "recipebook-tab",
      }),
    });
    const html = renderToStaticMarkup(result);

    expect(html).toContain("quarantine");
    expect(html).toContain(
      'data-next-path="/mypage?restore=recipebook-tab"',
    );
    expect(html).not.toContain("normal mypage");
    expect(mocks.getInitialAuthenticated).not.toHaveBeenCalled();
  });

  it("keeps legacy and ordinary signed-out MYPAGE behavior unchanged", async () => {
    const { default: MypagePage } = await import("@/app/mypage/page");
    mocks.readGate.mockResolvedValueOnce({
      state: "not-applicable",
      hasSession: false,
    });

    const legacyResult = await MypagePage({
      searchParams: Promise.resolve({}),
    });
    expect(renderToStaticMarkup(legacyResult)).toContain("normal mypage");

    mocks.readGate.mockResolvedValueOnce({
      state: "unauthorized",
      hasSession: false,
    });
    mocks.getInitialAuthenticated.mockResolvedValueOnce(false);
    const guestResult = await MypagePage({
      searchParams: Promise.resolve({}),
    });
    expect(renderToStaticMarkup(guestResult)).toContain("normal mypage");
  });
});
