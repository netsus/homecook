import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../next.config";
import { verifyRound2PageContext } from "@/lib/server/marketing-round2-context";
import { readRound2RuntimeConfig } from "@/lib/server/marketing-round2-runtime";
import { buildRound2Page } from "@/lib/server/marketing-round2-page";

const mocks = vi.hoisted(() => ({ readControl: vi.fn(), readiness: vi.fn() }));
vi.mock("@/lib/server/marketing-round2-storage", () => ({ createRound2FileStorage: () => ({ readControl: mocks.readControl }) }));
vi.mock("@/lib/server/marketing-round2-runtime", async importOriginal => ({ ...await importOriginal<object>(), checkRound2LeadReadiness: mocks.readiness }));
const now = Date.parse("2026-09-12T00:00:00Z");
function config(extra: Record<string, string> = {}) {
  return readRound2RuntimeConfig({ MUMEOK_ROUND2_ENABLED: "true", ...Object.fromEntries(["PAGE", "COOKIE", "BOOTSTRAP", "EVENT", "EMAIL", "RECEIPT", "RATE"].map(key => [`MUMEOK_ROUND2_${key}_SECRET`, randomBytes(32).toString("hex")])), ...extra });
}
beforeEach(() => { vi.clearAllMocks(); mocks.readControl.mockResolvedValue({ version: 1, collection_enabled: true, lead_enabled: true, consent_generation: 1 }); mocks.readiness.mockResolvedValue(undefined); });
describe("R2 page GET boundary", () => {
  it.each(["recording", "homeflow"])("signs exact %s topic with sanitized attribution and no database/provider dependency", async topic => {
    const settings = config();
    const result = await buildRound2Page({ pathname: `/beta/r2/${topic}`, host: "app.mumeok.kr", rawSearch: "?utm_source=ig&utm_source=fb&email=private@example.com&topic=other", config: settings, now, siteKey: "r2-public-site" });
    if (!result || result.kind !== "page") throw new Error("Expected page");
    expect(result.props.topic).toBe(topic);
    expect(verifyRound2PageContext(result.props.pageContext, result.props.topic, settings.secrets.page, now / 1000)).toMatchObject({ topic, utm_source: null, first_channel: "unknown" });
    expect(JSON.stringify(result)).not.toContain("private@example.com");
    expect(JSON.stringify(result)).not.toContain(settings.secrets.page);
    expect(result.props.preview).toBe(false);
  });
  it.each(["/beta/r2/unknown", "/beta/r2/RECORDING", "/beta/r2/recording/extra", "/beta/r2", "/beta/r2/%72ecording"])("rejects unknown exact path %s", async pathname => {
    expect(await buildRound2Page({ pathname, host: "app.mumeok.kr", rawSearch: "", config: config(), now, siteKey: "" })).toBeNull();
    expect(mocks.readControl).not.toHaveBeenCalled();
  });
  it("canonicalizes the trailing slash without forwarding arbitrary query values", async () => {
    expect(await buildRound2Page({ pathname: "/beta/r2/recording/", host: "app.mumeok.kr", rawSearch: "?email=secret", config: config(), now, siteKey: "" })).toEqual({ kind: "redirect", location: "/beta/r2/recording" });
  });
  it("returns 404 when disabled even with existing v2 flags", async () => {
    expect(await buildRound2Page({ pathname: "/beta/r2/recording", host: "app.mumeok.kr", rawSearch: "", config: config({ MUMEOK_ROUND2_ENABLED: "false", MUMEOK_MARKETING_ENABLED: "true" }), now, siteKey: "" })).toBeNull();
    expect(mocks.readControl).not.toHaveBeenCalled();
  });
  it.each(["localhost:3100", "127.0.0.1:3100", "[::1]:3100"])("permits explicit loopback preview %s without reading secrets or control", async host => {
    const result = await buildRound2Page({ pathname: "/beta/r2/homeflow", host, rawSearch: "", config: readRound2RuntimeConfig({ MUMEOK_ROUND2_LOCAL_PREVIEW: "true" }), now, siteKey: "never-public" });
    expect(result).toMatchObject({ kind: "page", props: { preview: true, pageContext: "", turnstileSiteKey: "", leadReady: true } });
    expect(mocks.readControl).not.toHaveBeenCalled(); expect(mocks.readiness).not.toHaveBeenCalled();
  });
  it.each(["app.mumeok.kr", "localhost.attacker.test", "localhost:65536", "127.1", "LOCALHOST:3100", "localhost:3100,evil.test"])("does not open preview for %s", async host => {
    expect(await buildRound2Page({ pathname: "/beta/r2/recording", host, rawSearch: "", config: config({ MUMEOK_ROUND2_LOCAL_PREVIEW: "true" }), now, siteKey: "" })).toBeNull();
  });
  it("keeps lead disabled unless the current evidence and dedicated site key are ready", async () => {
    mocks.readiness.mockRejectedValue(new Error("private-path-do-not-expose"));
    const input = { pathname: "/beta/r2/recording", host: "app.mumeok.kr", rawSearch: "", config: config(), now, siteKey: "r2-site" };
    expect(await buildRound2Page(input)).toMatchObject({ props: { leadReady: false, turnstileSiteKey: "" } });
    mocks.readiness.mockResolvedValue(undefined);
    expect(await buildRound2Page({ ...input, siteKey: "" })).toMatchObject({ props: { leadReady: false } });
    expect(await buildRound2Page(input)).toMatchObject({ props: { leadReady: true, turnstileSiteKey: "r2-site" } });
  });
  it("preserves menu while control is unavailable without exposing private details", async () => {
    mocks.readControl.mockRejectedValue(new Error("private-control-path"));
    const result = await buildRound2Page({ pathname: "/beta/r2/recording", host: "app.mumeok.kr", rawSearch: "", config: config(), now, siteKey: "r2-site" });
    expect(result).toMatchObject({ kind: "page", props: { leadReady: false } });
    expect(JSON.stringify(result)).not.toContain("private-control-path");
  });
  it("scopes no-referrer/private-no-store headers to r2 without changing v2", async () => {
    const headers = await nextConfig.headers?.();
    expect(headers?.find(entry => entry.source === "/beta/r2/:path*")?.headers).toEqual(expect.arrayContaining([{ key: "Cache-Control", value: "private, no-store" }, { key: "Referrer-Policy", value: "no-referrer" }]));
    expect(headers?.find(entry => entry.source === "/:path*")?.headers).toContainEqual({ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" });
  });
});
