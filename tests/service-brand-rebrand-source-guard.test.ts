import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("service brand rebrand source guard", () => {
  it("keeps runtime identifiers while removing legacy copy from current brand surfaces", () => {
    const frontendBrandSources = [
      "app/layout.tsx",
      "components/layout/app-header.tsx",
      "components/home/home-screen.tsx",
      "components/about/about-screen.tsx",
      "components/auth/nickname-onboarding-screen.tsx",
      "components/gamification/growth-toast-stack.tsx",
      "components/mypage/mypage-gamification-card.tsx",
      "components/mypage/mypage-growth-profile.tsx",
      "components/mypage/mypage-progress-card.tsx",
      "components/settings/settings-mobile-screen.tsx",
      "components/shared/profile-summary-button.tsx",
      "lib/gamification-tutorial-guide.ts",
      "lib/navigation/app-nav.ts",
      "lib/recipe.ts",
    ].map(source).join("\n");
    const serverBrandSource = source("lib/server/user-gamification.ts");
    const currentBrandSources = `${frontendBrandSources}\n${serverBrandSource}`;
    const runtimeSources = [
      "components/gamification/growth-toast-stack.tsx",
      "components/shared/profile-summary-button.tsx",
      "lib/auth/e2e-auth-override.ts",
      "playwright.config.ts",
    ].map(source).join("\n");

    for (const legacyCopy of [
      "집밥 가이드",
      "집밥 둘러보기",
      "레시피에서 끝나지 않는 집밥 계획",
      "WHY ZIPBAP",
      "집밥 추천",
      "집밥 성장",
      "첫 집밥 기록",
      '"집밥 활동"',
      '?? "집밥러"',
    ]) {
      expect(frontendBrandSources).not.toContain(legacyCopy);
    }

    expect(currentBrandSources).not.toContain('title: "첫 집밥 완료하기"');
    expect(currentBrandSources).not.toContain('title: "첫 집밥 완료"');

    expect(runtimeSources).toContain("HOMECOOK_GAMIFICATION_REFRESH_EVENT");
    expect(runtimeSources).toContain("NEXT_PUBLIC_HOMECOOK_ENABLE_QA_FIXTURES");
    expect(runtimeSources).toContain("homecook.e2e-auth-override");
  });

  it("preserves user-authored generic 집밥 content", () => {
    const homeTest = source("tests/home-screen.test.tsx");

    expect(homeTest).toContain('title: "든든한 집밥"');
    expect(homeTest).toContain('getByText("든든한 집밥")');
  });

  it("keeps routine E2E runs from overwriting canonical visual evidence", () => {
    const e2eSource = source("tests/e2e/service-brand-rebrand.spec.ts");

    expect(e2eSource).not.toContain("ui/designs/evidence/service-brand-rebrand");
    expect(e2eSource).not.toContain("page.screenshot");
  });
});
