import { describe, expect, it } from "vitest";

import {
  BOOKKEEPING_AUTHORITY_DOC_PATH,
  describeCloseoutWritableScopeForPr,
  describeCloseoutWritableSurfaces,
  resolveBookkeepingAuthorityMatrix,
  resolveCloseoutWritableRelativePaths,
} from "../scripts/lib/bookkeeping-authority.mjs";

describe("bookkeeping authority matrix", () => {
  it("declares closeout writable surfaces for a slice", () => {
    expect(resolveCloseoutWritableRelativePaths({ slice: "03-recipe-like" })).toEqual([
      "docs/workpacks/README.md",
      "docs/workpacks/03-recipe-like/README.md",
      "docs/workpacks/03-recipe-like/acceptance.md",
      "docs/workpacks/03-recipe-like/automation-spec.json",
    ]);
  });

  it("exposes cross-layer authority entries", () => {
    const matrix = resolveBookkeepingAuthorityMatrix({
      slice: "03-recipe-like",
      workItemId: "03-recipe-like",
    });

    expect(matrix.map((entry) => entry.id)).toEqual(
      expect.arrayContaining(["roadmap_status", "tracked_status", "runtime_state", "pr_body_evidence"]),
    );
    expect(matrix.find((entry) => entry.id === "tracked_status")?.relativePath).toBe(
      ".workflow-v2/status.json",
    );
  });

  it("describes the allowed closeout scope and points back to the authority doc", () => {
    expect(describeCloseoutWritableScopeForPr({ slice: "03-recipe-like" })).toContain(
      "`docs/workpacks/03-recipe-like/automation-spec.json`",
    );
    expect(describeCloseoutWritableSurfaces({ slice: "03-recipe-like" })).toContain(
      BOOKKEEPING_AUTHORITY_DOC_PATH,
    );
  });
});
