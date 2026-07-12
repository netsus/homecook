import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { resolveMypageLegacyRedirect } from "@/lib/navigation/mypage-return-state";

describe("mypage legacy help retirement", () => {
  it("redirects scalar and array help queries to the public FAQ", () => {
    expect(resolveMypageLegacyRedirect({ tab: "help" })).toBe("/about#faq");
    expect(resolveMypageLegacyRedirect({ tab: ["saved", "help"] })).toBe("/about#faq");
    expect(resolveMypageLegacyRedirect({ tab: "saved" })).toBeNull();
  });

  it("checks the legacy redirect before starting authentication", () => {
    const source = readFileSync(join(process.cwd(), "app/mypage/page.tsx"), "utf8");

    expect(source.indexOf("resolveMypageLegacyRedirect")).toBeGreaterThan(-1);
    expect(source.indexOf("resolveMypageLegacyRedirect")).toBeLessThan(
      source.indexOf("getInitialAuthenticatedFromServer()"),
    );
  });

  it("removes the duplicate help surface, icon, and dedicated CSS", () => {
    const source = readFileSync(
      join(process.cwd(), "components/mypage/mypage-screen.tsx"),
      "utf8",
    );
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

    expect(source).not.toContain("MyPageHelpSurface");
    expect(source).not.toContain("HelpIcon");
    expect(source).not.toContain('activeTab === "help"');
    expect(source).not.toContain('value === "help"');
    expect(css).not.toContain("web-mypage-faq-card");
    expect(css).not.toContain("web-mypage-contact-card");
    expect(css).not.toContain("web-mypage-faq-row");
  });
});
