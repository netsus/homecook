// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrelaunchNotice, ServiceNotificationBoundary } from "@/components/shared/prelaunch-notice";
import { isPrelaunchFeatureLocked } from "@/lib/prelaunch";

const route = vi.hoisted(() => ({ pathname: "/planner" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

describe("prelaunch notices", () => {
  it("shows an inline preparation notice in the service by default", () => {
    vi.stubEnv("NEXT_PUBLIC_PRELAUNCH_UI", "true");
    route.pathname = "/planner";
    render(<PrelaunchNotice />);
    expect(screen.getByRole("status", { name: "서비스 준비 안내" })).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "서비스 준비 안내" })).toBeNull();
  });
  it.each(["/beta", "/beta/done"])("preserves the marketing viewport and suppresses service popups at %s", (pathname) => {
    route.pathname = pathname;
    render(<><PrelaunchNotice /><ServiceNotificationBoundary><div>성장 알림</div></ServiceNotificationBoundary></>);
    expect(screen.queryByLabelText("서비스 준비 안내")).toBeNull();
    expect(screen.queryByText("성장 알림")).toBeNull();
  });
  it("keeps service notifications and permits an explicit preparation-mode release", () => {
    vi.stubEnv("NEXT_PUBLIC_PRELAUNCH_UI", "false");
    route.pathname = "/planner";
    render(<><PrelaunchNotice /><ServiceNotificationBoundary><div>성장 알림</div></ServiceNotificationBoundary></>);
    expect(screen.queryByLabelText("서비스 준비 안내")).toBeNull();
    expect(screen.getByText("성장 알림")).toBeTruthy();
  });
  it("keeps the notice visible while QA fixtures exercise gated feature flows", () => {
    vi.stubEnv("NEXT_PUBLIC_PRELAUNCH_UI", "true");
    vi.stubEnv("NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES", "1");
    route.pathname = "/planner";
    render(<PrelaunchNotice />);
    expect(screen.getByLabelText("서비스 준비 안내")).toBeTruthy();
    expect(isPrelaunchFeatureLocked()).toBe(false);
  });
});
