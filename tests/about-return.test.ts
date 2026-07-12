// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  hasSafeAboutHistoryReturn,
  rememberAboutReturn,
} from "@/lib/navigation/about-return";

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/");
  window.sessionStorage.clear();
});

describe("about return storage", () => {
  it("ignores a blocked sessionStorage write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(() => rememberAboutReturn()).not.toThrow();
  });

  it("fails closed when a sessionStorage read is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(hasSafeAboutHistoryReturn()).toBe(false);
  });

  it("fails closed when removing the return marker is blocked", () => {
    window.sessionStorage.setItem(
      "homecook:about-return",
      JSON.stringify({
        createdAt: Date.now(),
        historyLength: window.history.length,
        href: "/",
      }),
    );
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    expect(hasSafeAboutHistoryReturn()).toBe(false);
  });
});
