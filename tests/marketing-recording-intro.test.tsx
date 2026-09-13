// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketingDemandValidationHero } from "@/components/marketing/marketing-demand-validation-hero";

vi.mock("@/lib/api/marketing-validation", () => { throw new Error("Pure Hero must not import the legacy API"); });
vi.mock("@/lib/marketing/marketing-validation-client-session", () => { throw new Error("Pure Hero must not import the legacy session"); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const props = { variant: "a" as const, presentation: "recording-intro" as const, onStart: () => {} };

describe("controlled recording first screen presentation", () => {
  it("uses the exact requested title without replacing the existing body and food visual", () => {
    render(<MarketingDemandValidationHero {...props} />);
    expect(screen.getByRole("heading", { level: 1, name: "베타 오픈 전 수요조사" })).toBeTruthy();
    expect(screen.getByText(/집밥도/).textContent).toBe("집밥도 편하게\n식단 기록해요.");
    expect(screen.getByAltText("유튜브 제육볶음 레시피 영상").getAttribute("src")).toBe("/assets/funnel/food/recipe-jeyuk-thumbnail.webp");
  });

  it("shows the serial three-step order as an ordered list", () => {
    render(<MarketingDemandValidationHero {...props} />);
    const order = screen.getByRole("list", { name: "진행 순서" });
    expect(order.tagName).toBe("OL");
    expect(within(order).getAllByRole("listitem").map(item => item.textContent?.replace(/\s*→\s*/g, ""))).toEqual(["4문항 테스트", "무먹 체험", "베타 알림 신청"]);
  });

  it("keeps the total time a small supporting note", () => {
    render(<MarketingDemandValidationHero {...props} />);
    expect(screen.getByText("전체 약 30초").tagName).toBe("SMALL");
  });

  it("delegates the exact primary CTA once to its caller without starting a controller", () => {
    const onStart = vi.fn();
    render(<MarketingDemandValidationHero {...props} onStart={onStart} />);
    fireEvent.click(screen.getByRole("button", { name: "4문항 테스트하기" }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("does not call fetch or persist a session on mount, lifecycle events or Start", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const onStart = vi.fn();
    render(<MarketingDemandValidationHero {...props} onStart={onStart} />);
    await act(async () => { window.dispatchEvent(new Event("pageshow")); window.dispatchEvent(new Event("online")); });
    fireEvent.click(screen.getByRole("button", { name: "4문항 테스트하기" }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });

  it("preserves a caller-controlled pending button", () => {
    const onStart = vi.fn();
    render(<MarketingDemandValidationHero {...props} pending onStart={onStart} />);
    const button = screen.getByRole("button", { name: "4문항 테스트하기" });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(onStart).not.toHaveBeenCalled();
  });
});
