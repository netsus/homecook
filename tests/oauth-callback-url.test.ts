import { afterEach, describe, expect, it } from "vitest";

import {
  buildOAuthCallbackUrl,
  resolveConfiguredAppOrigin,
} from "@/lib/auth/oauth-callback-url";

const ORIGINAL_APP_URL = process.env.NEXT_PUBLIC_APP_URL;
const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

function restoreEnv(
  name: "NEXT_PUBLIC_APP_URL" | "NEXT_PUBLIC_SITE_URL",
  value: string | undefined,
) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

afterEach(() => {
  restoreEnv("NEXT_PUBLIC_APP_URL", ORIGINAL_APP_URL);
  restoreEnv("NEXT_PUBLIC_SITE_URL", ORIGINAL_SITE_URL);
});

describe("OAuth callback URL", () => {
  it("prefers the configured app origin over the current browser origin", () => {
    process.env.NEXT_PUBLIC_APP_URL = "http://cwjsui-macbookpro.local:3100";
    process.env.NEXT_PUBLIC_SITE_URL = "https://homecook-flame.vercel.app";

    expect(resolveConfiguredAppOrigin()).toBe(
      "http://cwjsui-macbookpro.local:3100",
    );
    expect(
      buildOAuthCallbackUrl("http://192-168-0-11.sslip.io:3100"),
    ).toBe("http://cwjsui-macbookpro.local:3100/auth/callback");
  });

  it("falls back to the configured site origin when the app URL is invalid", () => {
    process.env.NEXT_PUBLIC_APP_URL = "not-a-url";
    process.env.NEXT_PUBLIC_SITE_URL = "https://homecook.example";

    expect(buildOAuthCallbackUrl("http://localhost:3100")).toBe(
      "https://homecook.example/auth/callback",
    );
  });

  it("uses the current HTTP origin when no configured origin is usable", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "file:///tmp/homecook";

    expect(buildOAuthCallbackUrl("http://localhost:3100")).toBe(
      "http://localhost:3100/auth/callback",
    );
  });
});
