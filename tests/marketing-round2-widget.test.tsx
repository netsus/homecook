// @vitest-environment jsdom
import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Round2Turnstile, ROUND2_TURNSTILE_SCRIPT_URL } from "@/components/marketing/round2/round2-turnstile";
import type { Round2Topic } from "@/lib/marketing-round2";

afterEach(cleanup);
beforeEach(() => { delete window.turnstile; document.head.innerHTML = ""; });
function fixture(topic: Round2Topic = "recording", siteKey = "r2-site") {
  const onToken = vi.fn(); const onError = vi.fn();
  return { topic, siteKey, onToken, onError, resetKey: 0 };
}
function provider() {
  const render = vi.fn<NonNullable<Window["turnstile"]>["render"]>(() => "r2-widget"); const reset = vi.fn(); const remove = vi.fn();
  window.turnstile = { render, reset, remove };
  return { render, reset, remove };
}
describe("R2 dedicated Turnstile", () => {
  it("does not load provider when the dedicated site key is absent", () => {
    const props = fixture("recording", ""); render(<Round2Turnstile {...props} />);
    expect(document.querySelector("script")).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("보안 확인");
    expect(props.onToken).toHaveBeenCalledWith(null);
  });
  it.each(["recording", "homeflow"] as const)("uses the exact %s action and clears tokens on expiry/error", async topic => {
    const api = provider(); const props = fixture(topic);
    render(<Round2Turnstile {...props} />);
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    const options = api.render.mock.calls[0]?.[1] as unknown as Parameters<NonNullable<Window["turnstile"]>["render"]>[1];
    expect(options).toMatchObject({ action: `mumeok_r2_${topic}`, sitekey: "r2-site", size: "compact", "response-field": false });
    act(() => options.callback("r2-token")); expect(props.onToken).toHaveBeenLastCalledWith("r2-token");
    act(() => options["expired-callback"]()); expect(props.onToken).toHaveBeenLastCalledWith(null); expect(api.reset).toHaveBeenCalledWith("r2-widget");
    act(() => options["error-callback"]()); expect(props.onToken).toHaveBeenLastCalledWith(null); expect(props.onError).toHaveBeenCalled();
  });
  it("clears the token and widget on reset, topic change and unmount", async () => {
    const api = provider(); const props = fixture(); const view = render(<Round2Turnstile {...props} />);
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    view.rerender(<Round2Turnstile {...props} resetKey={1} />);
    await waitFor(() => expect(api.remove).toHaveBeenCalledWith("r2-widget"));
    view.rerender(<Round2Turnstile {...props} topic="homeflow" resetKey={1} />);
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(3));
    view.unmount(); expect(api.remove).toHaveBeenCalledTimes(3); expect(props.onToken).toHaveBeenLastCalledWith(null);
  });
  it("retries a failed script with a fresh script after explicit reset", async () => {
    const props = fixture(); const view = render(<Round2Turnstile {...props} />);
    const first = document.querySelector(`script[src="${ROUND2_TURNSTILE_SCRIPT_URL}"]`)!;
    expect(first).toBeInstanceOf(HTMLScriptElement);
    await act(async () => { first.dispatchEvent(new Event("error")); });
    expect(props.onError).toHaveBeenCalled();
    view.rerender(<Round2Turnstile {...props} resetKey={1} />);
    const second = document.querySelector(`script[src="${ROUND2_TURNSTILE_SCRIPT_URL}"]`);
    expect(second).toBeInstanceOf(HTMLScriptElement); expect(second).not.toBe(first);
    const api = provider(); await act(async () => { second!.dispatchEvent(new Event("load")); });
    expect(api.render).toHaveBeenCalledTimes(1);
  });
  it("ignores late provider callbacks after the form is closed", async () => {
    const api = provider(); const props = fixture(); const view = render(<Round2Turnstile {...props} />);
    await waitFor(() => expect(api.render).toHaveBeenCalledTimes(1));
    const options = api.render.mock.calls[0]?.[1] as unknown as Parameters<NonNullable<Window["turnstile"]>["render"]>[1];
    view.unmount(); props.onToken.mockClear(); act(() => options.callback("late-token")); expect(props.onToken).not.toHaveBeenCalled();
  });
});
