import { describe, expect, it } from "vitest";

import {
  SERVICE_GUIDE_FAQS,
  SERVICE_GUIDE_FEATURES,
  SERVICE_GUIDE_GUIDES,
  SERVICE_GUIDE_STEPS,
} from "@/lib/content/service-guide";

describe("service guide content", () => {
  it("keeps the approved five-step service flow in order", () => {
    expect(SERVICE_GUIDE_STEPS.map((step) => step.title)).toEqual([
      "찾기",
      "계획하기",
      "장보기",
      "요리하기",
      "남은요리 활용",
    ]);
  });

  it("publishes exactly four features, six guides, and eight FAQs", () => {
    expect(SERVICE_GUIDE_FEATURES).toHaveLength(4);
    expect(SERVICE_GUIDE_GUIDES).toHaveLength(6);
    expect(SERVICE_GUIDE_FAQS).toHaveLength(8);
  });

  it("uses unique ids and only internal guide links", () => {
    const items = [
      ...SERVICE_GUIDE_STEPS,
      ...SERVICE_GUIDE_FEATURES,
      ...SERVICE_GUIDE_GUIDES,
      ...SERVICE_GUIDE_FAQS,
    ];
    const ids = items.map((item) => item.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const guide of SERVICE_GUIDE_GUIDES) {
      if ("href" in guide) expect(guide.href).toMatch(/^\//);
    }
  });

  it("does not market the deferred community or public 404 feedback", () => {
    const content = JSON.stringify([
      SERVICE_GUIDE_STEPS,
      SERVICE_GUIDE_FEATURES,
      SERVICE_GUIDE_GUIDES,
      SERVICE_GUIDE_FAQS,
    ]);

    expect(content).not.toContain("커뮤니티");
    expect(content).not.toContain("제안 게시판");
    expect(content).not.toContain("404 제보");
  });
});
