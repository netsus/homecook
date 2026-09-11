// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarketingDemandValidationScreen } from "@/components/marketing/marketing-demand-validation-screen";

// Characterization captured before extraction at51277943. Keep legacy rendered markup unchanged.
describe("legacy Hero default presentation", () => {
  it.each(["a", "b", "c"] as const)("preserves %s Hero HTML including its original copy, visual and pending CTA", variant => {
    const html = renderToStaticMarkup(<MarketingDemandValidationScreen initialAdVariant={variant} />);
    const document = new DOMParser().parseFromString(html, "text/html");
    const hero = document.querySelector("main[data-stage='hero']");
    expect(hero).not.toBeNull();
    expect(hero?.querySelector("button")?.textContent).toContain("내 집밥기록 유형 알아보기");
    expect(hero?.outerHTML).toMatchSnapshot();
  });
});
