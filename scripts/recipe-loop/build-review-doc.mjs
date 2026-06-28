#!/usr/bin/env node
/* eslint-disable no-console */
// 분할(split)별 golden.json을 사람이 검수하기 좋은 마크다운 문서로 묶는다.
//
// 사용법: node scripts/recipe-loop/build-review-doc.mjs --split validation [--out notebooks/recipe_loop_data/REVIEW_validation.md]

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const PROJECT_ROOT = process.cwd();
const DATA_ROOT = "notebooks/recipe_loop_data";
const BASIS_LABEL = {
  "stated-description": "설명란",
  "stated-caption": "자막",
  "stated-comment": "댓글",
  "spoken": "발화",
  "onscreen": "화면자막",
  "visual-estimate": "시각추정",
};

function parseCliArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const nextToken = argv[index + 1];
    if (!nextToken || nextToken.startsWith("--")) {
      args[key] = true;
      continue;
    }
    args[key] = nextToken;
    index += 1;
  }
  return args;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const split = typeof args.split === "string" ? args.split : "validation";
  const outPath = typeof args.out === "string"
    ? args.out
    : path.join(DATA_ROOT, `REVIEW_${split}.md`);

  const manifest = JSON.parse(await readFile(path.join(PROJECT_ROOT, DATA_ROOT, "manifest.json"), "utf8"));
  const entries = manifest[split];
  if (!Array.isArray(entries)) {
    console.error(`manifest에 ${split} 분할이 없습니다.`);
    process.exit(1);
  }

  const lines = [
    `# M2 골든셋 검수 문서 — ${split} ${entries.length}`,
    "",
    "분량의 \\[근거\\]: 설명란/자막/댓글 = 텍스트 명시, 발화/화면자막 = 영상 내 명시, **시각추정** = GPT 5.4 keyframe 분석 추정치.",
    "수정할 내용을 알려주시면 golden.json에 반영하고 reviewStatus를 approved로 바꿉니다.",
    "",
  ];

  for (const entry of entries) {
    const golden = JSON.parse(
      await readFile(path.join(PROJECT_ROOT, DATA_ROOT, split, entry.videoId, "golden.json"), "utf8"),
    );
    lines.push("---", "", `## ${entry.title} (${entry.videoId}) — ${golden.reviewStatus}`, "");
    lines.push(`- 채널: ${entry.channel} · 길이: ${entry.durationSeconds}s · 축: ${entry.axes.join(", ")}`);
    lines.push(`- 영상: https://www.youtube.com/watch?v=${entry.videoId}`);
    lines.push(`- 초안 출처: ${golden.draftedBy}`);
    lines.push("");
    for (const recipe of golden.recipes) {
      lines.push(`### ${recipe.title}${recipe.servings ? ` (${recipe.servings}인분)` : ""}`);
      lines.push("", "| 재료 | 분량 | 근거 | 그룹 | 비고 |", "|---|---|---|---|---|");
      for (const ing of recipe.ingredients) {
        const amount = [ing.amount, ing.unit].filter(Boolean).join(" ") || "—";
        const basis = ing.amountBasis ? (BASIS_LABEL[ing.amountBasis] ?? ing.amountBasis) : "";
        const notes = [
          ing.optional ? "선택" : null,
          ing.nameAliases?.length ? `별칭: ${ing.nameAliases.join(", ")}` : null,
        ].filter(Boolean).join(" · ");
        lines.push(`| ${ing.name} | ${amount} | ${basis === "시각추정" ? "**시각추정**" : basis} | ${ing.groupLabel ?? ""} | ${notes} |`);
      }
      lines.push("", "**만들기**", "");
      for (const step of recipe.steps) {
        lines.push(`${step.order}. ${step.instruction}${step.evidence === "visual" ? " *(시각 추출)*" : ""}`);
      }
      lines.push("");
    }
    if (golden.graderNotes?.length) {
      lines.push("**검수 참고**", "");
      for (const note of golden.graderNotes) lines.push(`- ${note}`);
      lines.push("");
    }
  }

  await writeFile(path.join(PROJECT_ROOT, outPath), lines.join("\n") + "\n", "utf8");
  console.log(`${outPath}: ${lines.length} lines`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
