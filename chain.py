from __future__ import print_function

import argparse
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path


DEFAULT_PROMPTS_DIR = Path("prompts")
DEFAULT_SIGNALS_DIR = Path(".signals")
DEFAULT_POLL_SECONDS = 2.0


def step_name(prompt_path):
    """
    a-prompt.md -> a
    b-prompt.md -> b
    01-a-prompt.md -> a
    02_b-prompt.md -> b
    """
    name = prompt_path.stem
    name = name.replace("-prompt", "")
    name = re.sub(r"^\d+[-_]", "", name)
    return name.lower()


def load_steps(prompts_dir):
    files = sorted(prompts_dir.glob("*-prompt.md"))
    if not files:
        print("prompts/ 폴더에 *-prompt.md 파일이 없습니다.")
        print("예: prompts/a-prompt.md, prompts/b-prompt.md")
        sys.exit(1)

    steps = [(step_name(path), path) for path in files]
    seen = {}
    duplicates = []
    for step, path in steps:
        if step in seen:
            duplicates.append((step, seen[step], path))
        seen[step] = path

    if duplicates:
        print("완료 신호 이름이 중복됩니다.")
        for step, first_path, second_path in duplicates:
            print(" - {0}: {1}, {2}".format(step, first_path, second_path))
        sys.exit(1)

    return steps


def build_prompt(step, prompt_path, signals_dir):
    prompt = prompt_path.read_text(encoding="utf-8").rstrip()
    done_file = signals_dir / "{0}.done".format(step)

    return """{0}

---
중요:
작업이 정상적으로 종료되면 반드시 아래 파일을 생성해.

{1}

파일 내용은 다음처럼 간단히 작성해.

{2} done
""".format(
        prompt,
        done_file,
        step,
    )


def write_signal(path, content):
    path.write_text(content, encoding="utf-8")


def send_to_codex(step, prompt_path, signals_dir, codex_bin, dry_run):
    done_file = signals_dir / "{0}.done".format(step)
    sent_file = signals_dir / "{0}.sent".format(step)
    log_file = signals_dir / "{0}.log".format(step)

    if done_file.exists():
        print("[done] {0}: 이미 완료됨".format(step))
        return

    if sent_file.exists():
        print("[wait] {0}: 이미 전송됨. {1} 대기 중".format(step, done_file))
        return

    prompt = build_prompt(step, prompt_path, signals_dir)
    print("[send] {0}: {1} 전송".format(step, prompt_path))

    if dry_run:
        write_signal(log_file, "[dry-run] codex 전송을 생략했습니다.\n")
        write_signal(sent_file, "exit_code=0\ndry_run=true\n")
        write_signal(done_file, "{0} done\n".format(step))
        print("[dry-run] {0}: {1} 생성".format(step, done_file))
        return

    result = subprocess.run(
        [codex_bin, "debug", "app-server", "send-message-v2", prompt],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )

    write_signal(log_file, result.stdout)
    write_signal(sent_file, "exit_code={0}\n".format(result.returncode))

    if result.returncode != 0:
        print("[fail] {0}: codex 전송 실패. 로그: {1}".format(step, log_file))
        sys.exit(result.returncode)

    print("[sent] {0}: 전송 완료. {1} 생성을 기다립니다.".format(step, done_file))


def wait_done(step, signals_dir, poll_seconds, timeout_seconds):
    done_file = signals_dir / "{0}.done".format(step)
    started_at = time.time()

    while not done_file.exists():
        if timeout_seconds is not None and time.time() - started_at >= timeout_seconds:
            print("[timeout] {0}: {1} 대기 시간 초과".format(step, done_file))
            sys.exit(1)
        time.sleep(poll_seconds)

    print("[done] {0}: 완료 신호 감지".format(step))


def parse_args():
    parser = argparse.ArgumentParser(
        description="prompts/*-prompt.md 파일을 이름순으로 Codex App Server에 순차 전송합니다."
    )
    parser.add_argument(
        "--prompts-dir",
        default=str(DEFAULT_PROMPTS_DIR),
        help="프롬프트 폴더 경로입니다. 기본값: prompts",
    )
    parser.add_argument(
        "--signals-dir",
        default=str(DEFAULT_SIGNALS_DIR),
        help="완료 신호 폴더 경로입니다. 기본값: .signals",
    )
    parser.add_argument(
        "--poll-seconds",
        type=float,
        default=DEFAULT_POLL_SECONDS,
        help="완료 신호 확인 간격입니다. 기본값: 2",
    )
    parser.add_argument(
        "--timeout-seconds",
        type=float,
        default=None,
        help="각 단계 완료 대기 제한 시간입니다. 기본값: 제한 없음",
    )
    parser.add_argument(
        "--codex-bin",
        default="codex",
        help="실행할 Codex CLI 명령입니다. 기본값: codex",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Codex에 전송하지 않고 sent/done 신호 파일만 만들어 순서를 테스트합니다.",
    )
    parser.add_argument(
        "--reset-signals",
        action="store_true",
        help="시작 전에 signals 폴더를 삭제합니다. 테스트 때만 사용하세요.",
    )
    return parser.parse_args()


def main():
    args = parse_args()
    prompts_dir = Path(args.prompts_dir)
    signals_dir = Path(args.signals_dir)

    prompts_dir.mkdir(exist_ok=True)
    if args.reset_signals and signals_dir.exists():
        shutil.rmtree(signals_dir)
    signals_dir.mkdir(exist_ok=True)

    steps = load_steps(prompts_dir)

    print("실행할 체인:")
    for step, prompt_path in steps:
        print(" - {0}: {1}".format(step, prompt_path))

    print("\n체인 시작\n")

    for step, prompt_path in steps:
        send_to_codex(step, prompt_path, signals_dir, args.codex_bin, args.dry_run)
        wait_done(step, signals_dir, args.poll_seconds, args.timeout_seconds)

    print("\n모든 단계 완료")


if __name__ == "__main__":
    main()
