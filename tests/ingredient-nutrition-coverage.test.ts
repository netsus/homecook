import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";

const MODULE_URL = pathToFileURL(
  `${process.cwd()}/scripts/lib/ingredient-nutrition-coverage.mjs`,
).href;

async function loadCoverage(): Promise<Record<string, unknown>> {
  try {
    return await import(MODULE_URL);
  } catch {
    return {};
  }
}

function requireFunction(
  module: Record<string, unknown>,
  name: string,
): (...args: never[]) => unknown {
  expect(module[name], `missing coverage behavior: ${name}`).toBeTypeOf("function");
  return module[name] as (...args: never[]) => unknown;
}

function approvedItem(externalItemKey: string, fingerprint: string) {
  return {
    external_item_key: externalItemKey,
    fingerprint,
    values: {
      protein_g: {
        amount: 8,
        unit: "g",
      },
    },
  };
}

describe("ingredient nutrition all-active inventory", () => {
  it("sorts every current ingredient by id and produces a stable checksum independent of input order", async () => {
    const coverage = await loadCoverage();
    const buildInventoryArtifact = requireFunction(coverage, "buildInventoryArtifact");

    const forward = buildInventoryArtifact({
      ingredients: [
        {
          ingredient_id: "ingredient-b",
          canonical_name: "양파",
          category_code: null,
          category_name: null,
          default_unit: "g",
          synonyms: ["노란 양파"],
        },
        {
          ingredient_id: "ingredient-a",
          canonical_name: "두부",
          category_code: "BEAN",
          category_name: "콩류",
          default_unit: "g",
          synonyms: ["단단한 두부", "부침두부"],
        },
      ],
      query_version: "inventory-sql-v1",
    } as never) as Record<string, unknown>;

    const reverse = buildInventoryArtifact({
      ingredients: [
        {
          ingredient_id: "ingredient-a",
          canonical_name: "두부",
          category_code: "BEAN",
          category_name: "콩류",
          default_unit: "g",
          synonyms: ["부침두부", "단단한 두부"],
        },
        {
          ingredient_id: "ingredient-b",
          canonical_name: "양파",
          category_code: null,
          category_name: null,
          default_unit: "g",
          synonyms: ["노란 양파"],
        },
      ],
      query_version: "inventory-sql-v1",
    } as never) as Record<string, unknown>;

    expect(forward).toMatchObject({
      schema_version: "ingredient-nutrition-inventory-v1",
      scope: "all-active",
      query_version: "inventory-sql-v1",
      row_count: 2,
      rows: [
        expect.objectContaining({ ingredient_id: "ingredient-a" }),
        expect.objectContaining({ ingredient_id: "ingredient-b" }),
      ],
    });
    expect(reverse).toMatchObject({
      row_count: 2,
      rows: [
        expect.objectContaining({ ingredient_id: "ingredient-a" }),
        expect.objectContaining({ ingredient_id: "ingredient-b" }),
      ],
    });
    expect(reverse.checksum).toBe(forward.checksum);
  });

  it("rejects duplicate ingredient ids instead of silently collapsing the denominator", async () => {
    const coverage = await loadCoverage();
    const buildInventoryArtifact = requireFunction(coverage, "buildInventoryArtifact");

    expect(() => buildInventoryArtifact({
      ingredients: [
        {
          ingredient_id: "ingredient-a",
          canonical_name: "두부",
          category_code: "BEAN",
          category_name: "콩류",
          default_unit: "g",
          synonyms: [],
        },
        {
          ingredient_id: "ingredient-a",
          canonical_name: "중복 두부",
          category_code: "BEAN",
          category_name: "콩류",
          default_unit: "g",
          synonyms: [],
        },
      ],
      query_version: "inventory-sql-v1",
    } as never)).toThrowError(
      expect.objectContaining({ code: "INVENTORY_DUPLICATE_ID" }),
    );
  });

  it("rejects tampered inventory artifacts whose checksum no longer matches the body", async () => {
    const coverage = await loadCoverage();
    const buildInventoryArtifact = requireFunction(coverage, "buildInventoryArtifact");
    const validateCoverageDecisionArtifact = requireFunction(
      coverage,
      "validateCoverageDecisionArtifact",
    );

    const inventory = buildInventoryArtifact({
      ingredients: [{
        ingredient_id: "ingredient-a",
        canonical_name: "두부",
        category_code: "BEAN",
        category_name: "콩류",
        default_unit: "g",
        synonyms: [],
      }],
      query_version: "inventory-sql-v1",
    } as never) as Record<string, unknown>;

    const tamperedInventory = {
      ...inventory,
      rows: [{
        ...(inventory.rows as Array<Record<string, unknown>>)[0],
        canonical_name: "변조된 두부",
      }],
    };

    expect(() => validateCoverageDecisionArtifact({
      inventory: tamperedInventory,
      decision: {
        schema_version: "ingredient-nutrition-decision-v1",
        inventory_checksum: inventory.checksum,
        decisions: [{
          ingredient_id: "ingredient-a",
          classification: "eligible",
          provider_code: "MFDS",
          external_item_key: "tofu-001",
          source_item_fingerprint: "fingerprint-tofu-001",
        }],
      },
      approved_items: [approvedItem("tofu-001", "fingerprint-tofu-001")],
    } as never)).toThrowError(
      expect.objectContaining({ code: "INVENTORY_CHECKSUM_MISMATCH" }),
    );
  });
});

describe("ingredient nutrition all-active decision coverage", () => {
  it("accepts an exact eligible/excluded partition but fail-closes actual coverage until links exist", async () => {
    const coverage = await loadCoverage();
    const buildInventoryArtifact = requireFunction(coverage, "buildInventoryArtifact");
    const validateCoverageDecisionArtifact = requireFunction(
      coverage,
      "validateCoverageDecisionArtifact",
    );

    const inventory = buildInventoryArtifact({
      ingredients: [
        {
          ingredient_id: "ingredient-a",
          canonical_name: "두부",
          category_code: "BEAN",
          category_name: "콩류",
          default_unit: "g",
          synonyms: ["부침두부"],
        },
        {
          ingredient_id: "ingredient-b",
          canonical_name: "육수",
          category_code: "BASE",
          category_name: "베이스",
          default_unit: "ml",
          synonyms: [],
        },
      ],
      query_version: "inventory-sql-v1",
    } as never) as Record<string, unknown>;

    const result = validateCoverageDecisionArtifact({
      inventory,
      decision: {
        schema_version: "ingredient-nutrition-decision-v1",
        inventory_checksum: inventory.checksum,
        decisions: [
          {
            ingredient_id: "ingredient-a",
            classification: "eligible",
            provider_code: "MFDS",
            external_item_key: "tofu-001",
            source_item_fingerprint: "fingerprint-tofu-001",
          },
          {
            ingredient_id: "ingredient-b",
            classification: "excluded",
            reason_code: "UNBOUNDED_COMPOSITE",
            reviewed_by: "operator-1",
            reviewed_at: "2026-07-17T15:00:00.000Z",
            reason: "stock base varies too broadly for a canonical nutrient profile",
          },
        ],
      },
      approved_items: [
        approvedItem("tofu-001", "fingerprint-tofu-001"),
      ],
    } as never) as Record<string, unknown>;

    expect(result).toMatchObject({
      denominator_count: 2,
      approved_exactly_one_count: 0,
      excluded_count: 1,
      eligible_without_profile: 1,
      unclassified: 1,
      classification_conflict: 0,
      multiple_qualified_primary: 0,
    });
  });

  it("rejects eligible decisions whose provider code disagrees with the handoff provider", async () => {
    const coverage = await loadCoverage();
    const buildInventoryArtifact = requireFunction(coverage, "buildInventoryArtifact");
    const validateCoverageDecisionArtifact = requireFunction(
      coverage,
      "validateCoverageDecisionArtifact",
    );

    const inventory = buildInventoryArtifact({
      ingredients: [{
        ingredient_id: "ingredient-a",
        canonical_name: "두부",
        category_code: "BEAN",
        category_name: "콩류",
        default_unit: "g",
        synonyms: [],
      }],
      query_version: "inventory-sql-v1",
    } as never) as Record<string, unknown>;

    expect(() => validateCoverageDecisionArtifact({
      inventory,
      decision: {
        schema_version: "ingredient-nutrition-decision-v1",
        inventory_checksum: inventory.checksum,
        decisions: [{
          ingredient_id: "ingredient-a",
          classification: "eligible",
          provider_code: "RDA_10_4",
          external_item_key: "tofu-001",
          source_item_fingerprint: "fingerprint-tofu-001",
        }],
      },
      approved_items: [approvedItem("tofu-001", "fingerprint-tofu-001")],
      expected_provider_code: "MFDS",
    } as never)).toThrowError(
      expect.objectContaining({ code: "DECISION_PROVIDER_MISMATCH" }),
    );
  });

  it("rejects unresolved backlog reasons disguised as excluded coverage decisions", async () => {
    const coverage = await loadCoverage();
    const buildInventoryArtifact = requireFunction(coverage, "buildInventoryArtifact");
    const validateCoverageDecisionArtifact = requireFunction(
      coverage,
      "validateCoverageDecisionArtifact",
    );

    const inventory = buildInventoryArtifact({
      ingredients: [{
        ingredient_id: "ingredient-a",
        canonical_name: "두부",
        category_code: "BEAN",
        category_name: "콩류",
        default_unit: "g",
        synonyms: [],
      }],
      query_version: "inventory-sql-v1",
    } as never) as Record<string, unknown>;

    expect(() => validateCoverageDecisionArtifact({
      inventory,
      decision: {
        schema_version: "ingredient-nutrition-decision-v1",
        inventory_checksum: inventory.checksum,
        decisions: [{
          ingredient_id: "ingredient-a",
          classification: "excluded",
          reason_code: "NO_MATCH",
          reviewed_by: "operator-1",
          reviewed_at: "2026-07-17T15:00:00.000Z",
          reason: "still unresolved",
        }],
      },
      approved_items: [],
    } as never)).toThrowError(
      expect.objectContaining({ code: "DECISION_REASON_NOT_ALLOWED" }),
    );
  });

  it("rejects eligible decisions whose external key or fingerprint is not in the approved item set", async () => {
    const coverage = await loadCoverage();
    const buildInventoryArtifact = requireFunction(coverage, "buildInventoryArtifact");
    const validateCoverageDecisionArtifact = requireFunction(
      coverage,
      "validateCoverageDecisionArtifact",
    );

    const inventory = buildInventoryArtifact({
      ingredients: [{
        ingredient_id: "ingredient-a",
        canonical_name: "두부",
        category_code: "BEAN",
        category_name: "콩류",
        default_unit: "g",
        synonyms: [],
      }],
      query_version: "inventory-sql-v1",
    } as never) as Record<string, unknown>;

    for (const badDecision of [
      {
        ingredient_id: "ingredient-a",
        classification: "eligible",
        provider_code: "MFDS",
        external_item_key: "tofu-999",
        source_item_fingerprint: "fingerprint-tofu-001",
      },
      {
        ingredient_id: "ingredient-a",
        classification: "eligible",
        provider_code: "MFDS",
        external_item_key: "tofu-001",
        source_item_fingerprint: "fingerprint-tofu-999",
      },
    ]) {
      expect(() => validateCoverageDecisionArtifact({
        inventory,
        decision: {
          schema_version: "ingredient-nutrition-decision-v1",
          inventory_checksum: inventory.checksum,
          decisions: [badDecision],
        },
        approved_items: [approvedItem("tofu-001", "fingerprint-tofu-001")],
      } as never)).toThrowError(
        expect.objectContaining({ code: "ELIGIBLE_SOURCE_ITEM_NOT_FOUND" }),
      );
    }
  });

  it("rejects decision artifacts that omit or duplicate inventory ingredients", async () => {
    const coverage = await loadCoverage();
    const buildInventoryArtifact = requireFunction(coverage, "buildInventoryArtifact");
    const validateCoverageDecisionArtifact = requireFunction(
      coverage,
      "validateCoverageDecisionArtifact",
    );

    const inventory = buildInventoryArtifact({
      ingredients: [
        {
          ingredient_id: "ingredient-a",
          canonical_name: "두부",
          category_code: "BEAN",
          category_name: "콩류",
          default_unit: "g",
          synonyms: [],
        },
        {
          ingredient_id: "ingredient-b",
          canonical_name: "양파",
          category_code: "VEG",
          category_name: "채소",
          default_unit: "g",
          synonyms: [],
        },
      ],
      query_version: "inventory-sql-v1",
    } as never) as Record<string, unknown>;

    expect(() => validateCoverageDecisionArtifact({
      inventory,
      decision: {
        schema_version: "ingredient-nutrition-decision-v1",
        inventory_checksum: inventory.checksum,
        decisions: [{
          ingredient_id: "ingredient-a",
          classification: "eligible",
          provider_code: "MFDS",
          external_item_key: "tofu-001",
          source_item_fingerprint: "fingerprint-tofu-001",
        }],
      },
      approved_items: [approvedItem("tofu-001", "fingerprint-tofu-001")],
    } as never)).toThrowError(
      expect.objectContaining({ code: "DECISION_BIJECTION_INVALID" }),
    );

    expect(() => validateCoverageDecisionArtifact({
      inventory,
      decision: {
        schema_version: "ingredient-nutrition-decision-v1",
        inventory_checksum: inventory.checksum,
        decisions: [
          {
            ingredient_id: "ingredient-a",
            classification: "eligible",
            provider_code: "MFDS",
            external_item_key: "tofu-001",
            source_item_fingerprint: "fingerprint-tofu-001",
          },
          {
            ingredient_id: "ingredient-a",
            classification: "excluded",
            reason_code: "UNBOUNDED_COMPOSITE",
            reviewed_by: "operator-1",
            reviewed_at: "2026-07-17T15:00:00.000Z",
            reason: "duplicated",
          },
        ],
      },
      approved_items: [approvedItem("tofu-001", "fingerprint-tofu-001")],
    } as never)).toThrowError(
      expect.objectContaining({ code: "DECISION_BIJECTION_INVALID" }),
    );
  });
});
