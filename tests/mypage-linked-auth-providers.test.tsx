// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LinkedAuthProviders } from "@/components/auth/linked-auth-providers";

const getUserIdentities = vi.fn();
const linkIdentity = vi.fn();
let publicEnvAvailable = true;
let searchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/lib/supabase/env", () => ({ hasSupabasePublicEnv: () => publicEnvAvailable }));
vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({ auth: { getUserIdentities, linkIdentity } }),
}));

describe("LinkedAuthProviders", () => {
  beforeEach(() => {
    getUserIdentities.mockReset();
    linkIdentity.mockReset();
    publicEnvAvailable = true;
    searchParams = new URLSearchParams();
  });
  afterEach(cleanup);

  it("uses Supabase identities as truth and keeps linked rows read-only", async () => {
    getUserIdentities.mockResolvedValue({ data: { identities: [{ provider: "google" }] }, error: null });
    render(<LinkedAuthProviders />);
    expect(await screen.findByText("Google 연결됨")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Google 연결/ })).toBeNull();
    expect(screen.getByRole("button", { name: "네이버 연결" })).toBeTruthy();
  });

  it("starts an unlinked provider with the dedicated callback and disables duplicate action", async () => {
    getUserIdentities.mockResolvedValue({ data: { identities: [{ provider: "google" }] }, error: null });
    linkIdentity.mockReturnValue(new Promise(() => {}));
    render(<LinkedAuthProviders />);
    await userEvent.click(await screen.findByRole("button", { name: "네이버 연결" }));
    expect(linkIdentity).toHaveBeenCalledWith(expect.objectContaining({
      provider: "custom:naver",
      options: expect.objectContaining({ redirectTo: expect.stringContaining("/auth/link/callback") }),
    }));
    await waitFor(() => expect(screen.getByRole("button", { name: "네이버 연결 중" }).hasAttribute("disabled")).toBe(true));
    expect(screen.getByRole("button", { name: "카카오 연결" }).hasAttribute("disabled")).toBe(false);
  });

  it("shows the backend linked result as a successful connection", async () => {
    searchParams = new URLSearchParams("linkResult=linked");
    getUserIdentities.mockResolvedValue({ data: { identities: [{ provider: "google" }, { provider: "custom:naver" }] }, error: null });

    render(<LinkedAuthProviders />);

    expect(await screen.findByText("로그인 방법이 연결됐어요.")).toBeTruthy();
  });

  it("shows the backend cancellation code as a cancellation instead of a failure", async () => {
    searchParams = new URLSearchParams("linkError=link_cancelled");
    getUserIdentities.mockResolvedValue({ data: { identities: [{ provider: "google" }] }, error: null });

    render(<LinkedAuthProviders />);

    expect(await screen.findByText("연결을 취소했어요.")).toBeTruthy();
    expect(screen.queryByText("연결에 실패했어요. 잠시 후 다시 연결해 주세요.")).toBeNull();
  });

  it("renders loading, empty, error, and unauthorized states without exposing identity data", async () => {
    getUserIdentities.mockReturnValueOnce(new Promise(() => {}));
    const loadingView = render(<LinkedAuthProviders />);
    expect(screen.getByText("연결 상태를 불러오는 중...")).toBeTruthy();
    loadingView.unmount();

    getUserIdentities.mockResolvedValueOnce({
      data: { identities: [{ provider: "kakao" }, { provider: "custom:naver" }, { provider: "google" }] },
      error: null,
    });
    const emptyView = render(<LinkedAuthProviders />);
    expect(await screen.findByText("사용 가능한 로그인 방법이 모두 연결됐어요.")).toBeTruthy();
    emptyView.unmount();

    getUserIdentities.mockResolvedValueOnce({ data: null, error: new Error("user@example.com") });
    const errorView = render(<LinkedAuthProviders />);
    expect(await screen.findByText("연결 상태를 불러오지 못했어요.")).toBeTruthy();
    expect(screen.queryByText(/user@example\.com/)).toBeNull();
    errorView.unmount();

    publicEnvAvailable = false;
    render(<LinkedAuthProviders />);
    expect(screen.getByText(/로그인 후 연결 상태를 확인할 수 있어요/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "로그인으로 이동" }).getAttribute("href")).toBe("/login?next=/mypage");
  });
});
