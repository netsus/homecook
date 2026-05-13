// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  APP_VIEW_MAX_WIDTH,
  APP_VIEW_MEDIA_QUERY,
  getViewModeForWidth,
  WEB_VIEW_MEDIA_QUERY,
  WEB_VIEW_MIN_WIDTH,
} from "@/components/shared/view-mode";
import { useDesktopViewport } from "@/components/shared/use-desktop-viewport";
import { useIsMobileViewport } from "@/components/shared/use-mobile-viewport";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function installMatchMedia(width: number) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches:
        query === WEB_VIEW_MEDIA_QUERY
          ? width >= WEB_VIEW_MIN_WIDTH
          : query === APP_VIEW_MEDIA_QUERY
            ? width <= APP_VIEW_MAX_WIDTH
            : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function ViewportProbe() {
  const isDesktop = useDesktopViewport();
  const isMobile = useIsMobileViewport();

  return (
    <div>
      <span data-testid="desktop">{String(isDesktop)}</span>
      <span data-testid="mobile">{String(isMobile)}</span>
    </div>
  );
}

describe("view mode contract", () => {
  it("uses 1024px as the web-view breakpoint", () => {
    expect(WEB_VIEW_MIN_WIDTH).toBe(1024);
    expect(APP_VIEW_MAX_WIDTH).toBe(1023);
    expect(WEB_VIEW_MEDIA_QUERY).toBe("(min-width: 1024px)");
    expect(APP_VIEW_MEDIA_QUERY).toBe("(max-width: 1023px)");
  });

  it("keeps 768-1023px in app view", () => {
    expect(getViewModeForWidth(390)).toBe("app");
    expect(getViewModeForWidth(820)).toBe("app");
    expect(getViewModeForWidth(1023)).toBe("app");
    expect(getViewModeForWidth(1024)).toBe("web");
    expect(getViewModeForWidth(1280)).toBe("web");
  });

  it("reports app view at tablet width from the shared hooks", async () => {
    installMatchMedia(820);

    render(<ViewportProbe />);

    await waitFor(() => {
      expect(screen.getByTestId("desktop").textContent).toBe("false");
      expect(screen.getByTestId("mobile").textContent).toBe("true");
    });
  });

  it("reports web view at desktop width from the shared hooks", async () => {
    installMatchMedia(1280);

    render(<ViewportProbe />);

    await waitFor(() => {
      expect(screen.getByTestId("desktop").textContent).toBe("true");
      expect(screen.getByTestId("mobile").textContent).toBe("false");
    });
  });
});
