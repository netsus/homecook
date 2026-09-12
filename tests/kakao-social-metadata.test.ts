import { describe, expect, it } from "vitest";
import config from "../next.config";

describe("Kakao head metadata delivery", () => {
  it.each(["kakaotalk-scrap/1.0", "kakaostory-og-reader/1.0", "facebookexternalhit/1.1; kakaotalk-scrap/1.0", "Twitterbot", "Slackbot", "Discordbot"])("serves blocking metadata to %s", agent => {
    expect(config.htmlLimitedBots?.test(agent)).toBe(true);
  });
  it("keeps streaming for normal browsers", () => {
    expect(config.htmlLimitedBots?.test("Mozilla/5.0 Chrome/130 Safari/537.36")).toBe(false);
  });
});
