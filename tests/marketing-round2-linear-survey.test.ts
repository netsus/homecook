import { describe, expect, it } from "vitest";
import { parseRound2Request } from "@/lib/marketing-round2";
import * as surveys from "@/lib/marketing/round2-survey";

const common = { action: "survey_submit", event_id: "11111111-1111-4111-8111-111111111111", topic: "homeflow", round_version: "r2.1", honeypot: "", survey_version: "r2.2-homeflow" };
const answers = { q1: "three_four", q2: "two_three", q3: "mental", q4: "shopping" };
const parse = (input: unknown) => parseRound2Request(JSON.stringify(input));

describe("linear homeflow versioned survey", () => {
  it("accepts the new direct-cooking and planning answers only in the new homeflow version", () => {
    expect(parse({ ...common, answers })).toEqual({ ...common, answers });
  });
  it.each([
    ["q1", "three_five"], ["q1", "six_plus"], ["q2", "on_the_day"], ["q3", "meal_plan"], ["q4", "yes"],
  ])("rejects legacy %s=%s in the new version", (key, value) => {
    expect(() => parse({ ...common, answers: { ...answers, [key]: value } })).toThrow(expect.objectContaining({ code: "VALIDATION_ERROR", fields: [`answers.${key}`] }));
  });
  it.each(["r2.1-homeflow", "r2.2-recording", "r2.3-homeflow"]) ("rejects new answers with incompatible version %s", survey_version => {
    expect(() => parse({ ...common, survey_version, answers })).toThrow(expect.objectContaining({ code: "VALIDATION_ERROR" }));
  });
  it("rejects the new homeflow version on recording", () => {
    expect(() => parse({ ...common, topic: "recording", answers })).toThrow(expect.objectContaining({ code: "VALIDATION_ERROR", fields: expect.arrayContaining(["survey_version"]) }));
  });
  it.each([
    { topic: "homeflow", survey_version: "r2.1-homeflow", answers: { q1: "three_five", q2: "on_the_day", q3: "meal_plan", q4: "yes" } },
    { topic: "recording", survey_version: "r2.1-recording", answers: { q1: "six_plus", q2: "reuse_saved", q3: "reuse_recipe", q4: "no" } },
  ])("preserves the old $survey_version meaning", previous => {
    expect(parse({ ...common, ...previous })).toEqual({ ...common, ...previous });
  });
  it("exports four short-option questions accepted by the real request parser", () => {
    expect(surveys).toHaveProperty("LINEAR_HOMEFLOW_SURVEY");
    const survey = (surveys as unknown as { LINEAR_HOMEFLOW_SURVEY: { version: string; questions: { id: string; label: string; options: { value: string; label: string }[] }[] } }).LINEAR_HOMEFLOW_SURVEY;
    expect(survey.version).toBe("r2.2-homeflow");
    expect(survey.questions.map(question => question.id)).toEqual(["q1", "q2", "q3", "q4"]);
    expect(survey.questions.map(question => question.options.map(option => option.label))).toEqual([
      ["0일", "1~2일", "3~4일", "5~7일"],
      ["0회", "1회", "2~3회", "4회 이상"],
      ["계획 없이 그때그때 정함", "미리 정하고 머릿속에 기억", "메모·캡처로 대략 정리", "날짜별 메뉴까지 정리"],
      ["집밥 계획 세우기", "집에 있는 재료 빼고 장보기 목록 만들기", "요리하면서 레시피 영상 다시 보기", "별로 불편하지 않음"],
    ]);
    for (const question of survey.questions) {
      for (const option of question.options) {
        const input = { ...common, answers: { ...answers, [question.id]: option.value } };
        expect(parse(input)).toEqual(input);
      }
    }
  });
});
