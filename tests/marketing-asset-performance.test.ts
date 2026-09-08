import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const optimizedAssets = [
  "public/assets/funnel/characters/homecook-passer.webp",
  "public/assets/funnel/characters/eyeballing-master.webp",
  "public/assets/funnel/characters/ingredient-tracker.webp",
  "public/assets/funnel/characters/pro-measurer.webp",
  "public/assets/funnel/characters/beta-invitation-mascot.webp",
  "public/assets/funnel/characters/beta-success-mascot.webp",
  "public/assets/funnel/food/jeyuk-recipe-clean.webp",
  "public/assets/funnel/food/macro-carb-wheat.webp",
  "public/assets/funnel/food/macro-protein-arm.webp",
  "public/assets/funnel/food/macro-fat-drop.webp",
] as const;

describe("marketing funnel image delivery", () => {
  it("keeps every large journey image under 250 KiB and the set under 1 MiB", () => {
    const sizes = optimizedAssets.map((path) => statSync(resolve(root, path)).size);
    expect(Math.max(...sizes)).toBeLessThan(250 * 1024);
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThan(1024 * 1024);
  });

  it("serves optimized journey images directly instead of runtime PNG transforms", () => {
    const source = readFileSync(
      resolve(root, "components/marketing/marketing-demand-validation-screen.tsx"),
      "utf8",
    );
    for (const path of optimizedAssets) {
      const publicPath = path.replace(/^public/u, "");
      expect(source).toContain(publicPath);
      expect(source).not.toContain(publicPath.replace(/\.webp$/u, ".png"));
    }
  });
});
