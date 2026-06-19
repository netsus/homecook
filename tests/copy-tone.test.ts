import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repoRoot = process.cwd();
const sourceRoots = ["app", "components", "lib"] as const;
const sourceExtensions = new Set([".ts", ".tsx"]);
const excludedFiles = new Set([
  // These files intentionally handle external/user-generated recipe text and parser patterns.
  "lib/recipio-youtube-import.ts",
  "lib/server/youtube-description-parser.ts",
]);

function collectSourceFiles(relativeRoot: string): string[] {
  const absoluteRoot = join(repoRoot, relativeRoot);
  const entries = readdirSync(absoluteRoot);
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = join(relativeRoot, entry);
    const absolutePath = join(repoRoot, relativePath);
    const stat = statSync(absolutePath);

    if (stat.isDirectory()) {
      files.push(...collectSourceFiles(relativePath));
      continue;
    }

    const extension = relativePath.slice(relativePath.lastIndexOf("."));

    if (sourceExtensions.has(extension) && !excludedFiles.has(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

describe("user-facing copy tone", () => {
  it("keeps the manual UI review copy examples in the shared friendly tone", () => {
    const targets = sourceRoots.flatMap((root) => collectSourceFiles(root));
    const bannedCopy = [
      "주소가 바뀌었거나 더 이상 제공하지 않는 화면이에요",
      "로그인 후에는 다시 이 화면으로 돌아옵니다",
      "로그인 후 이 화면으로 자동으로 돌아옵니다",
      "로그인 후 이전 화면으로 돌아갑니다",
      "현재 화면으로 돌아옵니다",
      "돌아갑니다",
      "여기에 기록됩니다",
      "시도해주세요",
      "입력해주세요",
      "선택해주세요",
      "확인해주세요",
      "추가해주세요",
      "정해주세요",
      "업로드해주세요",
      "기다려주세요",
      "골라주세요",
      "체크해주세요",
      "추출해주세요",
      "적용해주세요",
      "가져와주세요",
      "로그인이 필요합니다",
      "권한이 없습니다",
      "찾을 수 없습니다",
      "조건에 맞는 레시피가 없습니다",
      "환경 변수가 필요합니다",
      "불러오는 중입니다",
      "진행된 식사입니다",
      "일반 영상입니다",
      "읽지 못했습니다",
      "못했습니다",
      "관리합니다",
      "관리됩니다",
      "확인합니다",
      "로그인합니다",
      "사용합니다",
      "제거합니다",
      "제거됩니다",
      "적용됩니다",
      "표시됩니다",
      "공유되었습니다",
      "복사되었습니다",
    ];

    for (const filePath of targets) {
      const source = readFileSync(join(repoRoot, filePath), "utf8");

      for (const copy of bannedCopy) {
        expect(source, `${filePath} should not include "${copy}"`).not.toContain(copy);
      }
    }
  });
});
