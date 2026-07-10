// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LinkedAuthProviders } from "@/components/auth/linked-auth-providers";

const getUserIdentities = vi.fn();
const linkIdentity = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/supabase/env", () => ({ hasSupabasePublicEnv: () => true }));
vi.mock("@/lib/supabase/browser", () => ({
  getSupabaseBrowserClient: () => ({ auth: { getUserIdentities, linkIdentity } }),
}));

describe("LinkedAuthProviders", () => {
  beforeEach(() => {
    getUserIdentities.mockReset();
    linkIdentity.mockReset();
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
  });
});
