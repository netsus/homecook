import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(__dirname, "..");
const sourceEvidenceModuleUrl = pathToFileURL(
  path.join(repoRoot, "lib/server/recipe-extraction-lab/source-evidence.mjs"),
).href;
const candidatePacketsModuleUrl = pathToFileURL(
  path.join(repoRoot, "lib/server/recipe-extraction-lab/candidate-packets.mjs"),
).href;
const promptModuleUrl = pathToFileURL(path.join(repoRoot, "lib/server/recipe-extraction-lab/prompt.mjs")).href;
const runExtractionModuleUrl = pathToFileURL(path.join(repoRoot, "scripts/recipe-loop/run-extraction.mjs")).href;

function writeJson(filePath: string, value: unknown) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

describe("recipe-loop evidence packets", () => {
  let workdir: string;

  beforeEach(() => {
    workdir = mkdtempSync(path.join(tmpdir(), "recipe-loop-evidence-packets-"));
  });

  afterEach(() => {
    rmSync(workdir, { recursive: true, force: true });
  });

  it("preserves transcript timestamps and drops promotional source lines", async () => {
    const { buildSourceEvidenceRefs } = await import(sourceEvidenceModuleUrl);
    const refs = buildSourceEvidenceRefs({
      video: {
        title: "테스트",
        description: [
          "00:10 두부볶음",
          "[EVENT] 댓글 참여자 총 5명 랜덤 추첨",
          "구매처 링크 https://example.test",
        ].join("\n"),
      },
      transcript: {
        language: "ko",
        segments: [
          { lineIndex: 3, text: "두부를 넣고 볶는다.", startMs: 12340, durationMs: 2000, language: "ko" },
        ],
      },
      authorComments: [],
    });

    expect(refs.map((ref: { text: string }) => ref.text)).toContain("00:10 두부볶음");
    expect(refs.map((ref: { text: string }) => ref.text)).toContain("두부를 넣고 볶는다.");
    expect(refs.some((ref: { text: string }) => ref.text.includes("댓글 참여자"))).toBe(false);
    expect(refs.some((ref: { text: string }) => ref.text.includes("https://example.test"))).toBe(false);
    expect(refs.find((ref: { source: string }) => ref.source === "transcript")).toMatchObject({
      lineIndex: 3,
      startMs: 12340,
      endMs: 14340,
    });
  });

  it("builds seven scoped packets for fTlTpSJtrEs without tag over-splitting", async () => {
    const { sourceToInput } = await import(runExtractionModuleUrl);
    const { buildEvidencePacketBundle } = await import(candidatePacketsModuleUrl);
    const source = JSON.parse(
      readFileSync(path.join(repoRoot, "notebooks/recipe_loop_data/train/fTlTpSJtrEs/source.json"), "utf8"),
    );

    const bundle = buildEvidencePacketBundle(sourceToInput(source));

    expect(bundle.version).toBe("recipe-evidence-packet-v1");
    expect(bundle.packets.map((packet: { titleHint: string }) => packet.titleHint)).toEqual([
      "메밀 후토마끼",
      "맥적구이",
      "열무 들기름 냉파스타",
      "등촌식 멸치칼국수",
      "소곱창구이",
      "도토리 묵사발",
      "항정살 마늘쫑 솥밥",
    ]);
    expect(JSON.stringify(bundle.packets)).toContain("새우");
    expect(JSON.stringify(bundle.packets)).not.toContain("요리하기");
    expect(JSON.stringify(bundle.report.rows)).toContain("amount_or_unit");
    expect(JSON.stringify(bundle.report.rows)).not.toContain("700ml");
  });

  it("writes evidence packet artifacts for lab extraction runs", async () => {
    const { runExtraction } = await import(runExtractionModuleUrl);
    const source = {
      video: {
        videoId: "case-a",
        url: "https://www.youtube.com/watch?v=case-a",
        title: "두부볶음",
        description: "00:00 두부볶음",
        tags: ["두부볶음"],
      },
      captions: {
        available: true,
        language: "ko",
        segments: [{ lineIndex: 0, text: "두부를 넣고 볶는다.", startMs: 0, durationMs: 3000, language: "ko" }],
      },
      authorComments: { comments: [] },
    };
    writeJson(path.join(workdir, "notebooks/recipe_loop_data/train/case-a/source.json"), source);

    const llm = {
      generate: async ({ videoUrl }: { videoUrl: string | null }) => ({
        cached: false,
        model: "fixture",
        provider: "fixture",
        json: {
          recipes: [
            {
              title: "두부볶음",
              ingredients: [{ name: "두부", amount: null, unit: null, amountBasis: null }],
              steps: ["두부를 넣고 볶는다."],
            },
          ],
        },
        meta: { receivedVideoUrl: videoUrl },
      }),
    };

    await expect(runExtraction({ split: "train", ids: "case-a", "out-tag": "packet-artifact" }, {
      projectRoot: workdir,
      dataRoot: "notebooks/recipe_loop_data",
      llm,
    })).resolves.toEqual({ failures: 0 });

    const runDir = path.join(workdir, "notebooks/recipe_loop_data/train/case-a/runs/packet-artifact");
    expect(existsSync(path.join(runDir, "evidence-packets.json"))).toBe(true);
    expect(existsSync(path.join(runDir, "cue-extraction-report.json"))).toBe(true);
    const result = JSON.parse(readFileSync(path.join(runDir, "result.json"), "utf8"));
    expect(result.meta).toMatchObject({
      evidencePacketMode: true,
      evidencePacketCount: 1,
      usedVisual: true,
      receivedVideoUrl: "https://www.youtube.com/watch?v=case-a",
    });
  });

  it("builds source text with transcript line timestamps", async () => {
    const { buildSourceText } = await import(promptModuleUrl);
    const sourceText = buildSourceText({
      video: { title: "테스트", description: "" },
      transcript: {
        language: "ko",
        segments: [{ lineIndex: 7, text: "새우를 굽는다.", startMs: 38320, durationMs: 3000 }],
      },
      authorComments: [],
    });

    expect(sourceText).toContain("[00:38.320] 새우를 굽는다.");
  });
});
