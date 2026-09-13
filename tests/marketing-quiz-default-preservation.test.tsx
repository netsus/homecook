// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MarketingDemandValidationScreen } from "@/components/marketing/marketing-demand-validation-screen";

vi.mock("@/lib/api/marketing-validation", () => ({ postMarketingValidation: vi.fn(async (body: { action: string }) => ({ success: true, data: { stage: body.action, state: body.action }, error: null })) }));
afterEach(cleanup);

it("preserves legacy v2 Q1 markup and options before the presentation extraction", async () => {
  window.history.replaceState({}, "", "/beta"); window.sessionStorage.clear();
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const { container } = render(<MarketingDemandValidationScreen />);
  const start = screen.getByRole("button", { name: "내 집밥기록 유형 알아보기" });
  await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(start);
  await screen.findByRole("progressbar", { name: "1 / 4 진행" });
  expect(screen.getByRole("button", { name: "거의 매일" })).toBeTruthy();
  expect(container.querySelector("main[data-stage='question-1']")?.outerHTML).toMatchSnapshot();
  vi.unstubAllGlobals();
});
