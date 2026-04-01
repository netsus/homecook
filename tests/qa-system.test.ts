import { describe, expect, it } from "vitest";

import {
  buildExploratoryChecklist,
  createExploratoryReportTemplate,
  evaluateExploratoryEvalCaseFile,
  parseChecklistSections,
  renderExploratoryInstructions,
  runEvalSuite,
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

## QA / Test Data Plan

- QA fixture mode:
  - \`HOMECOOK_ENABLE_QA_FIXTURES=1 pnpm dev\`
  - \`localStorage["homecook.e2e-auth-override"] = "guest" | "authenticated"\`
- 실 DB smoke:
  - \`pnpm qa:seed:01-05 -- --user-id <uuid>\`
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
3. 별도 슬라이스 17b에서 최종 검증한다

## Data Setup / Preconditions

- QA fixture:
  - \`HOMECOOK_ENABLE_QA_FIXTURES=1 pnpm dev\`

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
      "Data Setup / Preconditions",
      "Automation Split",
    ]);
    expect(sections[2].items[0]).toMatchObject({
      text: "모바일에서 같은 동선을 확인한다",
    });
    const automationSection = sections.find(
      (section) => section.title === "Automation Split",
    );
    expect(automationSection?.items[0]).toMatchObject({
      subsection: "Playwright",
      text: "브라우저 흐름을 확인한다",
    });
  });

  it("builds an exploratory checklist with small-mobile coverage, primary path, and UX heuristics", () => {
    const checklist = buildExploratoryChecklist({
      slice: "03-recipe-like",
      baseUrl: "http://127.0.0.1:3000",
      readmeMarkdown: README_MARKDOWN,
      acceptanceMarkdown: ACCEPTANCE_MARKDOWN,
    });

    expect(checklist.devices).toEqual([
      "desktop-chrome",
      "mobile-chrome",
      "mobile-ios-small",
    ]);
    expect(checklist.primaryUserPath).toEqual([
      "HOME에서 검색한다.",
      "상세로 진입한다.",
      "보호 액션을 시도한다.",
    ]);
    expect(checklist.testDataSetup).toEqual([
      {
        title: "QA fixture mode",
        steps: [
          "`HOMECOOK_ENABLE_QA_FIXTURES=1 pnpm dev`",
          "`localStorage[\"homecook.e2e-auth-override\"] = \"guest\" | \"authenticated\"`",
        ],
      },
      {
        title: "실 DB smoke",
        steps: [
          "`pnpm qa:seed:01-05 -- --user-id <uuid>`",
        ],
      },
    ]);
    expect(checklist.checklistItems).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          section: "Automation Split",
        }),
        expect.objectContaining({
          section: "Data Setup / Preconditions",
        }),
        expect.objectContaining({
          text: expect.stringContaining("별도 슬라이스"),
        }),
      ]),
    );
    expect(checklist.checklistItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "heuristic-mobile-readability",
          section: "Exploratory Heuristics",
        }),
        expect.objectContaining({
          id: "heuristic-small-viewport-cta",
          section: "Exploratory Heuristics",
        }),
        expect.objectContaining({
          id: "heuristic-duplicate-cta",
          section: "Exploratory Heuristics",
        }),
      ]),
    );
    expect(checklist.edgeCases.map((item) => item.id)).toContain(
      "auth-return-to-action",
    );
    expect(checklist.edgeCases.map((item) => item.id)).toContain(
      "small-viewport-fold",
    );
  });

  it("renders exploratory instructions with mandatory heuristic and evidence prompts", () => {
    const checklist = buildExploratoryChecklist({
      slice: "01-discovery-detail-auth",
      baseUrl: "http://127.0.0.1:3000",
      readmeMarkdown: README_MARKDOWN,
      acceptanceMarkdown: ACCEPTANCE_MARKDOWN,
    });

    const instructions = renderExploratoryInstructions(
      checklist,
      ".artifacts/qa/01-discovery-detail-auth/manual",
    );

    expect(instructions).toContain("desktop-chrome, mobile-chrome, mobile-ios-small");
    expect(instructions).toContain("작은 높이 viewport");
    expect(instructions).toContain("중복");
    expect(instructions).toContain("above-the-fold");
    expect(instructions).toContain("## 권장 데이터 셋업");
    expect(instructions).toContain("HOMECOOK_ENABLE_QA_FIXTURES=1 pnpm dev");
    expect(instructions).toContain("homecook.e2e-auth-override");
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

  it("penalizes blocked checklist items in exploratory score", () => {
    const checklist = buildExploratoryChecklist({
      slice: "04-recipe-save",
      baseUrl: "http://127.0.0.1:3000",
      readmeMarkdown: README_MARKDOWN,
      acceptanceMarkdown: ACCEPTANCE_MARKDOWN,
    });
    const report = createExploratoryReportTemplate(checklist) as ExploratoryReport;

    report.generatedAt = "2026-04-01T00:00:00.000Z";
    report.summary = "happy path는 확인했지만 다수 항목이 blocked였다.";
    report.remainingRisks = ["fault injection 부재로 error/data-integrity 다수가 blocked"];
    report.findings = [
      {
        category: "ux",
        severity: "major",
        title: "small viewport에서 CTA가 첫 화면 아래로 밀린다",
        expected: "작은 viewport에서도 핵심 CTA를 바로 인지할 수 있어야 한다.",
        actual: "초기 진입 시 제목과 CTA가 fold 아래에 있어 즉시 보이지 않는다.",
        repro_steps: [
          "iPhone SE viewport로 상세 페이지에 진입한다.",
          "첫 화면에서 제목과 CTA 위치를 확인한다.",
        ],
        evidence_paths: ["test-results/mobile-ios-small-cta.png"],
        tags: ["mobile", "small-viewport", "cta"],
      },
    ];
    report.checklistCoverage = checklist.checklistItems.map((item, index) => ({
      item_id: item.id,
      status: index % 2 === 0 ? "covered" : "blocked",
      notes: index % 2 === 0 ? "covered in exploratory pass" : "blocked by missing fault injection",
      linked_findings: [],
    }));

    const score = scoreExploratoryReport(report, checklist);

    expect(score.breakdown.coverageRate).toBe(0.5);
    expect(score.breakdown.blockedRate).toBe(0.5);
    expect(score.total).toBeLessThan(85);
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
        "missing required device coverage: mobile-ios-small",
        "missing checklist coverage item: happy-path-1",
        "finding[0].evidence_paths must not be empty.",
      ]),
    );
  });

  it("evaluates a real Layer 3 benchmark case against ground truth", () => {
    const result = evaluateExploratoryEvalCaseFile(
      "qa/evals/cases/real-slice-03-rerun.json",
    );

    expect(result.expectedPass).toBe(true);
    expect(result.verdictMatched).toBe(true);
    expect(result.score.pass).toBe(true);
    expect(result.score.breakdown.detectionRecall).toBe(1);
    expect(result.score.breakdown.falsePositiveRate).toBe(0);
    expect(result.score.breakdown.severityCalibration).toBe(1);
  });

  it("fails a synthetic benchmark case when recall is too low", () => {
    const result = evaluateExploratoryEvalCaseFile(
      "qa/evals/cases/synthetic-low-recall.json",
    );

    expect(result.expectedPass).toBe(false);
    expect(result.verdictMatched).toBe(true);
    expect(result.score.pass).toBe(false);
    expect(result.score.breakdown.detectionRecall).toBe(0.5);
    expect(result.missedFindings).toHaveLength(1);
  });

  it("runs the Layer 3 suite and classifies all benchmark cases as expected", () => {
    const result = runEvalSuite("qa/evals/manifest.json");

    expect(result.pass).toBe(true);
    expect(result.overallScore).toBe(100);
    expect(result.failedCases).toEqual([]);
    expect(result.cases).toHaveLength(7);
    expect(result.breakdown.classificationAccuracy).toBe(1);
  });
});
