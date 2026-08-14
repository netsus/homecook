// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  GLOBAL_TOAST_GROWTH_SLOT_ID,
  GLOBAL_TOAST_YOUTUBE_SLOT_ID,
  GlobalToastPresentationSlot,
} from "@/components/shared/global-toast-presentation-slot";

afterEach(cleanup);

describe("GlobalToastPresentationSlot", () => {
  it("owns one polite live region and a deterministic YouTube-then-growth reading order", () => {
    render(<GlobalToastPresentationSlot />);

    const layer = screen.getByTestId("global-toast-presentation-slot");
    expect(layer.getAttribute("aria-live")).toBe("polite");
    expect(layer.getAttribute("aria-relevant")).toBe("additions text");

    const orderedChannels = within(layer)
      .getAllByTestId(/global-toast-channel-/u)
      .map((element) => element.id);
    expect(orderedChannels).toEqual([
      GLOBAL_TOAST_YOUTUBE_SLOT_ID,
      GLOBAL_TOAST_GROWTH_SLOT_ID,
    ]);
  });

  it("keeps both channels in one pointer-safe stacking context", () => {
    render(<GlobalToastPresentationSlot />);
    const layer = screen.getByTestId("global-toast-presentation-slot");

    expect(layer.className).toContain("pointer-events-none");
    expect(layer.className).toContain("flex-col");
    expect(layer.className).toContain("gap-2");
  });
});
