import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const PIPELINE_MODULE = pathToFileURL(
  join(process.cwd(), "scripts/lib/public-nutrition-pipeline.mjs"),
).href;
const EVIDENCE_PATH = join(
  process.cwd(),
  "tests/fixtures/public-nutrition-source/rda-measurement-limited-evidence.json",
);
const FAILURE_FIXTURE = JSON.parse(readFileSync(join(
  process.cwd(),
  "tests/fixtures/public-nutrition-source/failure-scenarios.json",
), "utf8"));

async function loadPipeline() {
  return import(PIPELINE_MODULE);
}

function filesUnder(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("public nutrition source and license boundary", () => {
  it("keeps MFDS as the only required application and RDA paths keyless", async () => {
    const { SOURCE_REGISTRY } = await loadPipeline();
    const sources = Object.values(SOURCE_REGISTRY) as Array<{
      application_required?: boolean;
    }>;

    expect(sources.filter((source) => source.application_required)).toEqual([
      expect.objectContaining({ id: "mfds-15127578", secret_env: "DATA_GO_KR_API_KEY" }),
    ]);
    expect(SOURCE_REGISTRY["rda-10.4"]).toMatchObject({ keyless: true, default_path: true });
    expect(SOURCE_REGISTRY["rda-measurement"]).toMatchObject({ keyless: true, mode: "manual_evidence" });
    expect(SOURCE_REGISTRY["rda-15143598"]).toMatchObject({
      active: true,
      source_version: "10.0",
      license: "KOGL4",
      application_requirement: "separate_application_when_enabled",
      secret_env: "DATA_GO_KR_API_KEY",
      keyless: false,
      default_path: false,
    });
    expect(SOURCE_REGISTRY["rda-15143598"]).not.toHaveProperty("application_required");
  });

  it("validates only the limited six-row observation schema without approving assignment", async () => {
    const { validateMeasurementEvidence } = await loadPipeline();
    const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
    const result = validateMeasurementEvidence(evidence);

    expect(result).toHaveLength(6);
    expect(result.map((row: { ingredient_or_category_id: string }) => row.ingredient_or_category_id)).toEqual([
      "soy-sauce",
      "vinegar",
      "soybean-paste",
      "gochujang",
      "honey",
      "sesame-oil",
    ]);
    expect(result.every((row: { review_result: string }) => row.review_result === "needs_source_check")).toBe(true);
    expect(result.every((row: { license_disposition: string }) => row.license_disposition === "human_review_required")).toBe(true);
  });

  it("rejects missing license disposition, original-table replication fields, and automatic oil candidates", async () => {
    const { validateMeasurementEvidence } = await loadPipeline();
    const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));
    const [base] = evidence;

    expect(() => validateMeasurementEvidence([{
      ...base,
      license_disposition: FAILURE_FIXTURE.missing_license_disposition,
    }, ...evidence.slice(1)])).toThrowError(
      expect.objectContaining({ code: "RDA_LICENSE_DISPOSITION_MISSING" }),
    );
    expect(() => validateMeasurementEvidence([
      { ...base, original_table: "forbidden" },
      ...evidence.slice(1),
    ])).toThrowError(
      expect.objectContaining({ code: "RDA_EVIDENCE_SCHEMA_VIOLATION" }),
    );
    expect(() => validateMeasurementEvidence([{
      ...base,
      ingredient_or_category_id: "olive-oil",
      review_result: "candidate",
    }, ...evidence.slice(1)])).toThrowError(
      expect.objectContaining({ code: "RDA_EVIDENCE_FACT_MISMATCH" }),
    );
  });

  it.each([
    ["arbitrary ingredient", { ingredient_or_category_id: "mystery-sauce" }],
    ["observed value", { observed_g_per_15ml: 17.8 }],
    ["source URL", { source_url: "https://example.test/not-rda" }],
    ["observed unit", { source_observed_unit: "15mL" }],
    ["candidate status", { review_result: "candidate" }],
    ["approved status", { review_result: "approved" }],
    ["license disposition", { license_disposition: "approved" }],
    ["representative grade", { selected_representative_grade: "VOLUME_G15" }],
    ["absolute error", { absolute_error_g_per_15ml: 2.2 }],
  ])("fails closed when the limited RDA fact changes: %s", async (_name, mutation) => {
    const { validateMeasurementEvidence } = await loadPipeline();
    const evidence = JSON.parse(readFileSync(EVIDENCE_PATH, "utf8"));

    expect(() => validateMeasurementEvidence([
      { ...evidence[0], ...mutation },
      ...evidence.slice(1),
    ])).toThrowError(expect.objectContaining({ code: "RDA_EVIDENCE_FACT_MISMATCH" }));
  });

  it("sanitizes auth parameters and enforces the exact six-field public attribution", async () => {
    const { createPublicAttribution, sanitizeUrl } = await loadPipeline();
    const safe = sanitizeUrl("https://example.test/data?page=1&serviceKey=secret&apiKey=secret");
    const attribution = createPublicAttribution({
      provider: "식품의약품안전처",
      dataset: "식품영양성분DB정보",
      source_version: "2025-12-05-fixture",
      data_basis_date: null,
      license: "이용허락범위 제한 없음",
      endpoint_or_file_url: safe,
    });

    expect(safe).toBe("https://example.test/data?page=1");
    expect(Object.keys(attribution)).toEqual([
      "provider",
      "dataset",
      "source_version",
      "data_basis_date",
      "license",
      "source_url",
    ]);
    expect(JSON.stringify(attribution)).not.toMatch(/serviceKey|apiKey|secret|raw|storage/i);
    expect(() => createPublicAttribution({
      provider: "식품의약품안전처",
      dataset: "식품영양성분DB정보",
      source_version: null,
      data_basis_date: null,
      license: "이용허락범위 제한 없음",
      source_url: "https://example.test/source",
    })).toThrowError(expect.objectContaining({ code: "SOURCE_VERSION_MISSING" }));
  });

  it("keeps operator adapters and DATA_GO_KR_API_KEY out of every client import graph", async () => {
    const roots = ["app", "components", "stores"].map((dir) => join(process.cwd(), dir));
    const clientText = roots
      .flatMap(filesUnder)
      .filter((file) => /\.(?:ts|tsx|js|jsx|mjs)$/.test(file))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");

    expect(clientText).not.toMatch(/public-nutrition-pipeline|DATA_GO_KR_API_KEY/);
    const { assertNoClientNutritionImports } = await import(
      pathToFileURL(join(process.cwd(), "scripts/lib/public-nutrition-client-boundary.mjs")).href
    );
    expect(() => assertNoClientNutritionImports(process.cwd())).not.toThrow();
  });

  it("rejects a client entry that reaches the operator pipeline through a lib re-export", async () => {
    const { assertNoClientNutritionImports } = await import(
      pathToFileURL(join(process.cwd(), "scripts/lib/public-nutrition-client-boundary.mjs")).href
    );
    const root = mkdtempSync(join(tmpdir(), "nutrition-client-graph-"));
    mkdirSync(join(root, "app"), { recursive: true });
    mkdirSync(join(root, "lib"), { recursive: true });
    mkdirSync(join(root, "scripts/lib"), { recursive: true });
    writeFileSync(join(root, "app/client.tsx"), '"use client";\nexport { leak } from "@/lib/reexport";\n');
    writeFileSync(join(root, "lib/reexport.ts"), 'export { leak } from "../scripts/lib/public-nutrition-pipeline.mjs";\n');
    writeFileSync(join(root, "scripts/lib/public-nutrition-pipeline.mjs"), "export const leak = true;\n");

    expect(() => assertNoClientNutritionImports(root)).toThrowError(
      expect.objectContaining({ code: "CLIENT_OPERATOR_IMPORT_FORBIDDEN" }),
    );
  });
});
