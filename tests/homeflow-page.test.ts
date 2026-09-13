import { describe, expect, it } from "vitest";
import { homeflowPageEntry } from "@/lib/server/homeflow-page";
import { readRound2RuntimeConfig } from "@/lib/server/marketing-round2-runtime";

describe("homeflow page entry", () => {
  it("requires both an explicit preview flag and an exact loopback host", () => {
    const config = readRound2RuntimeConfig({ MUMEOK_ROUND2_LOCAL_PREVIEW: "true" });
    expect(homeflowPageEntry("127.0.0.1:3217", "?preview=1", config).preview).toBe(true);
    expect(homeflowPageEntry("app.mumeok.kr", "?preview=1", config).preview).toBe(false);
    expect(homeflowPageEntry("localhost.evil", "?preview=1", config).preview).toBe(false);
    expect(homeflowPageEntry("localhost:3217", "?preview=1", readRound2RuntimeConfig({})).preview).toBe(false);
  });
  it("keeps content public without making up a page context when collection is off", () => {
    expect(homeflowPageEntry("app.mumeok.kr", "?result=mental", readRound2RuntimeConfig({}))).toMatchObject({ pageContext: null, preview: false, sharedResult: "mental" });
    expect(homeflowPageEntry("app.mumeok.kr", "?result=unknown", readRound2RuntimeConfig({})).sharedResult).toBeNull();
  });
});
