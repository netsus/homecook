import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

describe("auth public env bundle contract", () => {
  it("uses direct NEXT_PUBLIC env property access for client-reachable auth env reads", async () => {
    const source = await readFile("lib/supabase/auth-env.ts", "utf8");

    expect(source).toContain("process.env.NEXT_PUBLIC_AUTH_SUPABASE_URL");
    expect(source).toContain("process.env.NEXT_PUBLIC_AUTH_SUPABASE_PUBLISHABLE_KEY");
    expect(source).not.toContain("process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(source).not.toContain("process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY");

    expect(source).not.toContain("process.env[REMOTE_AUTH_URL_ENV]");
    expect(source).not.toContain("process.env[REMOTE_AUTH_KEY_ENV]");
    expect(source).not.toContain("process.env[LEGACY_URL_ENV]");
    expect(source).not.toContain("process.env[LEGACY_KEY_ENV]");
  });
});
