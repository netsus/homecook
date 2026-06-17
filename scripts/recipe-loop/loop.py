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
import hashlib
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
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

IMPLEMENTATION_WORKSPACE_ALLOWLIST = [
    Path("package.json"),
    Path("lib/server/recipe-extraction-lab/README.md"),
    Path("lib/server/recipe-extraction-lab/extract.mjs"),
    Path("lib/server/recipe-extraction-lab/prompt.mjs"),
]
IMPLEMENTATION_WRITEBACK_ALLOWLIST = [
    Path("lib/server/recipe-extraction-lab/extract.mjs"),
    Path("lib/server/recipe-extraction-lab/prompt.mjs"),
]
IMPLEMENTATION_WORKSPACE_FORBIDDEN_PATHS = [
    Path(".git"),
    Path("notebooks/recipe_loop_data/train"),
    Path("notebooks/recipe_loop_data/validation"),
    Path("notebooks/recipe_loop_data/holdout"),
    Path("notebooks/recipe_loop_data/cache"),
]
IMPLEMENTATION_FORBIDDEN_ACCESS_PATHS = [
    PROJECT_ROOT / ".git",
    DATA_ROOT / "validation",
    DATA_ROOT / "holdout",
    DATA_ROOT / "cache",
    DATA_ROOT / "REVIEW_validation.md",
    DATA_ROOT / "REVIEW_holdout.md",
    DATA_ROOT / "semantic_calibration.json",
    RUN_ROOT,
]
DISCORD_COMPLETION_SCRIPT = Path.home() / ".codex" / "skills" / "discord-completion-notifications" / "scripts" / "send-discord-completion.sh"
KNOWN_EXTERNAL_PROTECTED_ACCESS_PROCESSES = {
    "Spotlight",
    "Finder",
    "mds",
    "fseventsd",
    "corespotlightd",
    "QuickLookSatellite",
}
LOW_UNIQUENESS_FRAGMENT_CATEGORIES = {"recipe_title", "ingredient_name", "ingredient_alias"}
EXACT_PUBLIC_FRAGMENT_CATEGORIES = {"ingredient_quantity", "step_instruction"}
# 짧고 흔한 조리 어휘는 단독 등장만으로 정답 누수의 강한 증거가 아니다.
# canary, 분량 결합, 단계 문장, 긴 고유 재료명은 계속 hard gate로 둔다.
LOW_UNIQUENESS_MAX_COMPACT = 3
COMMON_VOCAB_MIN_CASES = 2
COMMON_COOKING_VOCAB = {
    "물", "소금", "설탕", "간장", "식용유", "참기름", "들기름", "고춧가루", "고추장", "된장",
    "맛술", "식초", "후추", "깨", "통깨", "마늘", "대파", "양파", "당근", "감자", "고기",
    "밥", "면", "카레", "수프", "육수", "MSG",
}
ANSWER_LEAK_PREVENTION_INSTRUCTION = (
    "validation/holdout 정답 원문(제목·재료명·분량·단계 문장)을 그대로 옮기지 마라. "
    "실패는 카테고리·지표·인덱스로만 기술하라."
)
TOKEN_BOUNDARY_RE = re.compile(r"[0-9A-Za-z가-힣]")
IMPLEMENTATION_ACCESS_GUARD_COUNTER_KEYS = (
    "codex_subtree_hit_count",
    "ignored_line_count",
    "unknown_git_line_count",
    "unattributable_protected_line_count",
    "external_protected_line_count",
    "ignored_known_external_protected_line_count",
)


# ---- 설정 ---------------------------------------------------------------

@dataclass
class LoopConfig:
    max_iter: int = 3
    train_split: str = "train"
    val_split: str = "validation"
    # 추출 단계에 쓰는 모델. 의미채점 gate는 semantic_judge_* 설정을 사용한다.
    model: str = "gemini-2.5-flash"
    semantic_judge_provider: str = "codex"
    semantic_judge_model: str = "gpt-5.4"
    semantic_judge_effort: str = "high"
    semantic_judge_borderline_effort: str = "xhigh"
    semantic_judge_timeout_ms: int = 200000
    semantic_judge_output_schema: str = str(PROJECT_ROOT / "scripts" / "recipe-loop" / "semantic-judge.schema.json")
    semantic_calibration_path: str = str(DATA_ROOT / "semantic_calibration.json")
    # 계획/진단 담당 Claude 모델 (CLI --model 별칭). 추론 비중이 커서 opus 기본.
    claude_model: str = "opus"
    # 구현 담당 Codex 모델·추론강도 (CLI -c 오버라이드로 명시 고정 → 재현성)
    codex_model: str = "gpt-5.5"
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
        return ("codex", "exec", "--sandbox", "workspace-write", "--skip-git-repo-check",
                "-m", self.codex_model,
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
        "--judge-effort", cfg.semantic_judge_effort,
        "--judge-borderline-effort", cfg.semantic_judge_borderline_effort,
        "--judge-timeout-ms", str(cfg.semantic_judge_timeout_ms),
        "--judge-output-schema", cfg.semantic_judge_output_schema,
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


def display_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(PROJECT_ROOT.resolve()))
    except ValueError:
        return str(path)


def stage(msg: str) -> None:
    print("\n" + "=" * 80)
    print(f"[{kst_stamp()}] {msg}")
    print("=" * 80)


def implementation_forbidden_path_markers() -> list[str]:
    markers: set[str] = set()
    for path in IMPLEMENTATION_FORBIDDEN_ACCESS_PATHS:
        markers.add(str(path.resolve()))
        markers.add(display_path(path))
    return sorted((marker for marker in markers if marker), key=len, reverse=True)


def path_marker_variants(path: Path) -> set[str]:
    resolved = path.resolve()
    markers = {str(resolved), display_path(resolved)}
    return {marker for marker in markers if marker}


def current_run_path_markers(current_run_dirs: list[Path] | None = None) -> list[str]:
    markers: set[str] = set()
    for path in current_run_dirs or []:
        markers.update(path_marker_variants(Path(path)))
    return sorted(markers, key=len, reverse=True)


def is_git_path_marker(marker: str) -> bool:
    return marker == ".git" or marker.endswith("/.git")


def line_contains_path_marker(line: str, marker: str) -> bool:
    if not is_git_path_marker(marker):
        return marker in line
    return re.search(rf"{re.escape(marker)}(?=$|[/\s])", line) is not None


def marker_kind_for_line(line: str, markers: list[str]) -> str:
    git_markers = path_marker_variants(PROJECT_ROOT / ".git")
    if any(line_contains_path_marker(line, marker) for marker in git_markers):
        return "git"
    if any(line_contains_path_marker(line, marker) for marker in markers):
        return "protected"
    return "protected"


def validate_implementation_access_guard_environment() -> dict:
    checks = {
        "repo_git_exists": (PROJECT_ROOT / ".git").exists(),
        "validation_dir_exists": (DATA_ROOT / "validation").is_dir(),
        "holdout_dir_exists": (DATA_ROOT / "holdout").is_dir(),
    }
    return {
        "success": all(checks.values()),
        "repo_root": str(PROJECT_ROOT.resolve()),
        "checks": checks,
        "reason": "ok" if all(checks.values()) else "repo_root_precheck_failed",
    }


def fs_usage_command() -> list[str]:
    command = ["fs_usage", "-w", "-f", "pathname"]
    if os.geteuid() == 0:
        return command
    return ["sudo", "-n", *command]


def redact_forbidden_paths(text: str, markers: list[str] | None = None) -> str:
    redacted = text
    for marker in markers or implementation_forbidden_path_markers():
        if is_git_path_marker(marker):
            redacted = re.sub(rf"{re.escape(marker)}(?=$|[/\s])", "[FORBIDDEN_PATH]", redacted)
        else:
            redacted = redacted.replace(marker, "[FORBIDDEN_PATH]")
    return redacted


def parse_fs_usage_process(line: str) -> dict:
    """Extract the trailing fs_usage process token, usually `ProcessName.12345`."""
    matches = list(re.finditer(r"(?P<process>[A-Za-z0-9_.:+-]+)\.(?P<pid>\d+)(?=\s*$|\s)", line))
    if not matches:
        return {}
    match = matches[-1]
    try:
        pid = int(match.group("pid"))
    except ValueError:
        return {}
    return {"process_name": match.group("process"), "pid": pid}


def process_snapshot() -> dict[int, dict]:
    proc = subprocess.run(["ps", "-axo", "pid=,ppid=,comm="],
                          text=True, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.strip() or "ps snapshot failed")
    snapshot: dict[int, dict] = {}
    for line in proc.stdout.splitlines():
        parts = line.strip().split(None, 2)
        if len(parts) < 2:
            continue
        try:
            pid = int(parts[0])
            ppid = int(parts[1])
        except ValueError:
            continue
        snapshot[pid] = {
            "pid": pid,
            "ppid": ppid,
            "command": parts[2] if len(parts) > 2 else "",
        }
    return snapshot


class ProcessTreeSampler:
    def __init__(self, root_pid: int, interval_seconds: float = 0.2):
        self.root_pid = root_pid
        self.interval_seconds = interval_seconds
        self.pids: set[int] = {root_pid}
        self.processes: dict[int, dict] = {}
        self.snapshot_history: dict[int, dict] = {}
        self.error: str | None = None
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="recipe-loop-pid-sampler", daemon=True)

    def start(self) -> None:
        self._sample_once()
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        self._thread.join(timeout=1)
        self._sample_once()

    def _run(self) -> None:
        while not self._stop.wait(self.interval_seconds):
            self._sample_once()

    def _sample_once(self) -> None:
        try:
            snapshot = process_snapshot()
        except RuntimeError as error:
            self.error = str(error)
            return
        for pid, info in snapshot.items():
            self.snapshot_history[pid] = info
        changed = True
        while changed:
            changed = False
            for pid, info in snapshot.items():
                if pid in self.pids:
                    self.processes[pid] = info
                if info["ppid"] in self.pids and pid not in self.pids:
                    self.pids.add(pid)
                    self.processes[pid] = info
                    changed = True

    def summary(self) -> dict:
        return {
            "root_pid": self.root_pid,
            "success": self.error is None and self.root_pid in self.pids,
            "reason": "ok" if self.error is None and self.root_pid in self.pids else "pid_subtree_reconstruction_failed",
            "error": self.error,
            "pids": sorted(self.pids),
            "processes": [
                self.processes[pid]
                for pid in sorted(self.processes)
                if pid in self.pids
            ],
            "root_process": self.snapshot_history.get(self.root_pid),
            "snapshot_pids": sorted(self.snapshot_history),
            "snapshot_history": [
                self.snapshot_history[pid]
                for pid in sorted(self.snapshot_history)
            ],
        }


def process_name_by_pid(pid_subtree: dict | None) -> dict[int, str]:
    names: dict[int, str] = {}
    if not isinstance(pid_subtree, dict):
        return names
    for process in pid_subtree.get("processes", []) or []:
        try:
            pid = int(process.get("pid"))
        except (TypeError, ValueError):
            continue
        command = str(process.get("command") or "")
        names[pid] = Path(command).name if command else ""
    return names


def scan_fs_usage_log_for_forbidden_access(log_path: Path, markers: list[str] | None = None,
                                           allowed_pids: set[int] | None = None,
                                           pid_subtree: dict | None = None,
                                           current_run_dirs: list[Path] | None = None) -> dict:
    markers = markers or implementation_forbidden_path_markers()
    forbidden_lines = []
    names_by_pid = process_name_by_pid(pid_subtree)
    current_markers = current_run_path_markers(current_run_dirs)
    if not log_path.exists():
        return {
            "success": False,
            "reason": "fs_usage_log_missing",
            "forbidden_line_count": 0,
            "forbidden_lines": [],
            "log_path": display_path(log_path),
        }
    try:
        with log_path.open("r", encoding="utf-8", errors="replace") as log:
            for line_number, line in enumerate(log, start=1):
                if not any(line_contains_path_marker(line, marker) for marker in markers):
                    continue
                process = parse_fs_usage_process(line)
                pid = process.get("pid")
                summary = redact_forbidden_paths(line.strip(), markers)
                for marker in current_markers:
                    summary = summary.replace(marker, "[CURRENT_RUN_PATH]")
                forbidden_lines.append({
                    "line": line_number,
                    "process_pid": pid,
                    "process_name": process.get("process_name") or names_by_pid.get(pid, ""),
                    "marker_kind": marker_kind_for_line(line, markers),
                    "is_current_run_path": any(marker in line for marker in current_markers),
                    "summary_redacted": summary[:500],
                })
    except OSError as error:
        return {
            "success": False,
            "reason": "fs_usage_log_unreadable",
            "error": str(error),
            "forbidden_line_count": 0,
            "forbidden_lines": [],
            "log_path": display_path(log_path),
        }
    return {
        "success": True,
        "reason": "ok",
        "forbidden_line_count": len(forbidden_lines),
        "forbidden_lines": forbidden_lines,
        "log_path": display_path(log_path),
    }


def normalize_process_history(processes) -> dict[int, dict]:
    if not processes:
        return {}
    if isinstance(processes, dict):
        if isinstance(processes.get("snapshot_history"), list):
            return normalize_process_history(processes.get("snapshot_history"))
        if isinstance(processes.get("processes"), list):
            return normalize_process_history(processes.get("processes"))
        iterable = processes.values()
    elif isinstance(processes, list):
        iterable = processes
    else:
        return {}
    history: dict[int, dict] = {}
    for process in iterable:
        if not isinstance(process, dict):
            continue
        try:
            pid = int(process.get("pid"))
        except (TypeError, ValueError):
            continue
        history[pid] = {
            "pid": pid,
            "ppid": process.get("ppid"),
            "command": process.get("command") or process.get("process_name") or "",
        }
    return history


def pid_subtree_pids(pid_subtree: dict | None) -> set[int]:
    if not isinstance(pid_subtree, dict):
        return set()
    pids: set[int] = set()
    for pid in pid_subtree.get("pids", []) or []:
        try:
            pids.add(int(pid))
        except (TypeError, ValueError):
            continue
    if not pids:
        for process in pid_subtree.get("processes", []) or []:
            try:
                pids.add(int(process.get("pid")))
            except (TypeError, ValueError, AttributeError):
                continue
    return pids


def process_basename(name: str | None) -> str:
    if not name:
        return ""
    return Path(str(name)).name


def is_known_external_protected_access_process(name: str | None) -> bool:
    command = str(name or "")
    first_token = command.split()[0] if command.split() else command
    base = process_basename(first_token)
    return (
        base in KNOWN_EXTERNAL_PROTECTED_ACCESS_PROCESSES
        or base in {"grade-extraction.mjs", "grade-semantic.mjs"}
        or base.startswith("mdworker")
        or base.startswith("Spotlight")
        or "scripts/recipe-loop/grade-" in command
        or "scripts/recipe-loop/loop.py" in command
    )


def empty_access_guard_classification() -> dict:
    return {
        "status": "ok",
        "reason": "ok",
        "representative_hit": None,
        "hit_count": 0,
        **{key: 0 for key in IMPLEMENTATION_ACCESS_GUARD_COUNTER_KEYS},
    }


def classify_implementation_access_guard(scan: dict | None, pid_subtree: dict | None,
                                         snapshot_history, audit: dict | None,
                                         stop: dict | None) -> dict:
    result = empty_access_guard_classification()
    if not audit or not audit.get("success"):
        result["status"] = "monitoring_unavailable"
        result["reason"] = (audit or {}).get("reason", "fs_usage_unavailable")
        return result
    if stop and stop.get("success") is False:
        result["status"] = "monitoring_unavailable"
        result["reason"] = stop.get("reason", "fs_usage_exited_during_implementation")
        return result
    if not scan or not scan.get("success"):
        result["status"] = "monitoring_unavailable"
        result["reason"] = (scan or {}).get("reason", "fs_usage_scan_failed")
        return result

    subtree_pids = pid_subtree_pids(pid_subtree)
    history_by_pid = normalize_process_history(snapshot_history)
    warning_seen = False
    monitoring_reason: str | None = None

    for line in scan.get("forbidden_lines", []) or []:
        marker_kind = line.get("marker_kind")
        try:
            pid = int(line.get("process_pid"))
        except (TypeError, ValueError):
            pid = None

        if line.get("is_current_run_path"):
            result["ignored_line_count"] += 1
            continue

        if marker_kind not in {"protected", "git"}:
            monitoring_reason = monitoring_reason or "unclassified_forbidden_access"
            result["representative_hit"] = result["representative_hit"] or line
            continue

        if pid is not None and pid in subtree_pids:
            result["codex_subtree_hit_count"] += 1
            warning_seen = True
            result["representative_hit"] = result["representative_hit"] or line
            continue

        if pid is not None and pid in history_by_pid:
            if marker_kind == "git":
                result["ignored_line_count"] += 1
                continue
            process_name = history_by_pid[pid].get("command") or line.get("process_name")
            if is_known_external_protected_access_process(process_name):
                result["ignored_line_count"] += 1
                result["ignored_known_external_protected_line_count"] += 1
                continue
            result["external_protected_line_count"] += 1
            monitoring_reason = monitoring_reason or "external_protected_access"
            result["representative_hit"] = result["representative_hit"] or line
            continue

        if marker_kind == "protected":
            result["unattributable_protected_line_count"] += 1
            monitoring_reason = monitoring_reason or "unattributable_protected_access"
            result["representative_hit"] = result["representative_hit"] or line
            continue

        result["ignored_line_count"] += 1
        result["unknown_git_line_count"] += 1

    result["hit_count"] = (
        result["codex_subtree_hit_count"]
        + result["external_protected_line_count"]
        + result["unattributable_protected_line_count"]
    )
    if monitoring_reason:
        result["status"] = (
            "degraded_advisory"
            if monitoring_reason in {
                "external_protected_access",
                "unattributable_protected_access",
                "unclassified_forbidden_access",
            }
            else "monitoring_unavailable"
        )
        result["reason"] = monitoring_reason
    elif warning_seen:
        result["status"] = "warning"
        result["reason"] = "forbidden_golden_path_access_suspected"
    return result


def start_fs_usage_audit(log_path: Path) -> dict:
    environment = validate_implementation_access_guard_environment()
    if not environment["success"]:
        return {
            "success": False,
            "started": False,
            "reason": environment["reason"],
            "environment": environment,
            "log_path": display_path(log_path),
        }
    log_path.parent.mkdir(parents=True, exist_ok=True)
    command = fs_usage_command()
    try:
        log_file = log_path.open("w", encoding="utf-8")
    except OSError as error:
        return {
            "success": False,
            "started": False,
            "reason": "fs_usage_log_create_failed",
            "error": str(error),
            "command": command,
            "log_path": display_path(log_path),
        }
    try:
        proc = subprocess.Popen(
            command,
            cwd=str(PROJECT_ROOT),
            stdout=log_file,
            stderr=subprocess.STDOUT,
            text=True,
        )
    except OSError as error:
        log_file.close()
        return {
            "success": False,
            "started": False,
            "reason": "fs_usage_start_failed",
            "error": str(error),
            "command": command,
            "log_path": display_path(log_path),
        }
    time.sleep(0.5)
    if proc.poll() is not None:
        log_file.close()
        error_text = ""
        try:
            error_text = log_path.read_text(encoding="utf-8", errors="replace")[-2000:]
        except OSError:
            pass
        return {
            "success": False,
            "started": False,
            "reason": "fs_usage_exited_before_implementation",
            "returncode": proc.returncode,
            "error": error_text.strip(),
            "command": command,
            "log_path": display_path(log_path),
        }
    return {
        "success": True,
        "started": True,
        "process": proc,
        "log_file": log_file,
        "command": command,
        "log_path": display_path(log_path),
    }


def stop_fs_usage_audit(handle: dict) -> dict:
    proc = handle.get("process")
    log_file = handle.get("log_file")
    success = True
    reason = "ok"
    was_running_at_stop = bool(proc and proc.poll() is None)
    if proc and was_running_at_stop:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=2)
    elif proc:
        success = False
        reason = "fs_usage_exited_during_implementation"
    else:
        success = False
        reason = "fs_usage_process_missing"
    if log_file:
        try:
            log_file.close()
        except OSError as error:
            success = False
            reason = "fs_usage_log_close_failed"
            return {
                "success": success,
                "reason": reason,
                "error": str(error),
                "returncode": proc.returncode if proc else None,
                "was_running_at_stop": was_running_at_stop,
                "log_path": handle.get("log_path"),
            }
    return {
        "success": success,
        "reason": reason,
        "returncode": proc.returncode if proc else None,
        "was_running_at_stop": was_running_at_stop,
        "log_path": handle.get("log_path"),
    }


def implementation_access_guard_payload(status: str, reason: str, log_path: Path, hit_log_path: Path,
                                        **details) -> dict:
    return {
        "stage": "implementation_access_guard",
        "access_guard_status": status,
        "passed": status == "ok",
        "continues_iteration": True,
        "reason": reason,
        "log_path": display_path(log_path),
        "hit_log_path": display_path(hit_log_path),
        **details,
    }


def write_implementation_access_guard_artifacts(payload: dict, guard_path: Path, hit_log_path: Path,
                                                hits: list[dict]) -> None:
    write_text(hit_log_path, json.dumps({
        "schemaVersion": 1,
        "stage": "implementation_access_guard",
        "hit_count": len(hits),
        "hits": hits,
    }, ensure_ascii=False, indent=2))
    write_text(guard_path, json.dumps(payload, ensure_ascii=False, indent=2))


def send_implementation_access_guard_alert(payload: dict) -> dict:
    status = payload.get("access_guard_status")
    if status not in {"warning", "monitoring_unavailable"}:
        return {"sent": False, "reason": "not_required"}
    if not DISCORD_COMPLETION_SCRIPT.exists():
        return {"sent": False, "reason": "discord_sender_missing"}
    representative = payload.get("representative_hit") or {}
    process = representative.get("process_name") or "unknown-process"
    pid = representative.get("process_pid") or "unknown-pid"
    marker = representative.get("marker_kind") or "unknown-marker"
    sample = str(representative.get("summary_redacted") or representative.get("summary") or payload.get("reason") or "")[:180]
    hit_count = payload.get("hit_count", 0)
    if status == "warning":
        headline = "구현 Codex 접근 감시 경고: 금지 경로 접근 의심이 감지되었습니다."
    else:
        headline = "구현 Codex 접근 감시 경고: 접근 감시가 불완전합니다."
    summary = (
        f"{headline} ITER는 계속 진행합니다. "
        f"status={status}; hit_count={hit_count}; process={process}/{pid}; marker={marker}; "
        f"sample={sample}; audit={payload.get('log_path')}; hits={payload.get('hit_log_path')}"
    )
    proc = subprocess.run([str(DISCORD_COMPLETION_SCRIPT), "--summary", summary],
                          cwd=str(PROJECT_ROOT), text=True, capture_output=True)
    return {
        "sent": proc.returncode == 0,
        "returncode": proc.returncode,
        "stdout": proc.stdout.strip()[-500:],
        "stderr": proc.stderr.strip()[-500:],
    }


def run_implementation_agent(cmd: tuple[str, ...], prompt: str, log_path: Path,
                             cwd: Path) -> tuple[str, dict, str | None]:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    chunks: list[str] = []
    sampler: ProcessTreeSampler | None = None
    with log_path.open("w", encoding="utf-8") as log:
        proc = subprocess.Popen(
            [*cmd, prompt],
            cwd=str(cwd),
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            bufsize=1,
            env=os.environ.copy(),
        )
        sampler = ProcessTreeSampler(proc.pid)
        sampler.start()
        try:
            for line in proc.stdout:  # type: ignore[union-attr]
                print(line, end="")
                log.write(line)
                chunks.append(line)
            proc.wait()
        finally:
            sampler.stop()
        agent_error = None
        if proc.returncode != 0:
            agent_error = f"agent command failed rc={proc.returncode}: {' '.join(cmd[:2])}"
    return "".join(chunks), sampler.summary(), agent_error


def run_implementation_agent_with_access_guard(cfg: LoopConfig, prompt: str, iter_dir: Path,
                                               impl_workspace: Path) -> dict:
    log_path = iter_dir / "02_fs_audit.log"
    guard_path = iter_dir / "02_implementation_access_guard.json"
    hit_log_path = iter_dir / "02_fs_audit_hits.json"
    audit = start_fs_usage_audit(log_path)
    output = ""
    pid_subtree: dict | None = None
    fs_usage_stop: dict | None = None
    agent_error: str | None = None
    hits: list[dict] = []
    scan: dict | None = None

    try:
        output, pid_subtree, agent_error = run_implementation_agent(
            cfg.codex_cmd + ("--cd", str(impl_workspace)),
            prompt,
            iter_dir / "02_implementation.log",
            cwd=impl_workspace,
        )
    except OSError as error:
        agent_error = str(error)
    finally:
        if audit.get("success"):
            fs_usage_stop = stop_fs_usage_audit(audit)

    scan = scan_fs_usage_log_for_forbidden_access(
        log_path,
        pid_subtree=pid_subtree,
        current_run_dirs=[iter_dir.parent, iter_dir],
    )
    hits = scan.get("forbidden_lines", [])
    snapshot_history = (pid_subtree or {}).get("snapshot_history", [])
    classification = classify_implementation_access_guard(
        scan,
        pid_subtree,
        snapshot_history,
        audit,
        fs_usage_stop or {"success": True, "reason": "not_started"},
    )
    payload = implementation_access_guard_payload(
        classification["status"],
        classification["reason"],
        log_path,
        hit_log_path,
        hit_count=classification["hit_count"],
        representative_hit=classification["representative_hit"],
        codex_subtree_hit_count=classification["codex_subtree_hit_count"],
        ignored_line_count=classification["ignored_line_count"],
        unknown_git_line_count=classification["unknown_git_line_count"],
        unattributable_protected_line_count=classification["unattributable_protected_line_count"],
        external_protected_line_count=classification["external_protected_line_count"],
        ignored_known_external_protected_line_count=classification["ignored_known_external_protected_line_count"],
        fs_usage={
            "success": audit.get("success"),
            "reason": audit.get("reason"),
            "command": audit.get("command"),
            "stop": fs_usage_stop,
        },
        pid_subtree={
            "root_pid": (pid_subtree or {}).get("root_pid"),
            "root_process": (pid_subtree or {}).get("root_process"),
            "pids": (pid_subtree or {}).get("pids"),
            "processes": (pid_subtree or {}).get("processes"),
            "snapshot_pid_count": len((pid_subtree or {}).get("snapshot_pids", []) or []),
        } if pid_subtree else pid_subtree,
        forbidden_access_scan={
            "success": scan.get("success"),
            "reason": scan.get("reason"),
            "forbidden_line_count": scan.get("forbidden_line_count"),
            "log_path": scan.get("log_path"),
        },
    )

    notification = send_implementation_access_guard_alert(payload)
    if notification.get("sent") or notification.get("reason") != "not_required":
        payload["notification"] = notification
    write_implementation_access_guard_artifacts(payload, guard_path, hit_log_path, hits)
    if agent_error:
        return {"output": output, "access_guard": payload, "agent_error": agent_error}
    return {"output": output, "access_guard": payload}


def create_codex_implementation_workspace() -> Path:
    workspace = Path(tempfile.mkdtemp(prefix="homecook-recipe-impl-"))
    for rel_path in IMPLEMENTATION_WORKSPACE_ALLOWLIST:
        src = PROJECT_ROOT / rel_path
        if not src.exists():
            continue
        dest = workspace / rel_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
    return workspace


def sync_implementation_workspace_back(workspace: Path) -> list[str]:
    written: list[str] = []
    for rel_path in IMPLEMENTATION_WRITEBACK_ALLOWLIST:
        src = workspace / rel_path
        if not src.exists():
            continue
        dest = PROJECT_ROOT / rel_path
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dest)
        written.append(str(rel_path))
    return written


# ---- 격리 점검 ----------------------------------------------------------

PROTECTED_SPLITS = ["validation", "holdout"]


def module_source() -> str:
    return "\n".join(p.read_text(encoding="utf-8") for p in MODULE_DIR.glob("*.mjs"))


def _compact_text(value) -> str:
    return "".join(str(value or "").split())


def _normalized_text(value) -> str:
    return " ".join(str(value or "").split()).strip()


def _common_vocabulary_tokens(splits: list[str], min_cases: int = COMMON_VOCAB_MIN_CASES) -> set[str]:
    """LOW_UNIQUENESS 카테고리(제목/재료명/별칭)에서 여러 golden 케이스에 걸쳐 등장하는
    흔한 어휘의 compact 토큰 집합. 한 케이스에만 있는 고유 정답은 제외한다."""
    case_counts: dict[str, set[str]] = {}
    for split in splits:
        split_dir = DATA_ROOT / split
        if not split_dir.exists():
            continue
        for golden_path in split_dir.glob("*/golden.json"):
            golden = read_json(golden_path)
            case_id = f"{split}/{golden_path.parent.name}"
            tokens: set[str] = set()
            for recipe in (golden or {}).get("recipes", []):
                for value in (recipe.get("title"),):
                    compact = _compact_text(_normalized_text(value))
                    if compact:
                        tokens.add(compact)
                for ingredient in recipe.get("ingredients", []):
                    if not isinstance(ingredient, dict):
                        continue
                    for value in (ingredient.get("name"), *(ingredient.get("nameAliases") or [])):
                        compact = _compact_text(_normalized_text(value))
                        if compact:
                            tokens.add(compact)
            for token in tokens:
                case_counts.setdefault(token, set()).add(case_id)
    return {token for token, cases in case_counts.items() if len(cases) >= min_cases}


def _common_cooking_vocab_tokens() -> set[str]:
    return {_compact_text(token) for token in COMMON_COOKING_VOCAB if _compact_text(token)}


def _is_generic_low_uniqueness(category: str, value, common_tokens: set[str]) -> bool:
    """LOW_UNIQUENESS 카테고리에서 hard gate보다 advisory가 맞는 일반 조리 어휘인지."""
    if category not in LOW_UNIQUENESS_FRAGMENT_CATEGORIES:
        return False
    normalized = _normalized_text(value)
    compact = _compact_text(normalized)
    if not compact:
        return False
    if compact in _common_cooking_vocab_tokens():
        return True
    if compact in common_tokens:
        return True
    return " " not in normalized and len(compact) <= LOW_UNIQUENESS_MAX_COMPACT


def _golden_fragment_values(splits: list[str]) -> dict[str, set[str]]:
    values: dict[str, set[str]] = {}

    def add(category: str, value, min_compact_len: int) -> None:
        text = _normalized_text(value)
        if len(_compact_text(text)) < min_compact_len:
            return
        values.setdefault(category, set()).add(text)

    for split in splits:
        split_dir = DATA_ROOT / split
        if not split_dir.exists():
            continue
        for golden_path in split_dir.glob("*/golden.json"):
            golden = read_json(golden_path)
            for recipe in golden.get("recipes", []):
                add("recipe_title", recipe.get("title"), 1)
                for ingredient in recipe.get("ingredients", []):
                    if not isinstance(ingredient, dict):
                        continue
                    name = ingredient.get("name")
                    add("ingredient_name", name, 1)
                    for alias in ingredient.get("nameAliases", []) or []:
                        add("ingredient_alias", alias, 1)
                    amount = ingredient.get("amount")
                    unit = ingredient.get("unit")
                    if name and amount:
                        amount_unit = f"{amount}{unit or ''}"
                        for value in (
                            f"{name} {amount_unit}",
                            f"{name}{amount_unit}",
                            f"{name}: {amount} {unit or ''}",
                        ):
                            add("ingredient_quantity", value, 1)
                for step in recipe.get("steps", []):
                    text = step.get("instruction") if isinstance(step, dict) else step
                    add("step_instruction", text, 1)
    return values


def _fragment_overlaps_values(category: str, text: str, values: dict[str, set[str]]) -> bool:
    compact = _compact_text(text)
    if not compact:
        return False
    categories = [category]
    if category in LOW_UNIQUENESS_FRAGMENT_CATEGORIES:
        categories = sorted(LOW_UNIQUENESS_FRAGMENT_CATEGORIES)
    for value in set().union(*(values.get(candidate, set()) for candidate in categories)):
        other = _compact_text(value)
        if not other:
            continue
        if compact == other:
            return True
        if category in LOW_UNIQUENESS_FRAGMENT_CATEGORIES and (compact in other or other in compact):
            return True
    return False


def _add_protected_fragment(fragments: list[dict], seen: set[tuple[str, str, str, str]],
                            split: str, category: str, value, min_compact_len: int,
                            train_public_values: dict[str, set[str]] | None = None,
                            non_holdout_values: dict[str, set[str]] | None = None) -> None:
    text = _normalized_text(value)
    if len(_compact_text(text)) < min_compact_len:
        return
    public_overlap = (
        split in PROTECTED_SPLITS
        and category in (LOW_UNIQUENESS_FRAGMENT_CATEGORIES | EXACT_PUBLIC_FRAGMENT_CATEGORIES)
        and _fragment_overlaps_values(category, text, train_public_values or {})
    )
    if split == "validation" and category in LOW_UNIQUENESS_FRAGMENT_CATEGORIES and public_overlap:
        return
    key = (split, category, text, _compact_text(text))
    if key in seen:
        return
    seen.add(key)
    fragments.append({
        "split": split,
        "category": category,
        "value": text,
        "public_overlap": public_overlap,
        "holdout_only": (
            split == "holdout"
            and not _fragment_overlaps_values(category, text, non_holdout_values or {})
        ),
    })


def protected_answer_fragments(splits: list[str] | None = None) -> list[dict]:
    """Naive copy 탐지용 validation/holdout 정답 fragment.

    이 검사는 복붙성 하드코딩과 산출물 누출을 잡는 tripwire다. 패러프레이즈나
    정규화 우회까지 막는 strict blind 장치는 아니다.
    """
    fragments: list[dict] = []
    seen: set[tuple[str, str, str, str]] = set()
    train_public_values = _golden_fragment_values(["train"])
    non_holdout_values = _golden_fragment_values(["train", "validation"])
    for split in (splits or PROTECTED_SPLITS):
        split_dir = DATA_ROOT / split
        if not split_dir.exists():
            continue
        for golden_path in split_dir.glob("*/golden.json"):
            golden = read_json(golden_path)
            _add_protected_fragment(
                fragments,
                seen,
                split,
                "canary",
                golden.get("_canary"),
                8,
                train_public_values,
                non_holdout_values,
            )
            for recipe in golden.get("recipes", []):
                _add_protected_fragment(
                    fragments,
                    seen,
                    split,
                    "recipe_title",
                    recipe.get("title"),
                    2,
                    train_public_values,
                    non_holdout_values,
                )
                for ingredient in recipe.get("ingredients", []):
                    if not isinstance(ingredient, dict):
                        continue
                    name = ingredient.get("name")
                    _add_protected_fragment(
                        fragments,
                        seen,
                        split,
                        "ingredient_name",
                        name,
                        2,
                        train_public_values,
                        non_holdout_values,
                    )
                    for alias in ingredient.get("nameAliases", []) or []:
                        _add_protected_fragment(
                            fragments,
                            seen,
                            split,
                            "ingredient_alias",
                            alias,
                            2,
                            train_public_values,
                            non_holdout_values,
                        )
                    amount = ingredient.get("amount")
                    unit = ingredient.get("unit")
                    if name and amount:
                        amount_unit = f"{amount}{unit or ''}"
                        for value in (
                            f"{name} {amount_unit}",
                            f"{name}{amount_unit}",
                            f"{name}: {amount} {unit or ''}",
                        ):
                            _add_protected_fragment(
                                fragments,
                                seen,
                                split,
                                "ingredient_quantity",
                                value,
                                5,
                                train_public_values,
                                non_holdout_values,
                            )
                for step in recipe.get("steps", []):
                    text = step.get("instruction") if isinstance(step, dict) else step
                    _add_protected_fragment(
                        fragments,
                        seen,
                        split,
                        "step_instruction",
                        text,
                        12,
                        train_public_values,
                        non_holdout_values,
                    )
    common_tokens = _common_vocabulary_tokens(["train", "validation", "holdout"])
    for fragment in fragments:
        generic_low_uniqueness = _is_generic_low_uniqueness(
            fragment.get("category") or "",
            fragment.get("value"),
            common_tokens,
        )
        fragment["generic_low_uniqueness"] = generic_low_uniqueness
        fragment["generic_module_vocab"] = generic_low_uniqueness
    return fragments


def forbidden_strings(splits: list[str]) -> list[str]:
    """Backward-compatible raw fragment list for local tripwire callers."""
    return [fragment["value"] for fragment in protected_answer_fragments(splits)]


def protected_fragment_matches(text: str, value: str) -> bool:
    if not text or not value:
        return False
    escaped = re.escape(value)
    escaped = re.sub(r"(?:\\ )+", r"\\s+", escaped)
    prefix = r"(?<![0-9A-Za-z가-힣])" if TOKEN_BOUNDARY_RE.match(value[0]) else ""
    suffix = r"(?![0-9A-Za-z가-힣])" if TOKEN_BOUNDARY_RE.match(value[-1]) else ""
    return re.search(prefix + escaped + suffix, text) is not None


def classify_protected_hit(fragment: dict, gate: bool, artifact_split: str | None) -> str:
    category = fragment.get("category") or "unknown"
    split = fragment.get("split") or "unknown"
    if category == "canary" and gate:
        return "primary_canary"
    if gate:
        if fragment.get("public_overlap"):
            return "advisory"
        if fragment.get("generic_low_uniqueness") or fragment.get("generic_module_vocab"):
            return "advisory"
        return "gate"
    if split == "holdout" and artifact_split != "holdout":
        if category == "canary" or (fragment.get("holdout_only") and category == "step_instruction"):
            return "secondary_hard"
        return "advisory"
    return "informational"


def scan_texts_for_protected_answers(items: list, fragments: list[dict] | None = None) -> dict:
    fragments = fragments if fragments is not None else protected_answer_fragments(PROTECTED_SPLITS)
    hit_counts: dict[tuple[str, str, str, str], int] = {}
    scanned_scopes: list[str] = []
    for item in items:
        if isinstance(item, dict):
            scope = str(item.get("scope") or "unknown")
            text = str(item.get("text") or "")
            gate = item.get("gate") is not False
            artifact_split = item.get("artifact_split")
        else:
            scope = str(item[0])
            text = str(item[1] or "")
            gate = True
            artifact_split = None
        scanned_scopes.append(scope)
        if not text:
            continue
        for fragment in fragments:
            value = fragment.get("value") or ""
            if value and protected_fragment_matches(text, value):
                severity = classify_protected_hit(fragment, gate, str(artifact_split) if artifact_split else None)
                key = (
                    scope,
                    fragment.get("split") or "unknown",
                    fragment.get("category") or "unknown",
                    severity,
                )
                hit_counts[key] = hit_counts.get(key, 0) + 1
    hits = [
        {"scope": scope, "split": split, "category": category, "severity": severity, "count": count}
        for (scope, split, category, severity), count in sorted(hit_counts.items())
    ]
    hit_count = sum(hit_counts.values())
    primary_canary_hit_count = sum(count for (_, _, _, severity), count in hit_counts.items() if severity == "primary_canary")
    gate_hit_count = sum(count for (_, _, _, severity), count in hit_counts.items() if severity == "gate")
    secondary_hard_hit_count = sum(count for (_, _, _, severity), count in hit_counts.items() if severity == "secondary_hard")
    advisory_hit_count = sum(count for (_, _, _, severity), count in hit_counts.items() if severity == "advisory")
    informational_hit_count = sum(count for (_, _, _, severity), count in hit_counts.items() if severity == "informational")
    blocking_hit_count = primary_canary_hit_count + gate_hit_count + secondary_hard_hit_count
    return {
        "success": blocking_hit_count == 0,
        "hit_count": hit_count,
        "blocking_hit_count": blocking_hit_count,
        "primary_canary_hit_count": primary_canary_hit_count,
        "gate_hit_count": gate_hit_count,
        "secondary_hard_hit_count": secondary_hard_hit_count,
        "advisory_hit_count": advisory_hit_count,
        "informational_hit_count": informational_hit_count,
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


def semantic_artifact_paths(split: str, out_tag: str) -> list[Path]:
    split_dir = DATA_ROOT / split
    paths = [split_dir / f"_semantic_summary.{out_tag}.json"]
    if split_dir.exists():
        paths.extend(sorted(split_dir.glob(f"*/runs/{out_tag}/grade_semantic.json")))
    return paths


def scan_semantic_artifacts_for_protected_answers(split: str, out_tag: str,
                                                  fragments: list[dict] | None = None) -> dict:
    items = []
    for path in semantic_artifact_paths(split, out_tag):
        if not path.exists():
            continue
        try:
            scope = str(path.relative_to(DATA_ROOT))
        except ValueError:
            scope = str(path)
        items.append({
            "scope": scope,
            "text": path.read_text(encoding="utf-8"),
            "gate": False,
            "artifact_split": split,
        })
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


def scan_iteration_agent_facing_artifacts(iter_dir: Path, fragments: list[dict] | None = None) -> dict:
    return scan_paths_for_protected_answers([
        iter_dir / "01_plan.md",
        iter_dir / "03_verify.json",
        iter_dir / "06_diagnosis.md",
        iter_dir / "feedback_for_next_iter.md",
    ], fragments)


def merge_redaction_scans(scans: list[dict]) -> dict:
    hits = []
    scanned_scopes = []
    primary_canary_hit_count = 0
    gate_hit_count = 0
    secondary_hard_hit_count = 0
    advisory_hit_count = 0
    informational_hit_count = 0
    blocking_hit_count = 0
    for scan in scans:
        hits.extend(scan.get("hits", []))
        scanned_scopes.extend(scan.get("scanned_scopes", []))
        primary_canary_hit_count += scan.get("primary_canary_hit_count", 0)
        gate_hit_count += scan.get("gate_hit_count", 0)
        secondary_hard_hit_count += scan.get("secondary_hard_hit_count", 0)
        advisory_hit_count += scan.get("advisory_hit_count", 0)
        informational_hit_count += scan.get("informational_hit_count", 0)
        if "blocking_hit_count" in scan:
            blocking_hit_count += scan.get("blocking_hit_count", 0)
        elif scan.get("success") is False:
            blocking_hit_count += scan.get("hit_count", 0)
    hit_count = sum(hit.get("count", 0) for hit in hits)
    if blocking_hit_count == 0:
        blocking_hit_count = primary_canary_hit_count + gate_hit_count + secondary_hard_hit_count
    return {
        "success": blocking_hit_count == 0,
        "hit_count": hit_count,
        "blocking_hit_count": blocking_hit_count,
        "primary_canary_hit_count": primary_canary_hit_count,
        "gate_hit_count": gate_hit_count,
        "secondary_hard_hit_count": secondary_hard_hit_count,
        "advisory_hit_count": advisory_hit_count,
        "informational_hit_count": informational_hit_count,
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


GATE_AXES = ["deterministic_validation", "semantic_validation", "subprocess_health", "leakage_guard"]


def load_validation_decision(decision_path: str | None) -> dict:
    """holdout 소비를 인가하는 validation decision(05_decision.json)을 읽어 통과 여부를 확인한다.

    실제 loop가 만든 run artifact 경로(<RUN_ROOT>/<run>/iteration-*/05_decision.json)인지,
    decision 구조를 갖췄는지, 4축 게이트(GATE_AXES)가 모두 true인지까지 확인한다.
    같은 운영자가 파일을 만들 수 있으므로 위조를 막는 tamper-proof 장치는 아니며,
    stale·cross-run·부분 파일을 실수로 인가해 1회뿐인 holdout을 소비하는 것을 막는 무결성 검사다.
    """
    if not decision_path:
        return {"path": None, "passed": False, "reason": "no validation decision provided"}
    path = Path(decision_path)
    if not path.is_absolute():
        path = PROJECT_ROOT / path
    resolved = path.resolve()
    run_root = RUN_ROOT.resolve()
    is_run_artifact = (
        resolved.name == "05_decision.json"
        and resolved.parent.name.startswith("iteration-")
        and run_root in resolved.parents
    )
    if not is_run_artifact:
        return {"path": display_path(path), "passed": False,
                "reason": "decision path is not a loop run artifact (<run>/iteration-*/05_decision.json)"}
    if not resolved.exists():
        return {"path": display_path(path), "passed": False, "reason": "validation decision not found"}
    decision = read_json(resolved, {})
    if not isinstance(decision, dict):
        return {"path": display_path(path), "passed": False, "reason": "file is not a decision object"}
    checks = decision.get("checks")
    if decision.get("gate_mode") != "local_hardening" or not isinstance(checks, dict):
        return {"path": display_path(path), "passed": False, "reason": "file is not a local-hardening decision"}
    failed_axes = [axis for axis in GATE_AXES if checks.get(axis) is not True]
    if decision.get("passed") is not True or failed_axes:
        return {"path": display_path(path), "passed": False,
                "reason": "validation decision did not pass all gate axes", "failed_axes": failed_axes}
    return {"path": display_path(path), "passed": True, "checked_axes": GATE_AXES}


def git_commit() -> str | None:
    try:
        proc = subprocess.run(["git", "rev-parse", "HEAD"], cwd=str(PROJECT_ROOT), text=True, capture_output=True)
        return proc.stdout.strip() if proc.returncode == 0 else None
    except Exception:
        return None


MODULE_STATE_FILES = [
    Path("lib/server/recipe-extraction-lab/extract.mjs"),
    Path("lib/server/recipe-extraction-lab/prompt.mjs"),
]


def file_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def current_module_state(verified: bool = True, reason: str = "current_worktree_recorded") -> dict:
    files = {}
    for rel_path in MODULE_STATE_FILES:
        path = PROJECT_ROOT / rel_path
        files[str(rel_path)] = {
            "sha256": file_sha256(path),
            "path": str(rel_path),
        }
    return {
        "schemaVersion": 1,
        "recorded_at": kst_now().isoformat(),
        "git_commit": git_commit(),
        "verified": verified,
        "verification_reason": reason,
        "files": files,
    }


def write_current_module_state(iter_dir: Path, verified: bool = True,
                               reason: str = "iteration_completed",
                               overwrite: bool = True) -> dict:
    path = iter_dir / "module_state.json"
    if path.exists() and not overwrite:
        return read_json(path, {})
    state = current_module_state(verified=verified, reason=reason)
    write_text(path, json.dumps(state, ensure_ascii=False, indent=2))
    return state


def verify_resume_module_state(iter_dir: Path, accept_current_module_state: bool = False) -> dict:
    state_path = iter_dir / "module_state.json"
    if not state_path.exists():
        if accept_current_module_state:
            return write_current_module_state(
                iter_dir,
                verified=False,
                reason="legacy_run_current_module_state_explicitly_accepted",
                overwrite=True,
            )
        raise RuntimeError(f"module_state missing for resume: {display_path(state_path)}")

    state = read_json(state_path, {})
    if state.get("verified") is not True and not accept_current_module_state:
        raise RuntimeError(f"module_state is unverified for resume: {display_path(state_path)}")
    current = current_module_state(verified=True, reason="resume_current_worktree")
    mismatches = []
    for rel_path, current_info in current.get("files", {}).items():
        expected = (state.get("files") or {}).get(rel_path, {}).get("sha256")
        if expected != current_info.get("sha256"):
            mismatches.append(rel_path)
    if mismatches and not accept_current_module_state:
        raise RuntimeError(f"module_state mismatch for resume: {', '.join(mismatches)}")
    if accept_current_module_state and (mismatches or state.get("verified") is not True):
        state = write_current_module_state(
            iter_dir,
            verified=False,
            reason="current_module_state_explicitly_accepted_for_resume",
            overwrite=True,
        )
    return state


def write_holdout_consumed_marker(out_tag: str, result: dict, dry_run: bool = False) -> dict:
    marker = holdout_marker_path()
    payload = {
        "schemaVersion": 1,
        "run_id": result.get("run_id", out_tag),
        "out_tag": out_tag,
        "git_commit": git_commit(),
        "started_at": result.get("started_at"),
        "completed_at": result.get("completed_at"),
        "consumed_at": kst_now().isoformat(),
        "dry_run": dry_run,
        "status": result.get("status"),
        "validation_decision_path": result.get("validation_decision_path"),
        "validation_passed": result.get("validation_passed"),
        "holdout_summary_path": result.get("holdout_summary_path"),
        "holdout_semantic_summary_path": result.get("holdout_semantic_summary_path"),
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
        f"{ANSWER_LEAK_PREVENTION_INSTRUCTION}\n"
    )


def build_implement_prompt(plan_text: str, feedback: str) -> str:
    return (
        "You are running in an allowlist implementation workspace.\n"
        "Do not access, request, infer from, or reference validation/holdout golden/evaluation data.\n"
        "Train is public diagnostic data, but raw train files are not present in this workspace.\n"
        "Forbidden paths include notebooks/recipe_loop_data/validation, notebooks/recipe_loop_data/holdout,\n"
        "their absolute path equivalents, caches, prior run artifacts, judge outputs, decision logs that may\n"
        "contain protected answer fragments, and the source repository .git directory.\n"
        "Only modify lib/server/recipe-extraction-lab/extract.mjs and prompt.mjs.\n"
        "If you need information outside the allowlist workspace, stop and explain the missing non-golden contract\n"
        "instead of reading external files.\n\n"
        "너는 구현 담당 Codex다. lib/server/recipe-extraction-lab/ 아래 extract.mjs, prompt.mjs만 수정하라.\n"
        "다른 파일은 만들거나 수정하지 마라. 외부 패키지 추가 금지.\n"
        "모듈은 extractRecipeFromSources(input, deps)를 export하며 반환 형식을 유지해야 한다.\n\n"
        f"계획:\n{plan_text}\n\n"
        f"직전 피드백:\n{feedback or '없음'}\n\n"
        "구현 지침:\n"
        "- train은 학습용 공개 진단 데이터지만, 이 allowlist workspace에는 제공되지 않는다.\n"
        "- validation/holdout 정답, cache, 과거 run 산출물, judge output, decision log는 읽거나 요청하지 마라.\n"
        f"- {ANSWER_LEAK_PREVENTION_INSTRUCTION}\n"
        "- 특정 영상 정답을 코드에 하드코딩하지 마라.\n"
        "- 범용 추출 품질(다중 레시피 누락 방지, 분량 추정, 재료 투입 순서)을 높이는 방향으로 프롬프트/후처리를 개선하라.\n"
    )


def build_diagnosis_prompt(det_summary: str, ai_summary: str, val_summary: str, train_cases: str) -> str:
    return (
        "너는 실패 원인 분석 담당 Claude다. 아래 정보만 보고 다음 수정 방향을 제시하라.\n"
        "validation 케이스의 입력·정답·출력은 제공되지 않으며(집계만), 추측하지 마라.\n\n"
        f"{ANSWER_LEAK_PREVENTION_INSTRUCTION}\n\n"
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


def canary_token_scan_from_summaries(summaries: dict) -> dict:
    """채점기가 기록한 canaryLeak만 소비한다. 토큰 매칭은 JS helper가 단일 소스다."""
    entries = [
        ("train_deterministic", summaries.get("det", {}).get("aggregate", {}).get("canaryLeak")),
        ("train_semantic", summaries.get("ai", {}).get("aggregate", {}).get("canaryLeak")),
        ("validation_deterministic", summaries.get("val_det", {}).get("aggregate", {}).get("canaryLeak")),
        ("validation_semantic", summaries.get("val_ai", {}).get("aggregate", {}).get("canaryLeak")),
    ]
    statuses: list[dict] = []
    hits_by_key: dict[tuple, dict] = {}
    applicable_statuses: list[str] = []
    for source, leak in entries:
        if not isinstance(leak, dict):
            status = "not_covered"
            success = False
            hit_count = 0
            hits = []
            redacted_hits = []
        else:
            status = str(leak.get("status") or "not_covered")
            success = leak.get("success") is True
            hit_count = int(leak.get("hit_count") or 0)
            hits = leak.get("hits") if isinstance(leak.get("hits"), list) else []
            redacted_hits = leak.get("redacted_hits") if isinstance(leak.get("redacted_hits"), list) else []
        statuses.append({
            "source": source,
            "status": status,
            "success": success,
            "hit_count": hit_count,
        })
        if status != "not_applicable":
            applicable_statuses.append(status)
        for hit in hits:
            if not isinstance(hit, dict):
                continue
            key = (
                hit.get("scope"),
                hit.get("split"),
                hit.get("videoId"),
                hit.get("canaryId"),
                hit.get("category"),
            )
            hits_by_key[key] = hit
    hits = list(hits_by_key.values())
    has_leak = any(status == "leak_detected" for status in applicable_statuses) or bool(hits)
    success = bool(applicable_statuses) and all(status == "clean" for status in applicable_statuses)
    if success:
        status = "clean"
    elif has_leak:
        status = "leak_detected"
    elif any(status == "not_covered" for status in applicable_statuses) or not applicable_statuses:
        status = "not_covered"
    else:
        status = "not_applicable"
    return {
        "success": success,
        "status": status,
        "hit_count": len(hits),
        "hits": hits,
        "redacted_hits": ["leak canary token redacted"] if hits else [],
        "sources": statuses,
    }


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
        "judge_provider": aggregate.get("judge_provider") == cfg.semantic_judge_provider,
        "judge_model": aggregate.get("judge_model") == cfg.semantic_judge_model,
        "judge_effort": (
            cfg.semantic_judge_provider != "codex"
            or aggregate.get("judge_effort") == cfg.semantic_judge_effort
        ),
        "calibration_valid": (
            cfg.semantic_judge_provider != "codex"
            or (isinstance(aggregate.get("calibration"), dict)
                and aggregate.get("calibration", {}).get("valid") is True)
        ),
        "provider_error_count": (aggregate.get("provider_error_count") or 0) == 0,
        "parse_error_count": (aggregate.get("parse_error_count") or 0) == 0,
        "schema_error_count": (aggregate.get("schema_error_count") or 0) == 0,
        "timeout_error_count": (aggregate.get("timeout_error_count") or 0) == 0,
        "calibration_error_count": (aggregate.get("calibration_error_count") or 0) == 0,
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
    implementation_access_guard = gate_inputs.get("implementation_access_guard", {
        "access_guard_status": "not_run",
        "continues_iteration": True,
    })
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
        "implementation_access_guard": implementation_access_guard,
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


def fmt_deduction_reasons(agg: dict) -> str:
    reasons = agg.get("deductionReasons") or {}
    parts: list[str] = []
    amount_counts = ((reasons.get("amount") or {}).get("counts") or {})
    amount_parts = [f"{key} {value}" for key, value in sorted(amount_counts.items()) if value]
    if amount_parts:
        parts.append("amountReasons " + ", ".join(amount_parts))
    step_reasons = reasons.get("step") or {}
    step_parts = []
    if step_reasons.get("nearThresholdCount"):
        step_parts.append(f"nearThreshold {step_reasons.get('nearThresholdCount')}")
    best_similarity = step_reasons.get("bestSimilarity") or {}
    if best_similarity.get("avg") is not None:
        step_parts.append(f"bestSimilarityAvg {best_similarity.get('avg')}")
    if step_parts:
        parts.append("stepReasons " + ", ".join(step_parts))
    return "; 사유 " + "; ".join(parts) if parts else ""


def fmt_det(agg: dict) -> str:
    base = (f"재료F1 {agg.get('ingredientF1')}, 분량 {agg.get('amountMatchRate')}, "
            f"단계 {agg.get('stepCoverage')}, 레시피개수일치 {agg.get('recipeCountMatchRate')} "
            f"(누락 {agg.get('recipesMissedTotal')}/초과 {agg.get('recipesExtraTotal')})")
    return base + fmt_deduction_reasons(agg)


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

    implementation_access_guard = {
        "access_guard_status": "not_run",
        "continues_iteration": True,
        "reason": "implementation_skipped",
    }
    if do_implement:
        stage(f"[ITER {iteration}] 2. 구현 (Codex, recipe-extraction-lab만)")
        prompt = build_implement_prompt(plan_text, feedback)
        impl_workspace = create_codex_implementation_workspace()
        try:
            implementation_result = run_implementation_agent_with_access_guard(cfg, prompt, iter_dir, impl_workspace)
            implementation_access_guard = implementation_result["access_guard"]
            if implementation_result.get("agent_error"):
                result = {
                    "iteration": iteration,
                    "passed": False,
                    "iteration_status": "agent_failed",
                    "stage": "implement",
                    "error": implementation_result["agent_error"],
                    "implementation_access_guard": implementation_access_guard,
                }
                write_text(iter_dir / "05_decision.json", json.dumps(result, ensure_ascii=False, indent=2))
                return result
            written = sync_implementation_workspace_back(impl_workspace)
            write_text(iter_dir / "02_implementation_workspace.json", json.dumps({
                "workspace": str(impl_workspace),
                "allowlist": [str(p) for p in IMPLEMENTATION_WORKSPACE_ALLOWLIST],
                "writeback": written,
                "forbidden_paths_present": any(
                    (impl_workspace / forbidden).exists()
                    for forbidden in IMPLEMENTATION_WORKSPACE_FORBIDDEN_PATHS
                ),
            }, ensure_ascii=False, indent=2))
        except RuntimeError as error:
            result = {
                "iteration": iteration,
                "passed": False,
                "iteration_status": "agent_failed",
                "stage": "implement",
                "error": str(error),
                "implementation_access_guard": implementation_access_guard,
            }
            write_text(iter_dir / "05_decision.json", json.dumps(result, ensure_ascii=False, indent=2))
            return result
        finally:
            shutil.rmtree(impl_workspace, ignore_errors=True)

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
        scan_semantic_artifacts_for_protected_answers(cfg.train_split, out_tag),
        scan_semantic_artifacts_for_protected_answers(cfg.val_split, out_tag),
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
    canary_token_scan = canary_token_scan_from_summaries(summaries)
    leakage_guard = {
        "success": no_hardcode and output_scan_before_decision["success"] and canary_token_scan["success"],
        "module_hardcode_scan": hardcode_report,
        "output_redaction_scan": output_scan_before_decision,
        "canary_token_scan": canary_token_scan,
    }
    decision = decide(cfg, summaries, {
        "subprocess_health": subprocess_health,
        "leakage_guard": leakage_guard,
        "implementation_access_guard": implementation_access_guard,
    })
    decision_text = json.dumps(decision, ensure_ascii=False, indent=2)
    decision_scan = scan_texts_for_protected_answers([{"scope": "05_decision_payload", "text": decision_text}])
    if not decision_scan["success"]:
        output_scan = merge_redaction_scans([output_scan_before_decision, decision_scan])
        leakage_guard = {
            "success": no_hardcode and output_scan["success"] and canary_token_scan["success"],
            "module_hardcode_scan": hardcode_report,
            "output_redaction_scan": output_scan,
            "canary_token_scan": canary_token_scan,
        }
        decision = decide(cfg, summaries, {
            "subprocess_health": subprocess_health,
            "leakage_guard": leakage_guard,
            "implementation_access_guard": implementation_access_guard,
        })
        decision_text = json.dumps(decision, ensure_ascii=False, indent=2)
    else:
        output_scan = merge_redaction_scans([output_scan_before_decision, decision_scan])
        leakage_guard = {
            "success": no_hardcode and output_scan["success"] and canary_token_scan["success"],
            "module_hardcode_scan": hardcode_report,
            "output_redaction_scan": output_scan,
            "canary_token_scan": canary_token_scan,
        }
        decision = decide(cfg, summaries, {
            "subprocess_health": subprocess_health,
            "leakage_guard": leakage_guard,
            "implementation_access_guard": implementation_access_guard,
        })
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


def iteration_decision_path(iter_dir: Path) -> Path:
    recovered = iter_dir / "05_decision.recovered.json"
    if recovered.exists():
        return recovered
    return iter_dir / "05_decision.json"


def recompute_iteration_decision(cfg: LoopConfig, iter_dir: Path, out_tag: str) -> dict:
    summaries = grade_summaries(cfg, out_tag)
    no_hardcode, hardcode_report = check_no_hardcoded_answers()
    output_scan = merge_redaction_scans([
        scan_iteration_agent_facing_artifacts(iter_dir),
        scan_semantic_artifacts_for_protected_answers(cfg.train_split, out_tag),
        scan_semantic_artifacts_for_protected_answers(cfg.val_split, out_tag),
    ])
    canary_token_scan = canary_token_scan_from_summaries(summaries)
    leakage_guard = {
        "success": no_hardcode and output_scan["success"] and canary_token_scan["success"],
        "module_hardcode_scan": hardcode_report,
        "output_redaction_scan": output_scan,
        "canary_token_scan": canary_token_scan,
        "recovered": True,
    }
    return decide(cfg, summaries, {
        "subprocess_health": {"success": True, "recovered": True, "reason": "subprocesses_not_rerun"},
        "leakage_guard": leakage_guard,
        "implementation_access_guard": {"access_guard_status": "not_rerun", "continues_iteration": True},
    })


def recover_iteration_feedback(cfg: LoopConfig, run_dir: Path, iteration: int) -> str:
    run_dir = Path(run_dir)
    if not run_dir.is_absolute():
        run_dir = PROJECT_ROOT / run_dir
    iter_dir = run_dir / f"iteration-{iteration:02d}"
    if not iter_dir.exists():
        raise RuntimeError(f"iteration directory not found: {display_path(iter_dir)}")
    out_tag = f"iter{iteration:02d}"
    decision = recompute_iteration_decision(cfg, iter_dir, out_tag)
    write_text(iter_dir / "05_decision.recovered.json", json.dumps(decision, ensure_ascii=False, indent=2))

    summaries = grade_summaries(cfg, out_tag)
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
            "recovered": True,
        }
        write_text(iter_dir / "06_diagnosis_failed.json", json.dumps(result, ensure_ascii=False, indent=2))
        raise RuntimeError("recovered diagnosis prompt failed leakage guard")

    diagnosis = run_agent(cfg.claude_cmd, diag_prompt, iter_dir / "06_diagnosis.md")
    failed_feedback_checks = {
        key: value
        for key, value in decision.get("checks", {}).items()
        if key in {"deterministic_validation", "semantic_validation"} and value is not True
    }
    next_feedback = (
        f"## 직전 판정\n{json.dumps(failed_feedback_checks, ensure_ascii=False)}\n\n"
        f"## train 집계\n{fmt_det(summaries['det'].get('aggregate', {}))} | AI {fmt_ai(summaries['ai'].get('aggregate', {}))}\n\n"
        f"## Claude 진단\n{diagnosis}"
    )
    diagnosis_scan = merge_redaction_scans([
        scan_paths_for_protected_answers([iter_dir / "06_diagnosis.md"]),
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
            "recovered": True,
        }
        write_text(iter_dir / "06_diagnosis_failed.json", json.dumps(result, ensure_ascii=False, indent=2))
        raise RuntimeError("recovered feedback failed leakage guard")
    write_text(iter_dir / "feedback_for_next_iter.md", next_feedback)
    write_current_module_state(
        iter_dir,
        verified=False,
        reason="legacy_recovery_current_module_state_unverified",
        overwrite=False,
    )
    return next_feedback


def run_loop_from(cfg: LoopConfig, run_dir: Path, start_iter: int, feedback: str) -> dict:
    for iteration in range(start_iter, cfg.max_iter + 1):
        result = run_iteration(cfg, run_dir, iteration, feedback)
        write_current_module_state(run_dir / f"iteration-{iteration:02d}", verified=True)
        if result["passed"]:
            stage(f"통과 (ITER {iteration}). 루프 종료.")
            return {"run_dir": str(run_dir), "status": "passed", "iterations": iteration}
        if "feedback" not in result:
            return {"run_dir": str(run_dir), "status": result.get("iteration_status", "failed"), "iterations": iteration}
        feedback = result["feedback"]

    stage(f"{cfg.max_iter}회 내 미통과. 루프 종료.")
    return {"run_dir": str(run_dir), "status": "max-iter", "iterations": cfg.max_iter}


def run_loop(cfg: LoopConfig | None = None) -> dict:
    cfg = cfg or LoopConfig()
    RUN_ROOT.mkdir(parents=True, exist_ok=True)
    run_dir = RUN_ROOT / kst_now().strftime("%Y%m%d-%H%M%S")
    run_dir.mkdir(parents=True, exist_ok=False)
    print(f"실행 폴더: {run_dir}")

    return run_loop_from(cfg, run_dir, 1, "")


def resume_loop(cfg: LoopConfig | None, run_dir: Path, start_iter: int,
                accept_current_module_state: bool = False) -> dict:
    cfg = cfg or LoopConfig()
    if start_iter < 2:
        raise RuntimeError("--resume-from-iter must be 2 or greater")
    run_dir = Path(run_dir)
    if not run_dir.is_absolute():
        run_dir = PROJECT_ROOT / run_dir
    previous_iter = start_iter - 1
    previous_iter_dir = run_dir / f"iteration-{previous_iter:02d}"
    if not previous_iter_dir.exists():
        raise RuntimeError(f"previous iteration directory not found: {display_path(previous_iter_dir)}")

    decision_path = iteration_decision_path(previous_iter_dir)
    if not decision_path.exists():
        raise RuntimeError(f"previous iteration decision not found: {display_path(decision_path)}")
    decision = read_json(decision_path, {})
    if decision.get("passed") is True:
        return {
            "run_dir": str(run_dir),
            "status": "already-passed",
            "iterations": previous_iter,
            "decision_path": display_path(decision_path),
        }

    verify_resume_module_state(previous_iter_dir, accept_current_module_state)
    feedback_path = previous_iter_dir / "feedback_for_next_iter.md"
    if feedback_path.exists():
        feedback = feedback_path.read_text(encoding="utf-8")
    else:
        feedback = recover_iteration_feedback(cfg, run_dir, previous_iter)
    return run_loop_from(cfg, run_dir, start_iter, feedback)


def cli_arg_value_from(argv: list[str], name: str, default: str | None = None) -> str | None:
    flag = f"--{name}"
    if flag not in argv:
        return default
    idx = argv.index(flag)
    if idx + 1 >= len(argv) or argv[idx + 1].startswith("--"):
        return default
    return argv[idx + 1]


def cli_arg_value(name: str, default: str | None = None) -> str | None:
    return cli_arg_value_from(sys.argv, name, default)


def cli_max_iter_from_args(argv: list[str]) -> int | None:
    raw_value = cli_arg_value_from(argv, "max-iter")
    if raw_value is None:
        if "--max-iter" in argv:
            raise ValueError("--max-iter requires an integer >= 1")
        return None
    try:
        max_iter = int(raw_value)
    except ValueError as error:
        raise ValueError("--max-iter must be an integer >= 1") from error
    if max_iter < 1:
        raise ValueError("--max-iter must be >= 1")
    return max_iter


def loop_config_from_cli_args(argv: list[str] | None = None) -> LoopConfig:
    max_iter = cli_max_iter_from_args(argv or sys.argv)
    if max_iter is None:
        return LoopConfig()
    return LoopConfig(max_iter=max_iter)


def validate_resume_max_iter(cfg: LoopConfig, start_iter: int) -> None:
    if cfg.max_iter < start_iter:
        raise ValueError(
            f"--max-iter ({cfg.max_iter}) is smaller than --resume-from-iter ({start_iter}); "
            "no iterations to run"
        )


def run_holdout_final(cfg: LoopConfig | None = None, out_tag: str | None = None, dry_run: bool = False,
                      validation_decision_path: str | None = None) -> dict:
    cfg = cfg or LoopConfig(max_iter=1)
    out_tag = out_tag or ("holdout-final-" + kst_now().strftime("%Y%m%d-%H%M%S"))
    started_at = kst_now().isoformat()
    validation = load_validation_decision(validation_decision_path)
    if not dry_run:
        if not validation["passed"]:
            raise RuntimeError(
                "holdout requires a passing validation decision (decision.passed === true): "
                f"{json.dumps(validation, ensure_ascii=False)}"
            )
        assert_holdout_not_consumed()
    expected = str(split_expected_count("holdout"))
    if dry_run:
        result = {
            "success": validation["passed"] and not holdout_consumption_status().get("consumed"),
            "dry_run": True,
            "run_id": out_tag,
            "status": "preview",
            "started_at": started_at,
            "completed_at": kst_now().isoformat(),
            "out_tag": out_tag,
            "expected_count": expected,
            "validation_decision_path": validation["path"],
            "validation_passed": validation["passed"],
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
        scan_semantic_artifacts_for_protected_answers("holdout", out_tag),
        scan_texts_for_protected_answers([
            {"scope": "holdout_extraction_stdout", "text": ext.stdout},
            {"scope": "holdout_extraction_stderr", "text": ext.stderr},
            {"scope": "holdout_deterministic_stdout", "text": det.stdout},
            {"scope": "holdout_deterministic_stderr", "text": det.stderr},
            {"scope": "holdout_semantic_stdout", "text": sem.stdout},
            {"scope": "holdout_semantic_stderr", "text": sem.stderr},
        ]),
    ])
    success = ext.returncode == 0 and det.returncode == 0 and sem.returncode == 0 and redaction_scan["success"]
    result = {
        "success": success,
        "dry_run": False,
        "run_id": out_tag,
        "status": "passed" if success else "failed",
        "started_at": started_at,
        "completed_at": kst_now().isoformat(),
        "out_tag": out_tag,
        "expected_count": expected,
        "validation_decision_path": validation["path"],
        "validation_passed": validation["passed"],
        "holdout_summary_path": display_path(DATA_ROOT / "holdout" / f"_grade_summary.{out_tag}.json"),
        "holdout_semantic_summary_path": display_path(DATA_ROOT / "holdout" / f"_semantic_summary.{out_tag}.json"),
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
        canary_token_scan = canary_token_scan_from_summaries(summaries)
        decision = decide(cfg, summaries, {
            "subprocess_health": {"success": True, "decision_unit_smoke_only": True},
            "leakage_guard": {
                "success": no_hardcode and output_redaction_scan["success"] and canary_token_scan["success"],
                "module_hardcode_scan": hardcode_report,
                "output_redaction_scan": output_redaction_scan,
                "canary_token_scan": canary_token_scan,
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
            marker = run_holdout_final(
                out_tag=cli_arg_value("out-tag"),
                dry_run="--dry-run" in sys.argv,
                validation_decision_path=cli_arg_value("validation-decision"),
            )
            print(json.dumps(marker, ensure_ascii=False, indent=2))
        except RuntimeError as error:
            print(str(error), file=sys.stderr)
            sys.exit(1)
    elif "--recover-diagnosis" in sys.argv:
        run_dir_arg = cli_arg_value("run-dir")
        iteration_arg = cli_arg_value("iter", "1")
        if not run_dir_arg:
            print("--recover-diagnosis requires --run-dir <path>", file=sys.stderr)
            sys.exit(1)
        try:
            feedback = recover_iteration_feedback(LoopConfig(), Path(run_dir_arg), int(iteration_arg or "1"))
            print(json.dumps({"success": True, "feedback_length": len(feedback)}, ensure_ascii=False, indent=2))
        except RuntimeError as error:
            print(str(error), file=sys.stderr)
            sys.exit(1)
    elif "--resume-from-iter" in sys.argv:
        run_dir_arg = cli_arg_value("run-dir")
        start_iter_arg = cli_arg_value("resume-from-iter")
        if not run_dir_arg or not start_iter_arg:
            print("--resume-from-iter requires --run-dir <path> and an iteration number", file=sys.stderr)
            sys.exit(1)
        try:
            cfg = loop_config_from_cli_args()
            start_iter = int(start_iter_arg)
            validate_resume_max_iter(cfg, start_iter)
            result = resume_loop(
                cfg,
                Path(run_dir_arg),
                start_iter,
                accept_current_module_state="--accept-current-module-state" in sys.argv,
            )
            print(json.dumps(result, ensure_ascii=False, indent=2))
        except (RuntimeError, ValueError) as error:
            print(str(error), file=sys.stderr)
            sys.exit(1)
    elif "--one-iter" in sys.argv:
        # --one-iter is intentionally fixed to one iteration even when --max-iter is also present.
        # 실제 1 ITER 스모크: 계획→구현(Codex)→검증(추출)→채점→판정→진단.
        cfg = LoopConfig(max_iter=1)
        RUN_ROOT.mkdir(parents=True, exist_ok=True)
        run_dir = RUN_ROOT / ("oneiter-" + kst_now().strftime("%Y%m%d-%H%M%S"))
        run_dir.mkdir(parents=True, exist_ok=True)
        result = run_iteration(cfg, run_dir, 1, feedback="")
        write_current_module_state(run_dir / "iteration-01", verified=True)
        print("\n=== 1 ITER 결과 ===")
        print("passed:", result["passed"])
        print(json.dumps(result["decision"]["checks"], ensure_ascii=False, indent=2))
        print("run_dir:", run_dir)
    else:
        try:
            print(json.dumps(run_loop(loop_config_from_cli_args()), ensure_ascii=False, indent=2))
        except ValueError as error:
            print(str(error), file=sys.stderr)
            sys.exit(1)
