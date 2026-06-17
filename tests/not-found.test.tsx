// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import NotFound from "@/app/not-found";

describe("NotFound", () => {
  afterEach(() => {
    cleanup();
  });

  it("offers clear recovery links from the 404 page", () => {
    render(<NotFound />);

    expect(screen.getByRole("heading", { name: "페이지를 찾을 수 없어요" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "홈으로" }).getAttribute("href")).toBe("/");
    expect(screen.getByRole("link", { name: "플래너로" }).getAttribute("href")).toBe("/planner");
  });
});
