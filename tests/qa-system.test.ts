import { describe, expect, it } from "vitest";

import {
  buildExploratoryChecklist,
  createExploratoryReportTemplate,
  parseChecklistSections,
  scoreExploratoryReport,
  validateExploratoryReport,
} from "../scripts/lib/qa-system.mjs";

type ExploratoryFinding = {
  category: string;
  severity: string;
  title: string;
  expected: string;
  actual: string;
  repro_steps: string[];
  evidence_paths: string[];
  tags: string[];
};

type ExploratoryCoverage = {
  item_id: string;
  status: string;
  notes: string;
  linked_findings: string[];
};

type ExploratoryReport =
  Omit<
    ReturnType<typeof createExploratoryReportTemplate>,
    "devices" | "findings" | "remainingRisks" | "checklistCoverage"
  > & {
    devices: string[];
    findings: ExploratoryFinding[];
    remainingRisks: string[];
    checklistCoverage: ExploratoryCoverage[];
  };

const README_MARKDOWN = `# Slice

## Primary User Path

1. HOME에서 검색한다.
2. 상세로 진입한다.
3. 보호 액션을 시도한다.
`;

const ACCEPTANCE_MARKDOWN = `# Acceptance

## Happy Path

- [ ] HOME이 열린다
- [ ] 검색이 동작한다

## Error / Permission

- [ ] unauthorized 시 로그인 게이트가 열린다

## Manual QA

1. 모바일에서 같은 동선을 확인한다
2. hard refresh를 시도한다

## Automation Split

### Playwright

- [ ] 브라우저 흐름을 확인한다
`;

describe("qa system helpers", () => {
  it("parses checklist sections with checkbox and numbered items", () => {
    const sections = parseChecklistSections(ACCEPTANCE_MARKDOWN);

    expect(sections.map((section) => section.title)).toEqual([
      "Happy Path",
      "Error / Permission",
      "Manual QA",
      "Automation Split",
    ]);
    expect(sections[2].items[0]).toMatchObject({
      text: "모바일에서 같은 동선을 확인한다",
    });
    expect(sections[3].items[0]).toMatchObject({
      subsection: "Playwright",
      text: "브라우저 흐름을 확인한다",
    });
  });

  it("builds an exploratory checklist with devices, primary path, and auth edge case", () => {
    const checklist = buildExploratoryChecklist({
      slice: "03-recipe-like",
      baseUrl: "http://127.0.0.1:3000",
      readmeMarkdown: README_MARKDOWN,
      acceptanceMarkdown: ACCEPTANCE_MARKDOWN,
    });

    expect(checklist.devices).toEqual(["desktop-chrome", "mobile-chrome"]);
    expect(checklist.primaryUserPath).toEqual([
      "HOME에서 검색한다.",
      "상세로 진입한다.",
      "보호 액션을 시도한다.",
    ]);
    expect(checklist.edgeCases.map((item) => item.id)).toContain(
      "auth-return-to-action",
    );
  });

  it("validates and scores a complete exploratory report", () => {
    const checklist = buildExploratoryChecklist({
      slice: "03-recipe-like",
      baseUrl: "http://127.0.0.1:3000",
      readmeMarkdown: README_MARKDOWN,
      acceptanceMarkdown: ACCEPTANCE_MARKDOWN,
    });
    const report = createExploratoryReportTemplate(checklist) as ExploratoryReport;

    report.generatedAt = "2026-03-31T00:00:00.000Z";
    report.summary = "desktop/mobile 모두 확인했고 주요 리스크를 기록했다.";
    report.remainingRisks = ["OAuth 실계정 흐름은 live suite로 별도 확인 필요"];
    report.findings = [
      {
        category: "ux",
        severity: "major",
        title: "로그인 게이트 닫기 버튼이 모바일에서 시선 흐름상 멀다",
        expected: "보호 액션 후 바로 닫기나 로그인 CTA를 인지할 수 있어야 한다.",
        actual: "모바일에서 닫기 버튼이 우상단 구석에 몰려 있어 첫 시선에서 놓치기 쉽다.",
        repro_steps: [
          "모바일 viewport로 /recipe/mock-kimchi-jjigae 진입",
          "플래너에 추가 버튼 탭",
          "로그인 게이트 첫 화면 관찰",
        ],
        evidence_paths: ["test-results/login-gate-mobile.png"],
        tags: ["mobile", "auth", "login-gate"],
      },
    ];
    report.checklistCoverage = checklist.checklistItems.map((item) => ({
      item_id: item.id,
      status: "covered",
      notes: "covered in exploratory pass",
      linked_findings: [],
    }));

    expect(validateExploratoryReport(report, checklist)).toEqual([]);
    expect(scoreExploratoryReport(report, checklist).total).toBeGreaterThanOrEqual(90);
  });

  it("reports validation failures for missing device coverage and empty evidence", () => {
    const checklist = buildExploratoryChecklist({
      slice: "03-recipe-like",
      baseUrl: "http://127.0.0.1:3000",
      readmeMarkdown: README_MARKDOWN,
      acceptanceMarkdown: ACCEPTANCE_MARKDOWN,
    });
    const report = createExploratoryReportTemplate(checklist) as ExploratoryReport;

    report.summary = "incomplete";
    report.devices = ["desktop-chrome"];
    report.findings = [
      {
        category: "functional",
        severity: "major",
        title: "issue",
        expected: "expected",
        actual: "actual",
        repro_steps: ["step 1", "step 2"],
        evidence_paths: [],
        tags: ["desktop"],
      },
    ];
    report.checklistCoverage = [];

    const errors = validateExploratoryReport(report, checklist);

    expect(errors).toEqual(
      expect.arrayContaining([
        "missing required device coverage: mobile-chrome",
        "missing checklist coverage item: happy-path-1",
        "finding[0].evidence_paths must not be empty.",
      ]),
    );
  });
});
