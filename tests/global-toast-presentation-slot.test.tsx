// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GLOBAL_TOAST_GROWTH_SLOT_ID,
  GLOBAL_TOAST_YOUTUBE_SLOT_ID,
  GlobalToastPresentationProvider,
  GlobalToastPresentationSlot,
  useGlobalToastPresentationGrant,
} from "@/components/shared/global-toast-presentation-slot";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

  it("grants only YouTube at 320, then releases Growth after YouTube leaves", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      matches: true,
      removeEventListener: vi.fn(),
    }));

    function Channel({ active, channel }: { active: boolean; channel: "growth" | "youtube" }) {
      const granted = useGlobalToastPresentationGrant(channel, active, true);
      return <output data-testid={`${channel}-grant`}>{String(granted)}</output>;
    }

    const { rerender } = render(
      <GlobalToastPresentationProvider>
        <Channel active channel="youtube" />
        <Channel active channel="growth" />
      </GlobalToastPresentationProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("youtube-grant").textContent).toBe("true");
      expect(screen.getByTestId("growth-grant").textContent).toBe("false");
    });

    rerender(
      <GlobalToastPresentationProvider>
        <Channel active={false} channel="youtube" />
        <Channel active channel="growth" />
      </GlobalToastPresentationProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("youtube-grant").textContent).toBe("false");
      expect(screen.getByTestId("growth-grant").textContent).toBe("true");
    });
  });

  it("grants both active channels at 390 and desktop widths", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));

    function Channel({ channel }: { channel: "growth" | "youtube" }) {
      const granted = useGlobalToastPresentationGrant(channel, true, true);
      return <output data-testid={`${channel}-grant`}>{String(granted)}</output>;
    }

    render(
      <GlobalToastPresentationProvider>
        <Channel channel="youtube" />
        <Channel channel="growth" />
      </GlobalToastPresentationProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("youtube-grant").textContent).toBe("true");
      expect(screen.getByTestId("growth-grant").textContent).toBe("true");
    });
  });
});
