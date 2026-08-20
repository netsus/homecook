import { describe, expect, it } from "vitest";

import {
  buildFoodCatalogSearchFingerprint,
  decodeFoodCatalogSearchCursor,
  encodeFoodCatalogSearchCursor,
} from "@/lib/server/food-catalog-search";
import { evaluateCompatibilityRemovalGate } from "@/lib/server/compatibility-tombstone-gates";

const STABLE_ID = "550e8400-e29b-41d4-a716-446655440701";

describe("compatibility tombstone gates", () => {
  it.each(["unavailable", "partial", "stale", "query_error"] as const)(
    "fails closed with removal zero when telemetry is %s",
    (telemetryState) => {
      expect(evaluateCompatibilityRemovalGate({
        telemetryState,
        releaseId: "R+1",
        headSha: "a".repeat(40),
        observationWindowComplete: true,
        currentClientObserved: true,
        immediatePreviousClientObserved: true,
        noKeyCount: 0,
        activeLegacyTerminalCount: 0,
        newLegacyStartsBlocked: true,
        seededV2DrainGreen: true,
        rollbackDrainGreen: true,
        approvedContractEvolution: true,
      })).toEqual({ allowed: false, removalCount: 0, reason: `telemetry_${telemetryState}` });
    },
  );

  it("treats zero telemetry and elapsed release as evidence, never deletion authority", () => {
    expect(evaluateCompatibilityRemovalGate({
      telemetryState: "complete",
      releaseId: "R+1",
      headSha: "a".repeat(40),
      observationWindowComplete: true,
      currentClientObserved: true,
      immediatePreviousClientObserved: true,
      noKeyCount: 0,
      activeLegacyTerminalCount: 0,
      newLegacyStartsBlocked: true,
      seededV2DrainGreen: true,
      rollbackDrainGreen: true,
      approvedContractEvolution: false,
    })).toEqual({ allowed: false, removalCount: 0, reason: "approved_contract_required" });
  });

  it("keeps an in-flight v1 cursor while new first pages issue v2", () => {
    const legacy = Buffer.from(JSON.stringify({
      created_at: "2026-07-25T12:00:00.123456Z",
      id: STABLE_ID,
    }), "utf8").toString("base64url");
    const fingerprint = buildFoodCatalogSearchFingerprint({
      q: "",
      types: ["food_product"],
      source: null,
    });
    expect(decodeFoodCatalogSearchCursor(legacy, fingerprint)).toEqual({
      version: 1,
      created_at: "2026-07-25T12:00:00.123456Z",
      stable_id: STABLE_ID,
    });

    const next = encodeFoodCatalogSearchCursor({
      version: 2,
      fingerprint,
      tuple: {
        algorithm_version: 2,
        match_bucket: 0,
        coverage_bucket: 0,
        quantized_score: 0,
        source_partition: 0,
        type_partition: 1,
        created_at: "2026-07-25T12:00:00.123456Z",
        stable_id: STABLE_ID,
      },
    });
    expect(decodeFoodCatalogSearchCursor(next, fingerprint)).toMatchObject({ version: 2 });
  });
});
