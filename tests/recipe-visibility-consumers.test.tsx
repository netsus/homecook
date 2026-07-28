import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const manualRecipeCreateSource = readFileSync(
  join(
    process.cwd(),
    "components/recipe/manual-recipe-create-screen.tsx",
  ),
  "utf8",
);

describe("recipe visibility frontend consumer boundary", () => {
  it("uses managed image identity for cancel and recipe attachment", () => {
    expect(manualRecipeCreateSource).toContain("cancelRecipeImageUpload");
    expect(manualRecipeCreateSource).toContain("image_object_id");
    expect(manualRecipeCreateSource).toContain("read_url");
  });

  it("keeps browser Storage deletion confined to the legacy fallback", () => {
    const managedCleanupStart = manualRecipeCreateSource.indexOf(
      "const cleanupUploadedImage",
    );
    const legacyCleanupStart = manualRecipeCreateSource.indexOf(
      "const cleanupLegacyUploadedImage",
    );
    const managedCleanupSource = manualRecipeCreateSource.slice(
      managedCleanupStart,
      legacyCleanupStart,
    );

    expect(manualRecipeCreateSource).toContain(
      "cleanupLegacyUploadedImage",
    );
    expect(managedCleanupSource).toContain("cancelRecipeImageUpload");
    expect(managedCleanupSource).not.toContain(".storage");
  });
});
