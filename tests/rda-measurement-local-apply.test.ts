import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const MODULE_URL = pathToFileURL(
  `${process.cwd()}/scripts/rda-measurement-local-apply.mjs`,
).href;

async function loadModule(): Promise<Record<string, unknown>> {
  try {
    return await import(MODULE_URL);
  } catch {
    return {};
  }
}

describe("RDA limited measurement evidence local apply", () => {
  it("keeps all ten reviewed facts usable even when a legacy profile pointer is tied", async () => {
    const rdaModule = await loadModule();
    expect(rdaModule.RDA_LIMITED_MEASUREMENT_FACTS).toEqual([
      { ingredient_name: "간장", grams_per_15ml: 17.7 },
      { ingredient_name: "국간장", grams_per_15ml: 17.8 },
      { ingredient_name: "고추장", grams_per_15ml: 19 },
      { ingredient_name: "된장", grams_per_15ml: 18 },
      { ingredient_name: "식초", grams_per_15ml: 15.3 },
      { ingredient_name: "설탕", grams_per_15ml: 12.5 },
      { ingredient_name: "꿀", grams_per_15ml: 24 },
      { ingredient_name: "참기름", grams_per_15ml: 14.1 },
      { ingredient_name: "소금", grams_per_15ml: 11.3 },
      { ingredient_name: "액젓", grams_per_15ml: 17.9 },
    ]);

    expect(rdaModule.buildRdaMeasurementPlan).toBeTypeOf("function");
    const plan = (rdaModule.buildRdaMeasurementPlan as () => {
      assignments: Array<{
        ingredient_name: string;
        conversion_profile_code: string;
        review_status: string;
      }>;
    })();
    const approved = plan.assignments.filter((row) => row.review_status === "approved");
    expect(approved).toHaveLength(9);
    expect(approved).toEqual(expect.arrayContaining([
      expect.objectContaining({ ingredient_name: "된장", conversion_profile_code: "VOLUME_G20" }),
      expect.objectContaining({ ingredient_name: "액젓", conversion_profile_code: "VOLUME_G20" }),
      expect.objectContaining({ ingredient_name: "참기름", conversion_profile_code: "VOLUME_G15" }),
    ]));

    expect(plan.assignments.filter((row) => row.ingredient_name === "설탕")).toEqual([
      expect.objectContaining({ conversion_profile_code: "VOLUME_G10", review_status: "needs_review" }),
      expect.objectContaining({ conversion_profile_code: "VOLUME_G15", review_status: "needs_review" }),
    ]);
  });

  it("builds an audited local-only transaction and rejects an invalid reviewer id", async () => {
    const rdaModule = await loadModule();
    expect(rdaModule.buildRdaMeasurementApplySql).toBeTypeOf("function");
    const buildSql = rdaModule.buildRdaMeasurementApplySql as (input: {
      reviewedBy: string;
      reviewedAt: string;
    }) => string;

    expect(() => buildSql({
      reviewedBy: "not-a-uuid",
      reviewedAt: "2026-07-21T09:00:00.000Z",
    })).toThrowError(expect.objectContaining({ code: "INVALID_REVIEWER" }));

    const sql = buildSql({
      reviewedBy: "10000000-0000-4000-8000-000000000001",
      reviewedAt: "2026-07-21T09:00:00.000Z",
    });
    expect(sql).toContain("measurement_source_evidence");
    expect(sql).toContain("ingredient_conversion_assignments");
    expect(sql).toContain("TIED_CONVERSION_PROFILE");
    expect(sql).toContain("LEGACY_PROFILE_POINTER_ONLY");
    expect(sql).toContain("approved_assignment_count <> 10");
    expect(sql).toContain("review_assignment_count <> 1");
    expect(sql).toContain("개별 공공누리 표시 미확인");
    expect(sql).toContain("10000000-0000-4000-8000-000000000001");
  });
});
