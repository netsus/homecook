import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

describe("user-facing copy tone", () => {
  it("keeps the manual UI review copy examples in the shared friendly tone", () => {
    const targets = [
      "app/not-found.tsx",
      "components/auth/login-screen.tsx",
      "components/auth/login-gate-modal.tsx",
      "components/auth/nickname-onboarding-screen.tsx",
      "components/cooking/cook-mode-screen.tsx",
      "components/cooking/standalone-cook-mode-screen.tsx",
      "components/leftovers/ate-list-screen.tsx",
      "components/leftovers/leftovers-screen.tsx",
      "components/planner/meal-screen.tsx",
      "components/planner/planner-week-screen.tsx",
      "components/shopping/shopping-detail-screen.tsx",
    ];
    const bannedCopy = [
      "주소가 바뀌었거나 더 이상 제공하지 않는 화면이에요",
      "로그인 후에는 다시 이 화면으로 돌아옵니다",
      "로그인 후 이 화면으로 자동으로 돌아옵니다",
      "로그인 후 이전 화면으로 돌아갑니다",
      "현재 화면으로 돌아옵니다",
      "돌아갑니다",
      "여기에 기록됩니다",
      "시도해주세요",
      "입력해주세요",
      "선택해주세요",
      "확인해주세요",
      "추가해주세요",
      "정해주세요",
      "업로드해주세요",
    ];

    for (const filePath of targets) {
      const source = readFileSync(filePath, "utf8");

      for (const copy of bannedCopy) {
        expect(source, `${filePath} should not include "${copy}"`).not.toContain(copy);
      }
    }
  });
});
