import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DECISIONS = new Set(["accepted", "rejected", "inconclusive", "blocked"]);
export const PROTECTED_SPLITS = new Set(["validation", "holdout"]);
export const PROTECTED_TEMPLATE =
  "protected split aggregate-only 기록입니다. 레시피명, 재료명, 단계 문장, judge reason은 저장하지 않았습니다.";

export function repoRelative(filePath, cwd = process.cwd()) {
  if (!filePath) return null;
  const resolved = path.resolve(filePath);
  const relative = path.relative(cwd, resolved);
  return relative.startsWith("..") ? resolved : relative;
}

export function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeJsonAtomic(filePath, value) {
  writeTextAtomic(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function writeTextAtomic(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tmpPath, text, "utf8");
  fs.renameSync(tmpPath, filePath);
}

export function appendJsonLine(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

export function sha256File(filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return null;
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

export function fileInfo(filePath, cwd = process.cwd()) {
  if (!filePath) return { path: null, exists: false };
  const exists = fs.existsSync(filePath);
  const stat = exists ? fs.statSync(filePath) : null;
  return {
    path: repoRelative(filePath, cwd),
    exists,
    size: stat?.isFile() ? stat.size : null,
    sha256: stat?.isFile() ? sha256File(filePath) : null,
  };
}

export function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function isCanaryOk(canaryLeak) {
  if (!canaryLeak) return true;
  if (canaryLeak.success === false) return false;
  if (Number(canaryLeak.hit_count ?? 0) > 0) return false;
  const status = String(canaryLeak.status ?? "clean");
  return status === "clean" || status === "not_applicable";
}

export function containsSecretLikeText(value) {
  const text = String(value ?? "");
  return [
    /discord(?:app)?\.com\/api\/webhooks/i,
    /\b(?:sk|sk-proj)-[A-Za-z0-9_-]{16,}/,
    /\b(?:OPENAI|GEMINI|ANTHROPIC|DISCORD)_[A-Z0-9_]*KEY\b/,
    /\b(?:api[_-]?key|webhook[_-]?url)\s*[:=]\s*\S+/i,
  ].some((pattern) => pattern.test(text));
}

export function assertNoSecretLikeText(fields) {
  const offending = Object.entries(fields).find(([, value]) => containsSecretLikeText(value));
  if (offending) {
    throw new Error(`secret-like value refused in ${offending[0]}`);
  }
}

export function iterationName(iteration) {
  return `iteration-${String(iteration).padStart(2, "0")}`;
}

export function buildManifest({ runId, createdAt }) {
  return {
    format: "codex-vision-keyframes-history",
    schemaVersion: 1,
    compatibleWithLoopPy: false,
    claudeRequired: false,
    provider: "codex-vision-keyframes",
    mvpScope: "single-id-smoke",
    runId,
    createdAt,
    protectedSplitPolicy: "aggregate-only-no-freeform",
  };
}

export function buildReadme(entries) {
  const latest = entries.at(-1);
  const lines = [
    "# Codex Vision Keyframes 실험 히스토리",
    "",
    "Claude 없이 `codex-vision-keyframes` 실험을 이어가기 위한 append-only 기록입니다.",
    "",
    "## 이어받는 방법",
    "",
    "1. 이 `README.md`를 읽습니다.",
    "2. `history.jsonl` 마지막 5줄을 읽습니다.",
    "3. 마지막 `iteration-XX/feedback_for_next_iter.md`를 읽습니다.",
    "4. 그 다음 새 실험을 설계합니다.",
    "",
    "## 최신 상태",
    "",
  ];
  if (latest) {
    lines.push(
      `- 최신 iteration: ${latest.iteration}`,
      `- decision: ${latest.decision}`,
      `- outTag: ${latest.outTag}`,
      `- semantic average: ${latest.result?.semantic?.averageScore ?? "n/a"}`,
      `- next action: ${latest.nextAction ?? "n/a"}`,
      "",
    );
  } else {
    lines.push("- 아직 기록된 iteration이 없습니다.", "");
  }
  lines.push(
    "## 전체 기록",
    "",
    "| iteration | decision | outTag | semantic average | min case | next action |",
    "|---:|---|---|---:|---:|---|",
    ...entries.map((entry) =>
      `| ${entry.iteration} | ${entry.decision} | \`${entry.outTag}\` | ${entry.result?.semantic?.averageScore ?? "n/a"} | ${entry.result?.semantic?.minCaseScore ?? "n/a"} | ${String(entry.nextAction ?? "").replaceAll("\n", " ")} |`,
    ),
    "",
  );
  return `${lines.join("\n")}\n`;
}

export function buildDashboardHtml(entries, { generatedAt = new Date().toISOString() } = {}) {
  const rows = entries
    .map((entry) => {
      const weakest = Array.isArray(entry.weakestCases)
        ? entry.weakestCases.map((item) => `${item.title ?? "aggregate"} (${item.caseScore ?? "n/a"})`).join("<br>")
        : "";
      return `<tr class="${escapeHtml(entry.decision)}">
        <td>${escapeHtml(entry.iteration)}</td>
        <td><span class="badge">${escapeHtml(entry.decision)}</span></td>
        <td><code>${escapeHtml(entry.outTag)}</code></td>
        <td class="num">${escapeHtml(entry.result?.semantic?.averageScore ?? "n/a")}</td>
        <td class="num">${escapeHtml(entry.result?.semantic?.minCaseScore ?? "n/a")}</td>
        <td>${weakest}</td>
        <td>${escapeHtml(entry.nextAction ?? "")}</td>
      </tr>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Codex Vision Keyframes History</title>
  <style>
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;background:#eef5f4;color:#1f2937;line-height:1.65}
    .wrap{max-width:1040px;margin:0 auto;padding:32px 18px 64px}
    header{background:#10302e;color:#effaf7;border-radius:14px;padding:26px 28px;margin-bottom:18px}
    h1{margin:0 0 8px;font-size:26px;letter-spacing:0}
    .card{background:#fff;border:1px solid #dbe5e3;border-radius:12px;padding:22px;box-shadow:0 1px 2px rgba(16,24,40,.06)}
    table{width:100%;border-collapse:collapse;font-size:14px;min-width:820px}
    .table-wrap{overflow-x:auto}
    th,td{padding:10px 12px;border-bottom:1px solid #e5ecea;text-align:left;vertical-align:top}
    th{background:#edf7f5}
    .num{text-align:right;font-variant-numeric:tabular-nums}
    code{background:#e8eeed;padding:1px 5px;border-radius:5px}
    .badge{display:inline-block;border-radius:999px;padding:2px 9px;background:#e8eeed;font-weight:700}
    tr.accepted .badge{background:#dcfce7;color:#166534}
    tr.rejected .badge{background:#fee2e2;color:#991b1b}
    tr.inconclusive .badge{background:#fef3c7;color:#92400e}
    tr.blocked .badge{background:#f3f4f6;color:#374151}
    footer{margin-top:22px;color:#64748b;font-size:12px;text-align:center}
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Codex Vision Keyframes 실험 히스토리</h1>
      <div>Claude 없이 누적한 append-only 실험 기록입니다.</div>
    </header>
    <section class="card">
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>iteration</th><th>decision</th><th>outTag</th><th class="num">semantic avg</th><th class="num">min case</th><th>weakest</th><th>next action</th></tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="7">아직 기록된 iteration이 없습니다.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
    <footer>Generated at ${escapeHtml(generatedAt)}</footer>
  </div>
</body>
</html>
`;
}

export function regenerateRunDocs(runDir) {
  const historyPath = path.join(runDir, "history.jsonl");
  const entries = readJsonl(historyPath);
  writeTextAtomic(path.join(runDir, "README.md"), buildReadme(entries));
  writeTextAtomic(path.join(runDir, "dashboard.html"), buildDashboardHtml(entries));
  return entries;
}
