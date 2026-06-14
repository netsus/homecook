"""유튜브 레시피 추출 강화 루프 오케스트레이터.

한 ITER 흐름 (데모 노트북 구조를 레시피 과제로 이식):
  1 계획(Claude)  → 2 구현(Codex, recipe-extraction-lab만 수정)
  → 3 확정검증(추출 실행 + 스키마/하드코딩 점검)
  → 4 채점(결정적 + AI 의미)  → 5 판정(코드)
  → 6 진단(Claude, train 케이스 상세 + validation 집계만)  → 7 재시도

격리 원칙:
  - 구현/진단 프롬프트에 validation/holdout 정답을 절대 넣지 않는다.
  - 모듈 코드에 validation/holdout 정답 문구가 하드코딩되면 확정검증 FAIL.
  - validation은 집계 점수만 루프에 노출, holdout은 루프 중 미채점.

노트북(recipe_extract_loop.ipynb)이 이 모듈의 run_loop()/run_iteration()을 호출한다.
무거운 작업(추출/채점)은 scripts/recipe-loop/*.mjs 를 subprocess로 재사용한다.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path


def find_project_root(start: Path | None = None) -> Path:
    current = (start or Path.cwd()).resolve()
    for candidate in (current, *current.parents):
        if (candidate / "package.json").exists() and (candidate / ".git").exists():
            return candidate
    raise RuntimeError("homecook 프로젝트 루트를 찾지 못했습니다.")


PROJECT_ROOT = find_project_root()
DATA_ROOT = PROJECT_ROOT / "notebooks" / "recipe_loop_data"
RUN_ROOT = PROJECT_ROOT / "notebooks" / "recipe_loop_runs"
MODULE_DIR = PROJECT_ROOT / "lib" / "server" / "recipe-extraction-lab"
KST = timezone(timedelta(hours=9), name="KST")


# ---- 설정 ---------------------------------------------------------------

@dataclass
class LoopConfig:
    max_iter: int = 3
    train_split: str = "train"
    val_split: str = "validation"
    # 추출/AI 의미채점에 쓰는 Gemini 모델
    model: str = "gemini-2.5-flash"
    semantic_judge_provider: str = "gemini"
    semantic_judge_model: str = "gemini-2.5-flash"
    semantic_calibration_path: str = str(DATA_ROOT / "semantic_calibration.json")
    # 계획/진단 담당 Claude 모델 (CLI --model 별칭). 추론 비중이 커서 opus 기본.
    claude_model: str = "opus"
    # 구현 담당 Codex 모델·추론강도 (CLI -c 오버라이드로 명시 고정 → 재현성)
    codex_model: str = "gpt-5.4"
    codex_effort: str = "xhigh"
    # 판정 임계값 (M3 기준선: 결정 F1 0.899 / 분량 0.787 / 단계 0.813, AI 의미 ~3.5)
    det_f1_min: float = 0.92
    det_amount_min: float = 0.85
    det_step_min: float = 0.85
    det_recipe_count_min: float = 0.95
    ai_case_min: float = 4.0
    ai_avg_min: float = 4.3

    @property
    def claude_cmd(self) -> tuple[str, ...]:
        return ("claude", "-p", "--permission-mode", "plan", "--model", self.claude_model)

    @property
    def codex_cmd(self) -> tuple[str, ...]:
        return ("codex", "exec", "--sandbox", "workspace-write",
                "-c", f"model={self.codex_model}",
                "-c", f"model_reasoning_effort={self.codex_effort}")


def kst_now() -> datetime:
    return datetime.now(KST)


def kst_stamp() -> str:
    return kst_now().strftime("%Y-%m-%d %H:%M:%S KST")


# ---- 공통 유틸 ----------------------------------------------------------

def run_node(script: str, *args: str) -> subprocess.CompletedProcess:
    cmd = ["node", f"scripts/recipe-loop/{script}", *args]
    return subprocess.run(cmd, cwd=str(PROJECT_ROOT), text=True, capture_output=True)


def semantic_grader_args(cfg: LoopConfig, split: str, out_tag: str, expected: str) -> tuple[str, ...]:
    return (
        "--split", split,
        "--out-tag", out_tag,
        "--judge-provider", cfg.semantic_judge_provider,
        "--judge-model", cfg.semantic_judge_model,
        "--calibration", cfg.semantic_calibration_path,
        "--expected-count", expected,
    )


def run_agent(cmd: tuple[str, ...], prompt: str, log_path: Path, cwd: Path | None = None) -> str:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    chunks: list[str] = []
    with log_path.open("w", encoding="utf-8") as log:
        proc = subprocess.Popen(
            [*cmd, prompt],
            cwd=str(cwd or PROJECT_ROOT),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=os.environ.copy(),
        )
        for line in proc.stdout:  # type: ignore[union-attr]
            print(line, end="")
            log.write(line)
            chunks.append(line)
        proc.wait()
        if proc.returncode != 0:
            raise RuntimeError(f"agent command failed rc={proc.returncode}: {' '.join(cmd[:2])}")
    return "".join(chunks)


def read_json(path: Path, default=None):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except Exception:
        return default if default is not None else {}


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def stage(msg: str) -> None:
    print("\n" + "=" * 80)
    print(f"[{kst_stamp()}] {msg}")
    print("=" * 80)


# ---- 격리 점검 ----------------------------------------------------------

PROTECTED_SPLITS = ["validation", "holdout"]


def module_source() -> str:
    return "\n".join(p.read_text(encoding="utf-8") for p in MODULE_DIR.glob("*.mjs"))


def _compact_text(value) -> str:
    return "".join(str(value or "").split())


def _normalized_text(value) -> str:
    return " ".join(str(value or "").split()).strip()


def _add_protected_fragment(fragments: list[dict], seen: set[tuple[str, str, str, str]],
                            split: str, category: str, value, min_compact_len: int) -> None:
    text = _normalized_text(value)
    if len(_compact_text(text)) < min_compact_len:
        return
    key = (split, category, text, _compact_text(text))
    if key in seen:
        return
    seen.add(key)
    fragments.append({"split": split, "category": category, "value": text})


def protected_answer_fragments(splits: list[str] | None = None) -> list[dict]:
    """Naive copy 탐지용 validation/holdout 정답 fragment.

    이 검사는 복붙성 하드코딩과 산출물 누출을 잡는 tripwire다. 패러프레이즈나
    정규화 우회까지 막는 strict blind 장치는 아니다.
    """
    fragments: list[dict] = []
    seen: set[tuple[str, str, str, str]] = set()
    for split in (splits or PROTECTED_SPLITS):
        split_dir = DATA_ROOT / split
        if not split_dir.exists():
            continue
        for golden_path in split_dir.glob("*/golden.json"):
            golden = read_json(golden_path)
            for recipe in golden.get("recipes", []):
                _add_protected_fragment(fragments, seen, split, "recipe_title", recipe.get("title"), 5)
                for ingredient in recipe.get("ingredients", []):
                    if not isinstance(ingredient, dict):
                        continue
                    name = ingredient.get("name")
                    _add_protected_fragment(fragments, seen, split, "ingredient_name", name, 5)
                    for alias in ingredient.get("nameAliases", []) or []:
                        _add_protected_fragment(fragments, seen, split, "ingredient_alias", alias, 5)
                    amount = ingredient.get("amount")
                    unit = ingredient.get("unit")
                    if name and amount:
                        amount_unit = f"{amount}{unit or ''}"
                        for value in (
                            f"{name} {amount_unit}",
                            f"{name}{amount_unit}",
                            f"{name}: {amount} {unit or ''}",
                        ):
                            _add_protected_fragment(fragments, seen, split, "ingredient_quantity", value, 5)
                for step in recipe.get("steps", []):
                    text = step.get("instruction") if isinstance(step, dict) else step
                    _add_protected_fragment(fragments, seen, split, "step_instruction", text, 12)
    return fragments


def forbidden_strings(splits: list[str]) -> list[str]:
    """Backward-compatible raw fragment list for local tripwire callers."""
    return [fragment["value"] for fragment in protected_answer_fragments(splits)]


def scan_texts_for_protected_answers(items: list, fragments: list[dict] | None = None) -> dict:
    fragments = fragments if fragments is not None else protected_answer_fragments(PROTECTED_SPLITS)
    hit_counts: dict[tuple[str, str, str], int] = {}
    scanned_scopes: list[str] = []
    for item in items:
        if isinstance(item, dict):
            scope = str(item.get("scope") or "unknown")
            text = str(item.get("text") or "")
        else:
            scope = str(item[0])
            text = str(item[1] or "")
        scanned_scopes.append(scope)
        if not text:
            continue
        for fragment in fragments:
            value = fragment.get("value") or ""
            if value and value in text:
                key = (scope, fragment.get("split") or "unknown", fragment.get("category") or "unknown")
                hit_counts[key] = hit_counts.get(key, 0) + 1
    hits = [
        {"scope": scope, "split": split, "category": category, "count": count}
        for (scope, split, category), count in sorted(hit_counts.items())
    ]
    hit_count = sum(hit_counts.values())
    return {
        "success": hit_count == 0,
        "hit_count": hit_count,
        "scanned_scope_count": len(scanned_scopes),
        "scanned_scopes": scanned_scopes,
        "hits": hits,
        "redacted_hits": ["protected answer text redacted"] if hit_count else [],
    }


def scan_paths_for_protected_answers(paths: list[Path], fragments: list[dict] | None = None) -> dict:
    items = []
    for path in paths:
        if path.exists():
            items.append({"scope": path.name, "text": path.read_text(encoding="utf-8")})
    return scan_texts_for_protected_answers(items, fragments)


SCAN_SUFFIXES = {".json", ".md", ".log", ".txt", ".stderr", ".stdout"}


def scan_directory_for_protected_answers(root: Path, fragments: list[dict] | None = None) -> dict:
    items = []
    if not root.exists():
        return scan_texts_for_protected_answers(items, fragments)
    for path in sorted(root.rglob("*")):
        if not path.is_file() or path.suffix not in SCAN_SUFFIXES:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            continue
        items.append({"scope": str(path.relative_to(root)), "text": text})
    return scan_texts_for_protected_answers(items, fragments)


def merge_redaction_scans(scans: list[dict]) -> dict:
    hits = []
    scanned_scopes = []
    for scan in scans:
        hits.extend(scan.get("hits", []))
        scanned_scopes.extend(scan.get("scanned_scopes", []))
    hit_count = sum(hit.get("count", 0) for hit in hits)
    return {
        "success": hit_count == 0,
        "hit_count": hit_count,
        "scanned_scope_count": len(scanned_scopes),
        "scanned_scopes": scanned_scopes,
        "hits": hits,
        "redacted_hits": ["protected answer text redacted"] if hit_count else [],
    }


def check_no_hardcoded_answers() -> tuple[bool, dict]:
    code = module_source()
    scan = scan_texts_for_protected_answers([{"scope": "recipe_extraction_lab_modules", "text": code}])
    return (scan["success"], {
        "success": scan["success"],
        "hit_count": scan["hit_count"],
        "hits": scan["hits"],
        "redacted_hits": scan["redacted_hits"],
        "limitations": "substring-based naive copy tripwire; not a strict blind or paraphrase detector",
    })


def semantic_thresholds(cfg: LoopConfig) -> dict:
    calibration = read_json(Path(cfg.semantic_calibration_path), {})
    thresholds = calibration.get("thresholds", {}) if isinstance(calibration, dict) else {}
    return {
        "minCaseScore": float(thresholds.get("minCaseScore", cfg.ai_case_min)),
        "averageScore": float(thresholds.get("averageScore", cfg.ai_avg_min)),
    }


def holdout_marker_path() -> Path:
    return DATA_ROOT / "holdout_consumed.json"


def display_path(path: Path) -> str:
    try:
        return str(path.relative_to(PROJECT_ROOT))
    except ValueError:
        return str(path)


def holdout_consumption_status() -> dict:
    marker = holdout_marker_path()
    if not marker.exists():
        return {"consumed": False, "marker_path": display_path(marker)}
    payload = read_json(marker, {})
    return {
        "consumed": True,
        "marker_path": display_path(marker),
        "out_tag": payload.get("out_tag"),
        "consumed_at": payload.get("consumed_at"),
        "success": payload.get("success"),
    }


def assert_holdout_not_consumed() -> None:
    status = holdout_consumption_status()
    if status.get("consumed"):
        raise RuntimeError(f"holdout already consumed: {status.get('marker_path')}")


def write_holdout_consumed_marker(out_tag: str, result: dict, dry_run: bool = False) -> dict:
    marker = holdout_marker_path()
    payload = {
        "schemaVersion": 1,
        "consumed_at": kst_now().isoformat(),
        "out_tag": out_tag,
        "dry_run": dry_run,
        "success": result.get("success") is True,
        "result": result,
    }
    if not dry_run:
        marker.parent.mkdir(parents=True, exist_ok=True)
        marker.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return payload


# ---- 스테이지 ------------------------------------------------------------

def build_plan_prompt(cfg: LoopConfig, baseline_summary: str, weak_cases: str, feedback: str, first: bool) -> str:
    header = (
        "너는 유튜브 레시피 추출 강화 루프의 계획 담당자다.\n"
        "구현 대상은 lib/server/recipe-extraction-lab/ (extract.mjs, prompt.mjs) 뿐이다.\n"
        "이 모듈은 영상 소스(설명란/자막/댓글) + Gemini 영상 분석으로 {재료, 만들기}를 추출한다.\n"
    )
    if first:
        body = (
            f"현재 기준선 점수:\n{baseline_summary}\n\n"
            f"train 약점 케이스(상세):\n{weak_cases}\n\n"
            "가장 점수를 끌어올릴 수 있는 1~2가지 개선에 집중한 짧은 계획을 작성하라.\n"
        )
    else:
        body = (
            f"직전 반복 피드백:\n{feedback}\n\n"
            "이번 반복에서 바꿀 점만 짧게 작성하라(전체 재설계 금지).\n"
        )
    return header + "\n" + body + (
        "\n출력은 마크다운 세 문단: 1) 이번에 바꿀 점 2) 유지할 점 3) 구현자 주의사항.\n"
        "validation/holdout 정답은 알 수 없다고 가정하라.\n"
    )


def build_implement_prompt(plan_text: str, feedback: str) -> str:
    return (
        "너는 구현 담당 Codex다. lib/server/recipe-extraction-lab/ 아래 extract.mjs, prompt.mjs만 수정하라.\n"
        "다른 파일은 만들거나 수정하지 마라. 외부 패키지 추가 금지.\n"
        "모듈은 extractRecipeFromSources(input, deps)를 export하며 반환 형식을 유지해야 한다.\n\n"
        f"계획:\n{plan_text}\n\n"
        f"직전 피드백:\n{feedback or '없음'}\n\n"
        "구현 지침:\n"
        "- validation/holdout 테스트 문장을 알 수 없다고 가정하라. 특정 영상 정답을 코드에 하드코딩하지 마라.\n"
        "- 범용 추출 품질(다중 레시피 누락 방지, 분량 추정, 재료 투입 순서)을 높이는 방향으로 프롬프트/후처리를 개선하라.\n"
    )


def build_diagnosis_prompt(det_summary: str, ai_summary: str, val_summary: str, train_cases: str) -> str:
    return (
        "너는 실패 원인 분석 담당 Claude다. 아래 정보만 보고 다음 수정 방향을 제시하라.\n"
        "validation 케이스의 입력·정답·출력은 제공되지 않으며(집계만), 추측하지 마라.\n\n"
        f"train 결정적 채점:\n{det_summary}\n\n"
        f"train AI 의미 채점:\n{ai_summary}\n\n"
        f"validation 집계(참고):\n{val_summary}\n\n"
        f"train 케이스별 약점:\n{train_cases}\n\n"
        "출력은 마크다운: 1) 실패 원인 가설 2) 다음 반복 수정 방향 3) 구현자에게 줄 짧은 피드백.\n"
    )


def grade_summaries(cfg: LoopConfig, out_tag: str) -> dict:
    """결정적/AI 집계 + train 약점 케이스 텍스트를 모은다."""
    det = read_json(DATA_ROOT / cfg.train_split / f"_grade_summary.{out_tag}.json")
    ai = read_json(DATA_ROOT / cfg.train_split / f"_semantic_summary.{out_tag}.json")
    val_det = read_json(DATA_ROOT / cfg.val_split / f"_grade_summary.{out_tag}.json")
    val_ai = read_json(DATA_ROOT / cfg.val_split / f"_semantic_summary.{out_tag}.json")
    return {"det": det, "ai": ai, "val": val_det, "val_det": val_det, "val_ai": val_ai}


def split_expected_count(split: str) -> int:
    manifest = read_json(DATA_ROOT / "manifest.json", {})
    if isinstance(manifest.get(split), list):
        return len(manifest[split])
    split_dir = DATA_ROOT / split
    return len([p for p in split_dir.iterdir() if p.is_dir()]) if split_dir.exists() else 0


def deterministic_validation_success(cfg: LoopConfig, aggregate: dict) -> tuple[bool, dict]:
    checks = {
        "summary_success": aggregate.get("success") is True,
        "ingredientF1": (aggregate.get("ingredientF1") or 0) >= cfg.det_f1_min,
        "amountMatchRate": (aggregate.get("amountMatchRate") or 0) >= cfg.det_amount_min,
        "stepCoverage": (aggregate.get("stepCoverage") or 0) >= cfg.det_step_min,
        "recipeCountMatchRate": (aggregate.get("recipeCountMatchRate") or 0) >= cfg.det_recipe_count_min,
        "missing_result_count": (aggregate.get("missing_result_count") or 0) == 0,
        "missing_golden_count": (aggregate.get("missing_golden_count") or 0) == 0,
        "unapproved_golden_count": (aggregate.get("unapproved_golden_count") or 0) == 0,
        "expected_count_mismatch": aggregate.get("expected_count_mismatch") is False,
    }
    return all(checks.values()), checks


def semantic_validation_success(cfg: LoopConfig, aggregate: dict) -> tuple[bool, dict]:
    thresholds = aggregate.get("thresholds") if isinstance(aggregate.get("thresholds"), dict) else semantic_thresholds(cfg)
    average_score = aggregate.get("averageScore") or 0
    min_case_score = aggregate.get("minCaseScore") or 0
    threshold_success = aggregate.get("threshold_success")
    if threshold_success is None:
        threshold_success = (
            average_score >= (thresholds.get("averageScore") or cfg.ai_avg_min)
            and min_case_score >= (thresholds.get("minCaseScore") or cfg.ai_case_min)
        )
    checks = {
        "summary_success": aggregate.get("success") is True,
        "provider_error_count": (aggregate.get("provider_error_count") or 0) == 0,
        "parse_error_count": (aggregate.get("parse_error_count") or 0) == 0,
        "empty_case_count": (aggregate.get("empty_case_count") or 0) == 0,
        "expected_count_mismatch": aggregate.get("expected_count_mismatch") is False,
        "threshold_success": threshold_success is True,
        "averageScore": average_score >= (thresholds.get("averageScore") or cfg.ai_avg_min),
        "minCaseScore": min_case_score >= (thresholds.get("minCaseScore") or cfg.ai_case_min),
    }
    return all(checks.values()), checks


def decide(cfg: LoopConfig, summaries: dict, gate_inputs: dict) -> dict:
    train_det = summaries["det"].get("aggregate", {})
    train_ai = summaries["ai"].get("aggregate", {})
    val_det = summaries["val_det"].get("aggregate", {})
    val_ai = summaries["val_ai"].get("aggregate", {})
    det_success, det_checks = deterministic_validation_success(cfg, val_det)
    sem_success, sem_checks = semantic_validation_success(cfg, val_ai)
    subprocess_health = gate_inputs.get("subprocess_health", {})
    leakage_guard = gate_inputs.get("leakage_guard", {})
    checks = {
        "deterministic_validation": det_success,
        "semantic_validation": sem_success,
        "subprocess_health": subprocess_health.get("success") is True,
        "leakage_guard": leakage_guard.get("success") is True,
    }
    legacy_train_checks = {
        "ingredientF1": (train_det.get("ingredientF1") or 0) >= cfg.det_f1_min,
        "amountMatchRate": (train_det.get("amountMatchRate") or 0) >= cfg.det_amount_min,
        "stepCoverage": (train_det.get("stepCoverage") or 0) >= cfg.det_step_min,
        "recipeCountMatchRate": (train_det.get("recipeCountMatchRate") or 0) >= cfg.det_recipe_count_min,
        "ai_min_case": (train_ai.get("minCaseScore") or 0) >= cfg.ai_case_min,
        "ai_average": (train_ai.get("averageScore") or 0) >= cfg.ai_avg_min,
    }
    return {
        "run_mode": "offline_snapshot_eval",
        "gate_mode": "local_hardening",
        "strict_blind_available": False,
        "strict_blind_unavailable_reason": "same OS user and same checkout can read repo-local golden files",
        "passed": all(checks.values()),
        "checks": checks,
        "gate_details": {
            "deterministic_validation": det_checks,
            "semantic_validation": sem_checks,
            "subprocess_health": subprocess_health,
            "leakage_guard": leakage_guard,
        },
        "train_diagnostic_checks": legacy_train_checks,
        "det_aggregate": train_det,
        "ai_aggregate": train_ai,
        "val_aggregate": val_det,
        "val_semantic_aggregate": val_ai,
    }


# ---- 케이스 요약 (진단/계획용 텍스트) -----------------------------------

def weak_train_cases_text(cfg: LoopConfig, out_tag: str, limit: int = 4) -> str:
    summary = read_json(DATA_ROOT / cfg.train_split / f"_grade_summary.{out_tag}.json")
    rows = summary.get("perVideo", [])
    rows = sorted(rows, key=lambda r: (r.get("ingredientF1") or 0) + (r.get("stepCoverage") or 0))[:limit]
    lines = []
    for r in rows:
        vid = r.get("videoId")
        golden = read_json(DATA_ROOT / cfg.train_split / vid / "golden.json")
        title = " / ".join(rec.get("title", "") for rec in golden.get("recipes", []))
        lines.append(
            f"- {vid} ({title}): 재료F1 {r.get('ingredientF1')}, 분량 {r.get('amountMatchRate')}, "
            f"단계 {r.get('stepCoverage')}, 레시피 {r.get('recipesMatched')}/{r.get('recipeCountGolden')}"
            + ("" if r.get("recipeCountMatch") else f" (예측 {r.get('recipeCountPredicted')})")
        )
    return "\n".join(lines)


def fmt_det(agg: dict) -> str:
    return (f"재료F1 {agg.get('ingredientF1')}, 분량 {agg.get('amountMatchRate')}, "
            f"단계 {agg.get('stepCoverage')}, 레시피개수일치 {agg.get('recipeCountMatchRate')} "
            f"(누락 {agg.get('recipesMissedTotal')}/초과 {agg.get('recipesExtraTotal')})")


def fmt_ai(agg: dict) -> str:
    return f"평균 {agg.get('averageScore')}, 최저 case {agg.get('minCaseScore')}"


# ---- 한 ITER ------------------------------------------------------------

def run_iteration(cfg: LoopConfig, run_dir: Path, iteration: int, feedback: str,
                  do_plan: bool = True, do_implement: bool = True) -> dict:
    iter_dir = run_dir / f"iteration-{iteration:02d}"
    iter_dir.mkdir(parents=True, exist_ok=True)
    out_tag = f"iter{iteration:02d}"

    # baseline 집계를 계획 입력으로
    base = grade_summaries(cfg, "baseline")
    baseline_summary = "train: " + fmt_det(base["det"].get("aggregate", {}))

    if do_plan:
        stage(f"[ITER {iteration}] 1. 계획 (Claude)")
        prompt = build_plan_prompt(cfg, baseline_summary,
                                   weak_train_cases_text(cfg, "baseline"),
                                   feedback, first=(iteration == 1))
        try:
            plan_text = run_agent(cfg.claude_cmd, prompt, iter_dir / "01_plan.md")
        except RuntimeError as error:
            result = {"iteration": iteration, "passed": False, "iteration_status": "agent_failed", "stage": "plan", "error": str(error)}
            write_text(iter_dir / "05_decision.json", json.dumps(result, ensure_ascii=False, indent=2))
            return result
    else:
        plan_text = "(계획 생략 - 스모크 모드)"

    if do_implement:
        stage(f"[ITER {iteration}] 2. 구현 (Codex, recipe-extraction-lab만)")
        prompt = build_implement_prompt(plan_text, feedback)
        try:
            run_agent(cfg.codex_cmd + ("--cd", str(MODULE_DIR)),
                      prompt, iter_dir / "02_implementation.log", cwd=MODULE_DIR)
        except RuntimeError as error:
            result = {"iteration": iteration, "passed": False, "iteration_status": "agent_failed", "stage": "implement", "error": str(error)}
            write_text(iter_dir / "05_decision.json", json.dumps(result, ensure_ascii=False, indent=2))
            return result

    stage(f"[ITER {iteration}] 3. 확정 검증 (추출 실행 + 하드코딩/스키마 점검)")
    no_hardcode, hardcode_report = check_no_hardcoded_answers()
    ext_train = run_node("run-extraction.mjs", "--split", cfg.train_split, "--out-tag", out_tag, "--model", cfg.model)
    ext_val = run_node("run-extraction.mjs", "--split", cfg.val_split, "--out-tag", out_tag, "--model", cfg.model)
    print(ext_train.stdout[-800:])
    verify_payload = {
        "no_hardcoded_answers": no_hardcode, "hardcode_scan": hardcode_report,
        "train_extraction_rc": ext_train.returncode, "val_extraction_rc": ext_val.returncode,
    }
    verify_text = json.dumps(verify_payload, ensure_ascii=False, indent=2)
    verify_scan_before_write = scan_texts_for_protected_answers([{"scope": "03_verify_payload", "text": verify_text}])
    write_text(iter_dir / "03_verify.json", verify_text)
    verify_scan_after_write = scan_paths_for_protected_answers([iter_dir / "03_verify.json"])

    stage(f"[ITER {iteration}] 4. 채점 (결정적 + AI 의미)")
    train_expected = str(split_expected_count(cfg.train_split))
    val_expected = str(split_expected_count(cfg.val_split))
    train_det_grade = run_node("grade-extraction.mjs", "--split", cfg.train_split, "--out-tag", out_tag, "--expected-count", train_expected)
    val_det_grade = run_node("grade-extraction.mjs", "--split", cfg.val_split, "--out-tag", out_tag, "--expected-count", val_expected)
    train_sem_grade = run_node("grade-semantic.mjs", *semantic_grader_args(cfg, cfg.train_split, out_tag, train_expected))
    val_sem_grade = run_node("grade-semantic.mjs", *semantic_grader_args(cfg, cfg.val_split, out_tag, val_expected))

    stage(f"[ITER {iteration}] 5. 판정 (코드)")
    summaries = grade_summaries(cfg, out_tag)
    subprocess_health = {
        "success": ext_val.returncode == 0 and val_det_grade.returncode == 0 and val_sem_grade.returncode == 0,
        "validation_extraction_rc": ext_val.returncode,
        "validation_deterministic_grader_rc": val_det_grade.returncode,
        "validation_semantic_grader_rc": val_sem_grade.returncode,
        "train_extraction_rc": ext_train.returncode,
        "train_deterministic_grader_rc": train_det_grade.returncode,
        "train_semantic_grader_rc": train_sem_grade.returncode,
        "train_failures_are_diagnostic_only": True,
    }
    output_scan_before_decision = merge_redaction_scans([
        verify_scan_before_write,
        verify_scan_after_write,
        scan_directory_for_protected_answers(iter_dir),
        scan_texts_for_protected_answers([
            {"scope": "train_extraction_stdout", "text": ext_train.stdout},
            {"scope": "train_extraction_stderr", "text": ext_train.stderr},
            {"scope": "validation_extraction_stdout", "text": ext_val.stdout},
            {"scope": "validation_extraction_stderr", "text": ext_val.stderr},
            {"scope": "train_deterministic_stdout", "text": train_det_grade.stdout},
            {"scope": "train_deterministic_stderr", "text": train_det_grade.stderr},
            {"scope": "validation_deterministic_stdout", "text": val_det_grade.stdout},
            {"scope": "validation_deterministic_stderr", "text": val_det_grade.stderr},
            {"scope": "train_semantic_stdout", "text": train_sem_grade.stdout},
            {"scope": "train_semantic_stderr", "text": train_sem_grade.stderr},
            {"scope": "validation_semantic_stdout", "text": val_sem_grade.stdout},
            {"scope": "validation_semantic_stderr", "text": val_sem_grade.stderr},
        ]),
    ])
    leakage_guard = {
        "success": no_hardcode and output_scan_before_decision["success"],
        "module_hardcode_scan": hardcode_report,
        "output_redaction_scan": output_scan_before_decision,
    }
    decision = decide(cfg, summaries, {"subprocess_health": subprocess_health, "leakage_guard": leakage_guard})
    decision_text = json.dumps(decision, ensure_ascii=False, indent=2)
    decision_scan = scan_texts_for_protected_answers([{"scope": "05_decision_payload", "text": decision_text}])
    if not decision_scan["success"]:
        output_scan = merge_redaction_scans([output_scan_before_decision, decision_scan])
        leakage_guard = {
            "success": no_hardcode and output_scan["success"],
            "module_hardcode_scan": hardcode_report,
            "output_redaction_scan": output_scan,
        }
        decision = decide(cfg, summaries, {"subprocess_health": subprocess_health, "leakage_guard": leakage_guard})
        decision_text = json.dumps(decision, ensure_ascii=False, indent=2)
    else:
        output_scan = merge_redaction_scans([output_scan_before_decision, decision_scan])
        leakage_guard = {
            "success": no_hardcode and output_scan["success"],
            "module_hardcode_scan": hardcode_report,
            "output_redaction_scan": output_scan,
        }
        decision = decide(cfg, summaries, {"subprocess_health": subprocess_health, "leakage_guard": leakage_guard})
        decision_text = json.dumps(decision, ensure_ascii=False, indent=2)
    write_text(iter_dir / "05_decision.json", decision_text)
    print(json.dumps(decision["checks"], ensure_ascii=False, indent=2))

    if decision["passed"]:
        return {"iteration": iteration, "passed": True, "decision": decision, "out_tag": out_tag}

    stage(f"[ITER {iteration}] 6. 진단 (Claude, train 상세 + validation 집계만)")
    diag_prompt = build_diagnosis_prompt(
        fmt_det(summaries["det"].get("aggregate", {})),
        fmt_ai(summaries["ai"].get("aggregate", {})),
        fmt_det(summaries["val"].get("aggregate", {})),
        weak_train_cases_text(cfg, out_tag),
    )
    diag_prompt_scan = scan_texts_for_protected_answers([{"scope": "06_diagnosis_prompt", "text": diag_prompt}])
    if not diag_prompt_scan["success"]:
        result = {
            "iteration": iteration,
            "passed": False,
            "iteration_status": "aborted",
            "stage": "diagnosis_leakage_guard",
            "decision": decision,
            "leakage_scan": diag_prompt_scan,
            "out_tag": out_tag,
        }
        write_text(iter_dir / "06_diagnosis_failed.json", json.dumps(result, ensure_ascii=False, indent=2))
        return result
    try:
        diagnosis = run_agent(cfg.claude_cmd, diag_prompt, iter_dir / "06_diagnosis.md")
    except RuntimeError as error:
        result = {
            "iteration": iteration,
            "passed": False,
            "iteration_status": "agent_failed",
            "stage": "diagnosis",
            "decision": decision,
            "error": str(error),
            "out_tag": out_tag,
        }
        write_text(iter_dir / "06_diagnosis_failed.json", json.dumps(result, ensure_ascii=False, indent=2))
        return result
    next_feedback = (
        f"## 직전 판정\n{json.dumps(decision['checks'], ensure_ascii=False)}\n\n"
        f"## train 집계\n{fmt_det(summaries['det'].get('aggregate', {}))} | AI {fmt_ai(summaries['ai'].get('aggregate', {}))}\n\n"
        f"## Claude 진단\n{diagnosis}"
    )
    diagnosis_scan = merge_redaction_scans([
        scan_directory_for_protected_answers(iter_dir),
        scan_texts_for_protected_answers([{"scope": "feedback_for_next_iter", "text": next_feedback}]),
    ])
    if not diagnosis_scan["success"]:
        result = {
            "iteration": iteration,
            "passed": False,
            "iteration_status": "aborted",
            "stage": "diagnosis_leakage_guard",
            "decision": decision,
            "leakage_scan": diagnosis_scan,
            "out_tag": out_tag,
        }
        write_text(iter_dir / "06_diagnosis_failed.json", json.dumps(result, ensure_ascii=False, indent=2))
        return result
    write_text(iter_dir / "feedback_for_next_iter.md", next_feedback)
    return {"iteration": iteration, "passed": False, "decision": decision, "feedback": next_feedback, "out_tag": out_tag}


def run_loop(cfg: LoopConfig | None = None) -> dict:
    cfg = cfg or LoopConfig()
    RUN_ROOT.mkdir(parents=True, exist_ok=True)
    run_dir = RUN_ROOT / kst_now().strftime("%Y%m%d-%H%M%S")
    run_dir.mkdir(parents=True, exist_ok=False)
    print(f"실행 폴더: {run_dir}")

    feedback = ""
    for iteration in range(1, cfg.max_iter + 1):
        result = run_iteration(cfg, run_dir, iteration, feedback)
        if result["passed"]:
            stage(f"통과 (ITER {iteration}). 루프 종료.")
            return {"run_dir": str(run_dir), "status": "passed", "iterations": iteration}
        if "feedback" not in result:
            return {"run_dir": str(run_dir), "status": result.get("iteration_status", "failed"), "iterations": iteration}
        feedback = result["feedback"]

    stage(f"{cfg.max_iter}회 내 미통과. 루프 종료.")
    return {"run_dir": str(run_dir), "status": "max-iter", "iterations": cfg.max_iter}


def cli_arg_value(name: str, default: str | None = None) -> str | None:
    flag = f"--{name}"
    if flag not in sys.argv:
        return default
    idx = sys.argv.index(flag)
    if idx + 1 >= len(sys.argv) or sys.argv[idx + 1].startswith("--"):
        return default
    return sys.argv[idx + 1]


def run_holdout_final(cfg: LoopConfig | None = None, out_tag: str | None = None, dry_run: bool = False) -> dict:
    cfg = cfg or LoopConfig(max_iter=1)
    out_tag = out_tag or ("holdout-final-" + kst_now().strftime("%Y%m%d-%H%M%S"))
    if not dry_run:
        assert_holdout_not_consumed()
    expected = str(split_expected_count("holdout"))
    if dry_run:
        result = {
            "success": True,
            "dry_run": True,
            "out_tag": out_tag,
            "expected_count": expected,
            "holdout_status_before": holdout_consumption_status(),
        }
        return write_holdout_consumed_marker(out_tag, result, dry_run=True)

    ext = run_node("run-extraction.mjs", "--split", "holdout", "--out-tag", out_tag, "--model", cfg.model)
    det = run_node("grade-extraction.mjs", "--split", "holdout", "--out-tag", out_tag, "--expected-count", expected)
    sem = run_node("grade-semantic.mjs", *semantic_grader_args(cfg, "holdout", out_tag, expected))
    summaries = {
        "deterministic": read_json(DATA_ROOT / "holdout" / f"_grade_summary.{out_tag}.json", {}),
        "semantic": read_json(DATA_ROOT / "holdout" / f"_semantic_summary.{out_tag}.json", {}),
    }
    redaction_scan = merge_redaction_scans([
        scan_texts_for_protected_answers([
            {"scope": "holdout_extraction_stdout", "text": ext.stdout},
            {"scope": "holdout_extraction_stderr", "text": ext.stderr},
            {"scope": "holdout_deterministic_stdout", "text": det.stdout},
            {"scope": "holdout_deterministic_stderr", "text": det.stderr},
            {"scope": "holdout_semantic_stdout", "text": sem.stdout},
            {"scope": "holdout_semantic_stderr", "text": sem.stderr},
        ]),
    ])
    result = {
        "success": ext.returncode == 0 and det.returncode == 0 and sem.returncode == 0 and redaction_scan["success"],
        "dry_run": False,
        "out_tag": out_tag,
        "expected_count": expected,
        "returncodes": {
            "extraction": ext.returncode,
            "deterministic": det.returncode,
            "semantic": sem.returncode,
        },
        "summaries": {
            "deterministic_aggregate": summaries["deterministic"].get("aggregate", {}),
            "semantic_aggregate": summaries["semantic"].get("aggregate", {}),
        },
        "redaction_scan": redaction_scan,
    }
    marker = write_holdout_consumed_marker(out_tag, result, dry_run=False)
    if not result["success"]:
        raise RuntimeError(json.dumps(marker, ensure_ascii=False, indent=2))
    return marker


if __name__ == "__main__":
    if "--smoke-wiring" in sys.argv:
        # 쿼터/구현 없이 decision 배선만 점검한다. 실제 subprocess smoke는
        # --smoke-validation-graders를 사용한다.
        cfg = LoopConfig(max_iter=1)
        run_dir = RUN_ROOT / ("smoke-" + kst_now().strftime("%Y%m%d-%H%M%S"))
        run_dir.mkdir(parents=True, exist_ok=True)
        no_hardcode, hardcode_report = check_no_hardcoded_answers()
        output_redaction_scan = scan_texts_for_protected_answers([])
        print(f"하드코딩 점검: {'OK' if no_hardcode else 'FAIL ' + str(hardcode_report)}")
        summaries = grade_summaries(cfg, "baseline")
        decision = decide(cfg, summaries, {
            "subprocess_health": {"success": True, "decision_unit_smoke_only": True},
            "leakage_guard": {
                "success": no_hardcode and output_redaction_scan["success"],
                "module_hardcode_scan": hardcode_report,
                "output_redaction_scan": output_redaction_scan,
            },
        })
        print("판정 checks:", json.dumps(decision["checks"], ensure_ascii=False))
        print("약점 케이스:\n" + weak_train_cases_text(cfg, "baseline"))
    elif "--smoke-validation-graders" in sys.argv:
        cfg = LoopConfig(max_iter=1)
        val_expected = str(split_expected_count(cfg.val_split))
        val_det_grade = run_node("grade-extraction.mjs", "--split", cfg.val_split, "--out-tag", "baseline", "--expected-count", val_expected)
        val_sem_grade = run_node("grade-semantic.mjs", *semantic_grader_args(cfg, cfg.val_split, "baseline", val_expected))
        result = {
            "validation_deterministic_grader_rc": val_det_grade.returncode,
            "validation_semantic_grader_rc": val_sem_grade.returncode,
        }
        print(json.dumps(result, ensure_ascii=False, indent=2))
        sys.exit(0 if val_det_grade.returncode == 0 and val_sem_grade.returncode == 0 else 1)
    elif "--holdout-status" in sys.argv:
        print(json.dumps(holdout_consumption_status(), ensure_ascii=False, indent=2))
    elif "--run-holdout-final" in sys.argv:
        try:
            marker = run_holdout_final(out_tag=cli_arg_value("out-tag"), dry_run="--dry-run" in sys.argv)
            print(json.dumps(marker, ensure_ascii=False, indent=2))
        except RuntimeError as error:
            print(str(error), file=sys.stderr)
            sys.exit(1)
    elif "--one-iter" in sys.argv:
        # 실제 1 ITER 스모크: 계획→구현(Codex)→검증(추출)→채점→판정→진단.
        cfg = LoopConfig(max_iter=1)
        RUN_ROOT.mkdir(parents=True, exist_ok=True)
        run_dir = RUN_ROOT / ("oneiter-" + kst_now().strftime("%Y%m%d-%H%M%S"))
        run_dir.mkdir(parents=True, exist_ok=True)
        result = run_iteration(cfg, run_dir, 1, feedback="")
        print("\n=== 1 ITER 결과 ===")
        print("passed:", result["passed"])
        print(json.dumps(result["decision"]["checks"], ensure_ascii=False, indent=2))
        print("run_dir:", run_dir)
    else:
        print(json.dumps(run_loop(), ensure_ascii=False, indent=2))
