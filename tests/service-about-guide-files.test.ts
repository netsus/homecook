import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("service about guide files", () => {
  it("provides a shared content model, screen, and public route", () => {
    expect(existsSync(join(process.cwd(), "lib/content/service-guide.ts"))).toBe(true);
    expect(existsSync(join(process.cwd(), "components/about/about-screen.tsx"))).toBe(true);
    expect(existsSync(join(process.cwd(), "app/about/page.tsx"))).toBe(true);
  });
});
