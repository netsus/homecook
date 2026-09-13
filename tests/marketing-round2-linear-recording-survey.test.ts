import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as protocol from "@/lib/marketing-round2";
import * as surveys from "@/lib/marketing/round2-survey";

const common = { action: "survey_submit", event_id: "11111111-1111-4111-8111-111111111111", topic: "recording", round_version: "r2.1", honeypot: "", survey_version: "r2.2-recording" };
const answers = { q1: "daily", q2: "6_plus", q3: "track", q4: "weight" };
const parse = (input: unknown) => protocol.parseRound2Request(JSON.stringify(input));
const contract = readFileSync("docs/marketing-demand-validation-r2-contract.md", "utf8").split("### 12.2 recording:")[1].split("### 12.3 homeflow:")[0];
const approved = JSON.parse(contract.match(/```json\n([\s\S]*?)\n```/)![1]) as {
  survey_version: string;
  questions: { id: string; prompt: string; helper?: string; choices: [string, string][] }[];
};

describe("linear recording versioned survey", () => {
  it("accepts recording answers under the new survey version while retaining round r2.1", () => {
    expect(parse({ ...common, answers })).toEqual({ ...common, answers });
    expect(protocol).toHaveProperty("LINEAR_RECORDING_SURVEY_VERSION", "r2.2-recording");
  });

  it("preserves the approved question text, newlines, helper, option values and order", () => {
    expect(surveys).toHaveProperty("LINEAR_RECORDING_SURVEY", {
      version: approved.survey_version,
      questions: approved.questions.map(question => ({
        id: question.id,
        label: question.prompt,
        ...(question.helper ? { noticeAfter: question.helper } : {}),
        options: question.choices.map(([value, label]) => ({ value, label })),
      })),
    });
  });

  it("accepts every approved option through the real parser", () => {
    for (const question of approved.questions) {
      for (const [value] of question.choices) {
        const input = { ...common, answers: { ...answers, [question.id]: value } };
        expect(parse(input)).toEqual(input);
      }
    }
  });

  it.each([
    ["q1", "three_five"], ["q1", "three_four"], ["q2", "search_app"], ["q2", "two_three"],
    ["q3", "reuse_recipe"], ["q3", "mental"], ["q4", "yes"], ["q4", "shopping"],
    ["q1", "unknown"], ["q2", null], ["q3", []], ["q4", undefined],
  ])("rejects mixed or invalid %s=%s", (key, value) => {
    expect(() => parse({ ...common, answers: { ...answers, [key]: value } })).toThrow(expect.objectContaining({ code: "VALIDATION_ERROR", fields: [`answers.${key}`] }));
  });

  it.each(["r2.1-recording", "r2.2-homeflow", "r2.3-recording"])("rejects new answers under incompatible %s", survey_version => {
    expect(() => parse({ ...common, survey_version, answers })).toThrow(expect.objectContaining({ code: "VALIDATION_ERROR" }));
  });

  it.each([
    { topic: "homeflow" }, { round_version: "r2.2" },
    { answers: { ...answers, q5: "extra" } }, { answers: null }, { answers: [] },
    { result_type: "ingredient-tracker" },
  ])("rejects a wrong topic/round or an expanded payload: %j", overrides => {
    expect(() => parse({ ...common, answers, ...overrides })).toThrow(expect.objectContaining({ code: "VALIDATION_ERROR" }));
  });

  it.each([
    { topic: "recording", survey_version: "r2.1-recording", answers: { q1: "six_plus", q2: "reuse_saved", q3: "reuse_recipe", q4: "no" } },
    { topic: "homeflow", survey_version: "r2.1-homeflow", answers: { q1: "three_five", q2: "on_the_day", q3: "meal_plan", q4: "yes" } },
    { topic: "homeflow", survey_version: "r2.2-homeflow", answers: { q1: "three_four", q2: "two_three", q3: "mental", q4: "shopping" } },
  ])("preserves the existing $survey_version answers", previous => {
    expect(parse({ ...common, ...previous })).toEqual({ ...common, ...previous });
    expect(() => parse({ ...common, answers: previous.answers })).toThrow(expect.objectContaining({ code: "VALIDATION_ERROR" }));
  });
});
