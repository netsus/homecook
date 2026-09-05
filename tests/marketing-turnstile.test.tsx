// @vitest-environment jsdom

import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MarketingTurnstileController } from "@/components/marketing/marketing-turnstile";

async function importTurnstile() {
  vi.resetModules();
  return import("@/components/marketing/marketing-turnstile");
}

describe("marketing turnstile widget", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete window.turnstile;
    delete window.__homecookMarketingTurnstileScriptPromise__;
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  afterEach(() => {
    cleanup();
  });

  it("fails closed without a configured site key", async () => {
    const { MarketingTurnstile, TURNSTILE_SCRIPT_URL } = await importTurnstile();
    let controller: MarketingTurnstileController | null = null;

    render(<MarketingTurnstile onControllerChange={(value) => { controller = value; }} />);

    expect(screen.getByText("보안 확인을 준비 중입니다. 잠시 후 다시 시도해 주세요.")).toBeTruthy();
    expect(document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)).toBeNull();
    await waitFor(() => expect(controller).not.toBeNull());
    const activeController = controller as MarketingTurnstileController | null;
    if (!activeController) throw new Error("controller not registered");
    await expect(activeController.getToken()).resolves.toEqual({
      ok: false,
      message: "보안 확인을 준비 중입니다. 잠시 후 다시 시도해 주세요.",
    });
  });

  it("loads the exact explicit script and resets expired tokens", async () => {
    vi.stubEnv("NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY", "preview-site-key");
    const { MarketingTurnstile, TURNSTILE_SCRIPT_URL } = await importTurnstile();
    let controller: MarketingTurnstileController | null = null;
    let renderOptions:
      | {
        action: string;
        appearance: "interaction-only";
        callback: (token: string) => void;
        "error-callback": () => void;
        "expired-callback": () => void;
        size: "flexible";
        sitekey: string;
      }
      | undefined;
    const reset = vi.fn();
    const remove = vi.fn();
    const renderTurnstile = vi.fn((_: HTMLElement, options: NonNullable<typeof renderOptions>) => {
      renderOptions = options;
      options.callback("preview-token");
      return "widget-1";
    });

    render(<MarketingTurnstile onControllerChange={(value) => { controller = value; }} />);

    const script = document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`);
    expect(script).toBeInstanceOf(HTMLScriptElement);

    window.turnstile = {
      render: renderTurnstile,
      reset,
      remove,
    };
    script?.dispatchEvent(new Event("load"));

    await waitFor(() => expect(renderTurnstile).toHaveBeenCalledTimes(1));
    expect(renderOptions).toMatchObject({
      action: "marketing_validation_lead_submit",
      appearance: "interaction-only",
      size: "flexible",
      sitekey: "preview-site-key",
    });
    const activeController = controller as MarketingTurnstileController | null;
    if (!activeController) throw new Error("controller not registered");
    await expect(activeController.getToken()).resolves.toEqual({ ok: true, token: "preview-token" });

    renderOptions?.["expired-callback"]();

    expect(reset).toHaveBeenCalledWith("widget-1");
    await waitFor(() => expect(screen.getByText("보안 확인이 만료됐어요. 다시 확인해 주세요.")).toBeTruthy());
    await expect(activeController.getToken()).resolves.toEqual({
      ok: false,
      message: "보안 확인을 완료한 뒤 다시 시도해 주세요.",
    });
  });
});
