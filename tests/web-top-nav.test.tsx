// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { join } from "node:path";
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { WebTopNav } from "@/components/web/web-top-nav";

describe("WebTopNav service name", () => {
  afterEach(cleanup);

  it("uses the same canonical horizontal logo on non-HOME navigation", () => {
    vi.stubEnv("NEXT_PUBLIC_PRELAUNCH_UI", "true");
    render(<WebTopNav activeId="planner" />);

    const brand = screen.getByRole("link", { name: "무먹, 무엇을 먹든" });
    expect(brand.textContent).toBe("");

    const logo = brand.querySelector("img");
    expect(logo).not.toBeNull();
    expect(logo?.getAttribute("src")).toContain(
      "/brand/mumeok-logo-horizontal.png",
    );
    expect(logo?.getAttribute("alt")).toBe("");
    expect(logo?.getAttribute("aria-hidden")).toBe("true");
    expect(within(screen.getByRole("banner")).getByLabelText("서비스 준비 안내"))
      .toBeTruthy();
  });

  it("uses the same canonical horizontal logo on HOME navigation", () => {
    vi.stubEnv("NEXT_PUBLIC_PRELAUNCH_UI", "true");
    render(<WebTopNav activeId="home" />);

    const brand = screen.getByRole("link", {
      name: "무먹, 무엇을 먹든",
    });
    const logo = brand.querySelector("img");
    expect(logo).not.toBeNull();
    expect(logo?.getAttribute("src")).toContain(
      "/brand/mumeok-logo-horizontal.png",
    );
    expect(logo?.getAttribute("alt")).toBe("");
  });

  it("uses a pill background without a bottom-line selected state", () => {
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
    const activeRule = css.match(/\.web-topnav-tab-active \{[^}]+\}/)?.[0] ?? "";

    expect(activeRule).toContain("border-radius: var(--web-r-pill)");
    expect(activeRule).not.toContain("box-shadow");
  });
});


describe("planner destinations", () => {
  afterEach(cleanup);
  it("keeps both dated planner destinations and delegates in-screen segment changes", () => {
    const onSelect = vi.fn();
    render(<WebTopNav activeId="planner" plannerDate="2026-09-06" plannerSegment="log" onPlannerSegmentSelect={onSelect} />);
    const plan = screen.getByRole("link", { name: "요리 계획" });
    const log = screen.getByRole("link", { name: "식사 기록" });
    expect(plan.getAttribute("href")).toBe("/planner?date=2026-09-06");
    expect(log.getAttribute("href")).toBe("/planner?date=2026-09-06&segment=log");
    expect(log.getAttribute("aria-current")).toBe("page");
    expect(plan.getAttribute("aria-current")).toBeNull();
    expect(screen.queryByRole("link", { name: "마이페이지" })).toBeNull();
    fireEvent.click(plan);
    expect(onSelect).toHaveBeenCalledWith("plan");
  });
});
