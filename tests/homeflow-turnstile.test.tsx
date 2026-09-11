// @vitest-environment jsdom
import React from "react";
import { render, cleanup, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MarketingTurnstile } from "@/components/marketing/marketing-turnstile";
afterEach(() => { cleanup(); delete window.turnstile; });
it("reuses the widget with the R2 topic action and explicit public site key", async () => {
  const renderWidget = vi.fn(() => "r2-widget");
  window.turnstile = { render: renderWidget, reset: vi.fn(), remove: vi.fn() };
  render(<MarketingTurnstile siteKey="public-r2-key" action="mumeok_r2_homeflow" />);
  await waitFor(() => expect(renderWidget).toHaveBeenCalledWith(expect.any(HTMLElement), expect.objectContaining({ sitekey: "public-r2-key", action: "mumeok_r2_homeflow" })));
});
