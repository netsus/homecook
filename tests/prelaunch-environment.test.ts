import { afterEach, describe, expect, it } from "vitest";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { applyEnvironmentPatch, readEnvironmentPatch, validateEnvironmentPatch } from "../scripts/lib/prelaunch-environment.mjs";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "prelaunch-env-")); roots.push(root);
  const repo = join(root, "repo"); mkdirSync(repo); mkdirSync(join(repo, ".git"));
  const checkout = join(root, "checkout"); mkdirSync(checkout);
  const patch = join(root, "patch.env"); writeFileSync(patch, 'MARKETING_TURNSTILE_SECRET="private$new#value"\nNEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY=public-key\n', { mode: 0o600 });
  return { root, repo, checkout, patch };
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
describe("private web environment patch", () => {
  it("reads dotenv without evaluating code or expanding secret values", () => {
    const { repo, patch } = fixture();
    expect(readEnvironmentPatch(patch, repo)).toEqual({ MARKETING_TURNSTILE_SECRET: "private$new#value", NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY: "public-key" });
  });
  it("requires private mode, a real regular file, and placement outside any Git checkout", () => {
    const { root, repo, patch } = fixture();
    chmodSync(patch, 0o644); expect(() => readEnvironmentPatch(patch, repo)).toThrow("0600"); chmodSync(patch, 0o600);
    const link = join(root, "link"); symlinkSync(patch, link); expect(() => readEnvironmentPatch(link, repo)).toThrow();
    const other = join(root, "other"); mkdirSync(other); writeFileSync(join(other, ".git"), "gitdir: /private/git");
    writeFileSync(join(other, "patch"), "WEB_KEY=value", { mode: 0o600 });
    expect(() => readEnvironmentPatch(join(other, "patch"), repo)).toThrow("Git");
  });
  it.each(["NODE_OPTIONS", "HOME", "PATH", "LD_PRELOAD", "DYLD_INSERT_LIBRARIES", "npm_config_userconfig", "PNPM_HOME", "GIT_CONFIG_COUNT", "BASH_ENV", "ENV", "HOMECOOK_DEPLOY_REPOSITORY", "NEXT_PUBLIC_API_SECRET", "NEXT_PUBLIC_SERVICE_ROLE_KEY", "HOMECOOK_ENABLE_QA_FIXTURES", "HOMECOOK_FULL_LOCAL_SECRET_DIR", "DATA_SUPABASE_SECRET_KEY"])("rejects unsafe patch %s without echoing the value", (key) => {
    expect(() => validateEnvironmentPatch({ [key]: "secret-do-not-print" })).toThrow();
    try { validateEnvironmentPatch({ [key]: "secret-do-not-print" }); } catch (error) { expect(String(error)).not.toContain("secret-do-not-print"); }
  });
  it("rejects remote data authority endpoints and symlink aliases inside a checkout", () => {
    expect(() => validateEnvironmentPatch({ DATA_SUPABASE_URL: "https://remote.supabase.co" })).toThrow();
    const { root, repo } = fixture();
    symlinkSync(root, join(repo, "external"));
    expect(() => readEnvironmentPatch(join(repo, "external", "patch.env"), repo)).toThrow("Git");
    expect(() => validateEnvironmentPatch({ DATA_SUPABASE_URL: "http://127.0.0.1:54481" })).not.toThrow();
  });
  it("preserves local authorities and permits Turnstile feature configuration", () => {
    expect(() => validateEnvironmentPatch({ HOMECOOK_AUTH_AUTHORITY: "cloud" })).toThrow();
    expect(() => validateEnvironmentPatch({ HOMECOOK_DATA_AUTHORITY: "local", MARKETING_LEAD_PROTECTION_READY: "1", MARKETING_TURNSTILE_SECRET: "real-secret" })).not.toThrow();
  });
  it("round-trips literal backslashes without silently changing secret bytes", () => {
    const { checkout } = fixture();
    const patch = { WEB_API_KEY: String.raw`literal\ncharacters` };
    applyEnvironmentPatch(checkout, {}, patch);
    expect(parseEnv(readFileSync(join(checkout, ".env.production.local"), "utf8"))).toEqual(patch);
  });
  it("updates file and launch variables together so old plist values cannot shadow new settings", () => {
    const { checkout } = fixture();
    writeFileSync(join(checkout, ".env.production.local"), 'OLD_KEY=keep\nMARKETING_TURNSTILE_SECRET=previous\n', { mode: 0o600 });
    const original = { EnvironmentVariables: { MARKETING_TURNSTILE_SECRET: "old-plist", KEEP: "unchanged" } };
    const patch = { MARKETING_TURNSTILE_SECRET: "new$secret#value", NEXT_PUBLIC_MARKETING_TURNSTILE_SITE_KEY: "new-public-key" };
    const next = applyEnvironmentPatch(checkout, original, patch);
    expect(next.EnvironmentVariables).toEqual({ ...original.EnvironmentVariables, ...patch });
    expect(original.EnvironmentVariables.MARKETING_TURNSTILE_SECRET).toBe("old-plist");
    expect(parseEnv(readFileSync(join(checkout, ".env.production.local"), "utf8"))).toEqual({ OLD_KEY: "keep", ...patch });
  });
});
