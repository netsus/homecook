import { describe, expect, it, vi } from "vitest";

import { setE2EAuthOverride } from "./e2e/helpers/mock-routes";

function createPageHarness() {
  const addCookies = vi.fn(async () => undefined);
  const addInitScript = vi.fn(async () => undefined);
  const evaluate = vi.fn(async () => undefined);
  const route = vi.fn(async () => undefined);
  const page = {
    addInitScript,
    context: () => ({ addCookies }),
    evaluate,
    route,
    url: () => "about:blank",
  };
  return { addCookies, addInitScript, page, route };
}

type AuthOverrideWithOwnership = (
  page: unknown,
  value: "authenticated" | "guest",
  options?: { notificationRouteOwner?: "auth-helper" | "caller" },
) => Promise<void>;

const setAuthOverride = setE2EAuthOverride as AuthOverrideWithOwnership;

describe("setE2EAuthOverride notification route ownership", () => {
  it("keeps default empty-notification isolation for ordinary specs", async () => {
    const harness = createPageHarness();

    await setAuthOverride(harness.page, "authenticated");

    expect(harness.route).toHaveBeenCalledOnce();
    expect(harness.addCookies).toHaveBeenCalledOnce();
    expect(harness.addInitScript).toHaveBeenCalledOnce();
  });

  it("does not replace notification routes owned by the caller", async () => {
    const harness = createPageHarness();

    await setAuthOverride(harness.page, "authenticated", {
      notificationRouteOwner: "caller",
    });

    expect(harness.route).not.toHaveBeenCalled();
    expect(harness.addCookies).toHaveBeenCalledOnce();
    expect(harness.addInitScript).toHaveBeenCalledOnce();
  });
});
