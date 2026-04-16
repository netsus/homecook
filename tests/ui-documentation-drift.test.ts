import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();

function read(relativePath: string) {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

describe("ui documentation drift guards", () => {
  it("keeps HOME docs aligned with the shared header and list-local sort baseline", () => {
    const screens = read("docs/화면정의서-v1.2.3.md");
    const homeDesign = read("ui/designs/HOME.md");
    const workpack = read("docs/workpacks/01-discovery-detail-auth/README.md");

    expect(screens).toContain("공통 브랜드 헤더 (`HOMECOOK` 로고, `/` 링크)");
    expect(screens).toContain("정렬 컨트롤은 검색바 아래가 아니라 `모든 레시피` 섹션 헤더에 둔다.");
    expect(screens).not.toContain("검색바 아래 퀵 필터");
    expect(homeDesign).toContain("기본 N인분");
    expect(homeDesign).toContain("정렬 컨트롤은 검색 패널이 아니라 `모든 레시피` 섹션에 속한다.");
    expect(workpack).toContain("정렬 컨트롤은 검색 패널이 아니라 `모든 레시피` 섹션 헤더에 둔다.");
  });

  it("keeps RECIPE_DETAIL docs aligned with the shared header and split action hierarchy", () => {
    const screens = read("docs/화면정의서-v1.2.3.md");
    const detailDesign = read("ui/designs/RECIPE_DETAIL.md");
    const critique = read("ui/designs/critiques/RECIPE_DETAIL-critique.md");
    const workpack = read("docs/workpacks/06-recipe-to-planner/README.md");

    expect(screens).toContain("보조 액션 row: `플래너 등록수 / 공유 / 좋아요 / 저장`");
    expect(screens).toContain("primary CTA row: `[플래너에 추가] [요리하기]`");
    expect(screens).not.toContain("[공유] [플래너에 추가] [좋아요] [저장] [요리하기]");
    expect(detailDesign).toContain("### 1. 공통 브랜드 헤더");
    expect(detailDesign).toContain("compact utility row");
    expect(detailDesign).not.toContain("### 1. 플로팅 헤더");
    expect(detailDesign).not.toContain("### 5. 액션 버튼 5개");
    expect(critique).not.toContain("액션 버튼 5개 — 순서");
    expect(critique).not.toContain("공유 버튼 중복 — 처리 방안 미확정");
    expect(workpack).toContain("shared AppHeader + compact utility row + primary CTA row");
  });

  it("keeps planner docs aligned with the shared header and compact toolbar baseline", () => {
    const screens = read("docs/화면정의서-v1.2.3.md");
    const plannerDesign = read("ui/designs/PLANNER_WEEK.md");
    const plannerAuthority = read("ui/designs/authority/PLANNER_WEEK-authority.md");
    const workpack = read("docs/workpacks/05-planner-week-core/README.md");

    expect(screens).toContain("상단 compact toolbar: **[장보기] [요리하기] [남은요리]**");
    expect(screens).toContain("날짜별 day card 리스트");
    expect(plannerDesign).toContain("compact secondary toolbar");
    expect(plannerAuthority).not.toContain("헤더 액션 압축 (deferred)");
    expect(workpack).toContain("공통 브랜드 헤더, compact secondary toolbar");
  });

  it("locks the doc sync workflow for future anchor-screen UI changes", () => {
    const authoritySop = read("docs/engineering/product-design-authority.md");
    const wireframe = read("docs/reference/wireframes/jibhap-wireframe-session3.md");

    expect(authoritySop).toContain("수정 전에 current-state screenshot을 먼저 캡처");
    expect(authoritySop).toContain("관련 비공식 설계 문서");
    expect(authoritySop).toContain("공식 화면정의서");
    expect(wireframe).toContain("archive reference only");
    expect(wireframe).toContain("current UI source of truth가 아니다");
  });
});
