import { describe, expect, it, vi } from "vitest";
import { createRound2Client } from "@/lib/marketing/round2-client";
import { RETENTION_UNTIL, type Round2Request, type Round2SuccessData } from "@/lib/marketing-round2";

const answers = { q1: "none", q2: "once", q3: "memo", q4: "none" };
const now = Date.parse("2026-09-12T00:00:00Z");
function setup(conflict = false) {
  const confirmed = vi.fn();
  let completed = false;
  const requests: Round2Request[] = [];
  const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const request = JSON.parse(init!.body as string) as Round2Request;
    requests.push(request);
    if (request.action === "survey_submit") {
      completed = true;
      if (conflict) return new Response(JSON.stringify({ success: false, error: { code: "ACTIVITY_ALREADY_COMPLETED" } }), { status: 409 });
    }
    const data: Round2SuccessData = {
      round_version: "r2.1", topic: "homeflow", event_id: request.event_id,
      participation_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", revision: requests.length,
      consent_generation: 1, state: { survey: completed ? "completed" : "started", example: "not_started", lead: "not_started" },
      participation_expires_at: "2026-10-10T00:00:00Z", retention_until: RETENTION_UNTIL, receipt: null,
    };
    return new Response(JSON.stringify({ success: true, data, error: null }));
  });
  const client = createRound2Client({ topic: "homeflow", surveyVersion: "r2.2-homeflow", onSurveyConfirmed: confirmed,
    attribution: { first_channel: "direct", utm_source: null, utm_medium: null, utm_campaign: null, utm_content: null },
    pageContext: "", preview: false, leadReady: true, indexedDB: null, now: () => now, fetch: fetcher });
  return { client, requests, confirmed };
}
describe("versioned survey original-request confirmation", () => {
  it("uses the real approved version parser and confirms exactly the posted tuple", async () => {
    const { client, requests, confirmed } = setup();
    await client.connect();
    expect(await client.submitSurvey(answers)).toBe(true);
    const sent = requests.find(request => request.action === "survey_submit")!;
    expect(sent).toMatchObject({ survey_version: "r2.2-homeflow", answers });
    expect(confirmed).toHaveBeenCalledExactlyOnceWith(sent, expect.objectContaining({ event_id: sent.event_id, state: expect.objectContaining({ survey: "completed" }) }));
  });
  it("does not turn an unrelated completed snapshot after 409 into submission proof", async () => {
    const { client, confirmed } = setup(true);
    await client.connect();
    expect(await client.submitSurvey(answers)).toBe(true);
    expect(client.getState().snapshot?.state.survey).toBe("completed");
    expect(confirmed).not.toHaveBeenCalled();
  });
});
