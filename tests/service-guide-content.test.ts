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
      "먹은 만큼 기록",
    ]);
  });

  it("publishes exactly four features, six guides, and eight FAQs", () => {
    expect(SERVICE_GUIDE_FEATURES).toHaveLength(4);
    expect(SERVICE_GUIDE_GUIDES).toHaveLength(6);
    expect(SERVICE_GUIDE_FAQS).toHaveLength(8);
  });

  it("explains actual intake separately from plans and does not promise unfinished detail editing", () => {
    const content = JSON.stringify([SERVICE_GUIDE_STEPS, SERVICE_GUIDE_FEATURES, SERVICE_GUIDE_GUIDES, SERVICE_GUIDE_FAQS]);
    expect(content).toContain("완성된 음식의 전체 무게");
    expect(content).toContain("g(그램)");
    expect(content).toContain("요리 계획에 담는 것만으로 식사 기록이 생기지는 않아요");
    expect(content).toContain("식사 상세와 수정 기능은 준비 중");
    expect(content).toContain("YouTube");
    expect(content).toContain("확인할 수 없는 값");
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
