import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const rootDir = process.cwd();

function readRequired(relativePath: string) {
  const absolutePath = join(rootDir, relativePath);
  expect(existsSync(absolutePath), `${relativePath} must exist`).toBe(true);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

const officialFiles = {
  requirements: "docs/요구사항기준선-v1.7.36.md",
  screens: "docs/화면정의서-v1.5.40.md",
  flow: "docs/유저flow맵-v1.3.38.md",
  db: "docs/db설계-v1.3.38.md",
  api: "docs/api문서-v1.2.43.md",
} as const;

const resultKeys = [
  "homecook-passer",
  "eyeballing-master",
  "ingredient-tracker",
  "pro-measurer",
] as const;

const anonymousActions = [
  "view",
  "quiz_started",
  "quiz_completed",
  "result_viewed",
  "experience_started",
  "experience_completed",
  "beta_form_viewed",
] as const;

describe("marketing demand validation v2 document contract", () => {
  it("promotes one synchronized official tuple", () => {
    const currentSource = readRequired("docs/sync/CURRENT_SOURCE_OF_TRUTH.md");

    for (const relativePath of Object.values(officialFiles)) {
      expect(currentSource).toContain(`\`${relativePath}\``);
      readRequired(relativePath);
    }
    expect(currentSource).toContain("63f8ef2a019c6d260a96a42fab9d67f727d93557");
    expect(currentSource).toContain("0aaa282552256ac9e77a5c134bb45a52e42ade33");
    expect(currentSource).toContain("01a0630e-81f1-7f42-8b1b-cb259d1d5997");
  });

  it("locks the exact four-question and four-result taxonomy", () => {
    const requirements = readRequired(officialFiles.requirements);
    const quizSpec = readRequired("docs/marketing/quiz-content-spec.md");
    const acceptance = readRequired("docs/workpacks/marketing-demand-validation-v2/acceptance.md");

    for (const question of ["q1", "q2", "q3", "q4"]) {
      expect(`${requirements}\n${quizSpec}\n${acceptance}`).toContain(`\`${question}\``);
    }
    for (const resultKey of resultKeys) {
      expect(`${requirements}\n${quizSpec}\n${acceptance}`).toContain(`\`${resultKey}\``);
    }
    expect(quizSpec).toContain("Q3 하나로만 결정");
    expect(quizSpec).toContain("`q5`는 허용하지 않는다");
  });

  it("keeps one POST and one table while separating anonymous actions from lead PII", () => {
    const api = readRequired(officialFiles.api);
    const db = readRequired(officialFiles.db);

    expect(api).toContain("`POST /api/v1/marketing/validation`");
    expect(db).toContain("`public.marketing_validation_sessions`");
    for (const action of anonymousActions) {
      expect(api).toContain(`\`${action}\``);
    }
    expect(api).toContain("`lead_submitted`");
    expect(api).toContain("`ad_variant`");
    expect(api).toContain("`{ success, data, error }`");
    expect(api).toContain("`{ code, message, fields[] }`");
    expect(db).toContain("anonymous action은 email을 쓰지 않는다");
    expect(db).toContain("`consent_version=marketing-demand-validation-v2`");
    expect(db).toContain("duplicate");
    expect(db).toContain("PII");
  });

  it("relocks the workpack for a later backend and frontend implementation", () => {
    const readme = readRequired("docs/workpacks/marketing-demand-validation-v2/README.md");
    const automation = readRequired("docs/workpacks/marketing-demand-validation-v2/automation-spec.json");
    const workItem = readRequired(".workflow-v2/work-items/marketing-demand-validation-v2.json");

    expect(readme).toContain("source prototype commit: `63f8ef2a019c6d260a96a42fab9d67f727d93557`");
    expect(readme).toContain(
      "`ui/designs/evidence/marketing-demand-validation-v2/source-0aaa282/`",
    );
    expect(readme).toContain("iPhone/Pixel frame");
    expect(readme).toContain("이미지 권리");
    expect(readme).toContain("제품 예시");
    expect(readme).toContain("fail-closed");
    expect(automation).toContain("marketing-demand-validation-v2");
    expect(workItem).toContain("01a0630e-81f1-7f42-8b1b-cb259d1d5997");
    expect(workItem).toContain("internal 1.5");
  });

  it("keeps the final visual source in a repository-owned canonical archive", () => {
    const manifest = JSON.parse(
      readRequired(
        "ui/designs/evidence/marketing-demand-validation-v2/source-0aaa282/manifest.json",
      ),
    ) as {
      source_commit: string;
      source_tree: string;
      files: Array<{ path: string; bytes: number; sha256: string }>;
    };

    expect(manifest.source_commit).toBe("0aaa282552256ac9e77a5c134bb45a52e42ade33");
    expect(manifest.source_tree).toBe("27052a41ee4a097ff8bcb29751238c07aa408861");
    expect(manifest.files).toHaveLength(53);

    for (const file of manifest.files) {
      expect(isAbsolute(file.path), `${file.path} must be repository-relative`).toBe(false);
      const absolutePath = resolve(rootDir, file.path);
      expect(
        relative(rootDir, absolutePath).startsWith(".."),
        `${file.path} must stay inside the repository`,
      ).toBe(false);
      expect(existsSync(absolutePath), `${file.path} must exist`).toBe(true);
      expect(statSync(absolutePath).size, `${file.path} byte size`).toBe(file.bytes);
      expect(
        createHash("sha256").update(readFileSync(absolutePath)).digest("hex"),
        `${file.path} SHA-256`,
      ).toBe(file.sha256);
    }

    const canonicalDocs = [
      "docs/sync/CURRENT_SOURCE_OF_TRUTH.md",
      "docs/workpacks/marketing-demand-validation-v2/README.md",
      "ui/designs/MARKETING_DEMAND_VALIDATION_V2.md",
      "ui/designs/critiques/MARKETING_DEMAND_VALIDATION_V2-critique.md",
      "ui/designs/evidence/marketing-demand-validation-v2/design-qa.md",
    ].map(readRequired).join("\n");

    expect(canonicalDocs).toContain(
      "ui/designs/evidence/marketing-demand-validation-v2/source-0aaa282/",
    );
    expect(canonicalDocs).not.toContain("/Users/shj/2025/2026/mumeok-funnel");

    const captureSpec = readRequired("tests/e2e/slice-marketing-demand-validation.spec.ts");
    expect(captureSpec).toContain("relative(process.cwd(), capturePath)");

    const captureManifest = JSON.parse(
      readRequired(
        "ui/designs/evidence/marketing-demand-validation-v2/stage4-capture-manifest.json",
      ),
    ) as { captures: string[] };
    for (const capturePath of captureManifest.captures) {
      expect(isAbsolute(capturePath), `${capturePath} must be repository-relative`).toBe(false);
      const absolutePath = resolve(rootDir, capturePath);
      expect(
        relative(rootDir, absolutePath).startsWith(".."),
        `${capturePath} must stay inside the repository`,
      ).toBe(false);
      expect(existsSync(absolutePath), `${capturePath} must exist`).toBe(true);
    }
  });

  it("bounds marketing evidence image waits and keeps retries in small capture groups", () => {
    const captureSpec = readRequired("tests/e2e/slice-marketing-demand-validation.spec.ts");

    expect(captureSpec).not.toContain("Array.from(document.images).every");
    expect(captureSpec).toContain("async function expectStageImagesReady");
    expect(captureSpec).toContain("timeout: 10_000");
    expect(captureSpec).toContain('optimizedUrl.pathname === "/_next/image"');
    expect(captureSpec).toContain('optimizedUrl.searchParams.get("url")');
    expect(captureSpec).toContain("resolvedSourceUrl.origin === window.location.origin");
    expect(captureSpec).toContain('resolvedSourceUrl.pathname.startsWith("/assets/")');
    expect(captureSpec).toContain('image.removeAttribute("srcset")');
    expect(captureSpec).toContain('test("captures hero and result evidence"');
    expect(captureSpec).toContain('test("captures the main funnel evidence"');
    expect(captureSpec).toContain(
      'test("captures narrow and responsive evidence and writes the manifest"',
    );
  });

  it.each([
    ["/assets/funnel/food.png", true],
    ["/assets/funnel/food.png?size=small", true],
    ["//example.com/assets/food.png", false],
    ["/\\example.com/assets/food.png", false],
    ["https://example.com/assets/food.png", false],
    ["/api/v1/marketing/validation", false],
  ])("keeps optimizer fallback source %s inside the local asset boundary", (sourceUrl, allowed) => {
    const pageUrl = new URL("http://127.0.0.1:3100/beta");
    const resolvedSourceUrl = new URL(sourceUrl, pageUrl);
    const isLocalAsset = resolvedSourceUrl.origin === pageUrl.origin
      && resolvedSourceUrl.pathname.startsWith("/assets/");

    expect(isLocalAsset).toBe(allowed);
  });

  it("replaces the v1 row checks with a creative-key conditional v1/v2 contract", () => {
    const db = readRequired(officialFiles.db);
    const acceptance = readRequired("docs/workpacks/marketing-demand-validation-v2/acceptance.md");

    expect(db).toContain("creative_key별 조건부 CHECK 교체");
    expect(db).toContain("`creative_key='mumeok_funnel_prototype_v2'`");
    expect(db).toContain("`target_qualified IS NULL`");
    expect(db).toContain("`beta_form_viewed_at <= lead_submitted_at`");
    expect(db).toContain("v1 row는 기존 CHECK 의미를 그대로 보존");
    expect(acceptance).toContain("v1 fixture는 기존 CHECK를 그대로 통과");
    expect(acceptance).toContain("v2 fixture는 legacy field와 `target_qualified`가 모두 null");
    expect(acceptance).toContain("`beta_form_viewed_at → lead_submitted_at`");
  });

  it("requires the Stage 1 design generator and critic artifacts", () => {
    const generatorPath = "ui/designs/MARKETING_DEMAND_VALIDATION_V2.md";
    const criticPath = "ui/designs/critiques/MARKETING_DEMAND_VALIDATION_V2-critique.md";
    const automation = JSON.parse(
      readRequired("docs/workpacks/marketing-demand-validation-v2/automation-spec.json"),
    );

    readRequired(generatorPath);
    readRequired(criticPath);
    expect(automation.frontend.design_authority).toMatchObject({
      generator_required: true,
      generator_artifact: generatorPath,
      critic_required: true,
      critic_artifact: criticPath,
    });
  });

  it("projects the current Stage 4 Draft PR onto the v2 workflow item", () => {
    const status = JSON.parse(readRequired(".workflow-v2/status.json"));
    const taxonomy = status.items.find(
      (item: { id: string }) => item.id === "taxonomy-v2-contract-evolution",
    );
    const marketingV2 = status.items.find(
      (item: { id: string }) => item.id === "marketing-demand-validation-v2",
    );

    expect(taxonomy?.pr_path).toBeNull();
    expect(marketingV2?.pr_path).toBe("https://github.com/netsus/homecook/pull/1499");
  });

  it("stores the resolved hero variant after deterministic attribution precedence", () => {
    const api = readRequired(officialFiles.api);
    const plan = readRequired("docs/marketing/demand-validation-plan.md");
    const acceptance = readRequired("docs/workpacks/marketing-demand-validation-v2/acceptance.md");
    const contract = `${api}\n${plan}\n${acceptance}`;

    expect(contract).toContain("`hook_reentry → a`");
    expect(contract).toContain("`hook_cooked_weight → b`");
    expect(contract).toContain("`hook_calorie_quiz → c`");
    expect(contract).toContain("`hook_workaround → d`");
    expect(contract).toContain("저장 `ad_variant`는 resolved Hero variant");
    expect(contract).toContain("recognized `utm_content`가 `ad_variant`와 충돌하면 `utm_content`가 우선");
    expect(contract).toContain("unknown URL variant와 direct visit은 `default`");
  });

  it("allows only an opaque result key in the canonical share deep link", () => {
    const requirements = readRequired(officialFiles.requirements);
    const screens = readRequired(officialFiles.screens);
    const quizSpec = readRequired("docs/marketing/quiz-content-spec.md");
    const acceptance = readRequired("docs/workpacks/marketing-demand-validation-v2/acceptance.md");
    const contract = `${requirements}\n${screens}\n${quizSpec}\n${acceptance}`;

    expect(contract).toContain("`/beta?result=<opaque-result-key>`");
    expect(contract).toContain("공유 URL은 다른 query parameter를 모두 제거");
    expect(contract).toContain("email, answers, UTM, `ad_variant`는 공유 URL에 넣지 않는다");
    expect(contract).toContain("known result key만 read-only preview");
    expect(contract).toContain("unknown result key는 기본 Hero");
  });

  it("keeps TomorrowPreview aligned across official screen, both planner wireframes, acceptance, and Stage 4 evidence", () => {
    const screens = readRequired(officialFiles.screens);
    const design = readRequired("ui/designs/MARKETING_DEMAND_VALIDATION_V2.md");
    const acceptance = readRequired("docs/workpacks/marketing-demand-validation-v2/acceptance.md");
    const automation = JSON.parse(
      readRequired("docs/workpacks/marketing-demand-validation-v2/automation-spec.json"),
    );
    const stage4Evidence = automation.frontend.design_authority.stage4_evidence_requirements;

    expect(screens).toContain("내일 식단 preview");
    expect(design.match(/TomorrowPreview/g)).toHaveLength(2);
    expect(design).toContain("오늘 card 다음, primary CTA 직전");
    expect(design).toContain("내일 preview의 `+`는 read-only");
    expect(acceptance).toContain("planner_homecook과 planner_complete 모두 TomorrowPreview");
    expect(acceptance).toContain("내일 preview의 `+`는 read-only");
    expect(stage4Evidence).toEqual(expect.arrayContaining([
      "planner-homecook-tomorrow-preview-393-320",
      "planner-complete-tomorrow-preview-393-320",
    ]));
  });
});

describe("marketing demand validation v2 runtime contract", () => {
  it("moves the runtime, migration, and analysis surfaces to v2 without adding a route or table", () => {
    const types = readRequired("types/marketing-validation.ts");
    const rules = readRequired("lib/marketing/demand-validation.ts");
    const server = readRequired("lib/server/marketing-validation.ts");
    const migration = readRequired("supabase/migrations/20260903010000_marketing_validation_sessions_v2.sql");
    const analysis = readRequired("docs/marketing/demand-validation-analysis.sql");
    const template = readRequired("docs/marketing/demand-validation-result-template.md");
    const runtime = `${types}\n${rules}\n${server}`;

    for (const action of [...anonymousActions, "lead_submitted"]) expect(runtime).toContain(`"${action}"`);
    for (const resultKey of resultKeys) expect(runtime).toContain(`"${resultKey}"`);
    expect(runtime).toContain("target_qualified: null");
    expect(runtime).toContain("mumeok_funnel_prototype_v2");
    expect(migration).toContain("marketing_validation_sessions_v2_legacy_null_check");
    expect(`${analysis}\n${template}`).toContain("ad_variant");
    expect(`${analysis}\n${template}`).not.toContain("target_qualified_count");
    expect(`${analysis}\n${template}`).not.toContain("planner_intent_distribution");
  });

  it("separates the verified backend lead-gate boundary from Stage 4 read-only UI evidence", () => {
    const acceptance = readRequired("docs/workpacks/marketing-demand-validation-v2/acceptance.md");

    expect(acceptance).toMatch(/- \[x\].*lead readiness.*result\/experience\/planner payoff.*omo:id=accept-read-only;stage=2;scope=shared;review=3,6/iu);
    expect(acceptance).toContain("Stage 2 evidence scope: lead gate가 anonymous");
    expect(acceptance).toContain("Stage 4 UI evidence는 기존 `accept-result-before-email`, `accept-error`");
  });
});
