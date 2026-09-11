import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ROUND2_CONSENT_VERSION, ROUND2_FREQUENCIES, ROUND2_HOMEFLOW_FEATURES, ROUND2_HOMEFLOW_METHODS, ROUND2_INTENTS, ROUND2_PURPOSE, ROUND2_RECORDING_FEATURES, ROUND2_RECORDING_METHODS, ROUND2_VERSION, RETENTION_UNTIL } from "@/lib/marketing-round2";
import { ROUND2_LEAD_COPY, ROUND2_SURVEYS } from "@/lib/marketing/round2-survey";

const contract = readFileSync(new URL("../docs/marketing-demand-validation-r2-contract.md", import.meta.url), "utf8");
function tableQuestion(topic: string, id: string) {
  const prefix = id === "q1" ? "| 공통 Q1 |" : `| ${topic} ${id.toUpperCase()} |`;
  const row = contract.split("\n").find(line => line.startsWith(prefix));
  if (!row) throw new Error("contract question row missing");
  const cells = row.split("|");
  const label = cells[2].match(/`([^`]+)`/)?.[1];
  const options = [...cells[3].matchAll(/`([^`]+)` → `([^`]+)`/g)].map(match => ({ value: match[1], label: match[2] }));
  return { label, options };
}
function quotedAfter(prefix: string) {
  const after = contract.split(prefix)[1];
  if (!after) throw new Error("contract copy anchor missing");
  return after.match(/`([^`]+)`/)?.[1];
}
describe("r2 shared exact survey and consent copy", () => {
  it.each(["recording", "homeflow"] as const)("keeps %s exactly four ordered single-choice questions", topic => {
    const survey = ROUND2_SURVEYS[topic];
    expect(survey.version).toBe(`${ROUND2_VERSION}-${topic}`);
    expect(survey.questions.map(question => question.id)).toEqual(["q1", "q2", "q3", "q4"]);
    for (const question of survey.questions) {
      expect({ label: question.label, options: question.options }).toEqual(tableQuestion(topic, question.id));
      expect(new Set(question.options.map(option => option.value)).size).toBe(question.options.length);
    }
  });
  it.each(["recording", "homeflow"] as const)("keeps %s UI option values aligned with parser enums", topic => {
    const [q1, q2, q3, q4] = ROUND2_SURVEYS[topic].questions;
    expect(q1.options.map(option => option.value)).toEqual(ROUND2_FREQUENCIES);
    expect(q2.options.map(option => option.value)).toEqual(topic === "recording" ? ROUND2_RECORDING_METHODS : ROUND2_HOMEFLOW_METHODS);
    expect(q3.options.map(option => option.value)).toEqual(topic === "recording" ? ROUND2_RECORDING_FEATURES : ROUND2_HOMEFLOW_FEATURES);
    expect(q4.options.map(option => option.value)).toEqual(ROUND2_INTENTS);
    expect(q1.options.map(option => option.value)).toContain("none");
    expect(q2.options.map(option => option.value)).toContain("other");
    expect(q3.options.map(option => option.value)).toContain("none");
    expect(q4.options.map(option => option.value)).toEqual(expect.arrayContaining(["no", "unsure"]));
  });
  it.each(["recording", "homeflow"] as const)("places %s exact family scope and input-condition notices", topic => {
    const [q1, , , q4] = ROUND2_SURVEYS[topic].questions;
    expect(q1.noticeAfter).toBe(quotedAfter("공통 Q1 바로 아래 필수 안내:"));
    expect(q4.noticeBefore).toBe(quotedAfter(`${topic} Q4 바로 위 필수 안내:`));
  });
  it("keeps exact purpose-limited consent, optional participation and age notices", () => {
    expect(ROUND2_LEAD_COPY.consentVersion).toBe(ROUND2_CONSENT_VERSION);
    expect(ROUND2_LEAD_COPY.purpose).toBe(ROUND2_PURPOSE);
    expect(ROUND2_LEAD_COPY.retentionUntil).toBe(RETENTION_UNTIL);
    expect(ROUND2_LEAD_COPY.consentLabel).toBe(quotedAfter("동의 label:"));
    expect(contract).toContain("`" + ROUND2_LEAD_COPY.optionalParticipationNotice + "`");
    expect(ROUND2_LEAD_COPY.optionalParticipationNotice).toBe("동의하지 않아도 예시와 의견 남기기를 이용할 수 있어요");
    expect(contract).toContain("`" + ROUND2_LEAD_COPY.minimumAgeNotice + "`");
    expect(ROUND2_LEAD_COPY.minimumAgeNotice).toBe("만 14세 이상인 경우에만 신청해 주세요");
  });
});
