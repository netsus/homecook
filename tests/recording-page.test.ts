import { describe, expect, it } from "vitest";
import { buildRecordingPage } from "@/lib/server/recording-page";
import { readRound2RuntimeConfig } from "@/lib/server/marketing-round2-runtime";

const input = { host: "127.0.0.1:3176", rawSearch: "", config: readRound2RuntimeConfig({ MUMEOK_ROUND2_LOCAL_PREVIEW: "true" }), siteKey: "" };
describe("recording page boundary", () => {
  it("reuses the explicit local preview gate", async () => {
    expect(await buildRecordingPage(input)).toMatchObject({ kind: "page", props: { topic: "recording", preview: true, sharedResult: null } });
    expect(await buildRecordingPage({ ...input, host: "localhost.evil" })).toBeNull();
  });
  it("keeps ordinary runtime fail closed", async () => {
    expect(await buildRecordingPage({ ...input, host: "app.mumeok.kr", config: readRound2RuntimeConfig({}) })).toBeNull();
  });
  it.each(["homecook-passer", "eyeballing-master", "ingredient-tracker", "pro-measurer"])("accepts only recording shared result %s", async result => {
    expect(await buildRecordingPage({ ...input, rawSearch: `result=${result}&email=private%40example.com` })).toMatchObject({ props: { sharedResult: result } });
    expect(JSON.stringify(await buildRecordingPage({ ...input, rawSearch: `result=${result}&email=private%40example.com` }))).not.toContain("private");
  });
  it.each(["result=mental", "result=unknown", "result=homecook-passer&result=pro-measurer"])("ignores invalid or ambiguous shares %s", async rawSearch => {
    expect(await buildRecordingPage({ ...input, rawSearch })).toMatchObject({ props: { sharedResult: null } });
  });
});
