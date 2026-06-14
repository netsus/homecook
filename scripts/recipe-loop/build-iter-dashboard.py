"""1 ITER 실행 결과를 사람이 보기 좋은 HTML 대시보드로 정리한다.

각 단계에서 어떤 모델이 어떤 프롬프트로 어떤 역할을 맡았는지,
실제 프롬프트(재구성)와 산출물, 점수 변화를 한 화면에 묶는다.

사용법: python3 scripts/recipe-loop/build-iter-dashboard.py <run_dir> [--out dashboard.html]
"""
from __future__ import annotations

import html
import json
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import loop  # noqa: E402
from loop import (  # noqa: E402
    LoopConfig, build_plan_prompt, build_implement_prompt, build_diagnosis_prompt,
    grade_summaries, weak_train_cases_text, fmt_det, fmt_ai,
)


def esc(text) -> str:
    return html.escape(str(text or ""))


def read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except Exception:
        return ""


def md_to_html(text: str) -> str:
    """아주 단순한 마크다운 → HTML (헤더/리스트/굵게/코드만)."""
    out = []
    for line in text.split("\n"):
        s = esc(line)
        s = s.replace("&gt;", "›")  # blockquote 표식 단순화
        import re
        s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
        s = re.sub(r"`(.+?)`", r"<code>\1</code>", s)
        if line.startswith("### "):
            out.append(f"<h4>{s[4:]}</h4>")
        elif line.startswith("## "):
            out.append(f"<h3>{s[3:]}</h3>")
        elif line.startswith("# "):
            out.append(f"<h2>{s[2:]}</h2>")
        elif line.strip().startswith("- "):
            out.append(f"<li>{s.strip()[2:]}</li>")
        elif line.strip():
            out.append(f"<p>{s}</p>")
    return "\n".join(out)


def diff_summary(bak: Path, cur: Path) -> str:
    try:
        r = subprocess.run(["diff", str(bak), str(cur)], capture_output=True, text=True)
        added = len([l for l in r.stdout.splitlines() if l.startswith(">")])
        removed = len([l for l in r.stdout.splitlines() if l.startswith("<")])
        return f"+{added} / -{removed} 줄"
    except Exception:
        return "diff 불가"


def build(run_dir: Path, out_path: Path) -> Path:
    cfg = LoopConfig()
    it = run_dir / "iteration-01"

    # 실제 사용된 프롬프트 재구성 (iteration 1, first=True)
    base = grade_summaries(cfg, "baseline")
    baseline_summary = "train: " + fmt_det(base["det"].get("aggregate", {}))
    weak = weak_train_cases_text(cfg, "baseline")
    plan_prompt = build_plan_prompt(cfg, baseline_summary, weak, "", first=True)
    plan_out = read(it / "01_plan.md")
    impl_prompt = build_implement_prompt(plan_out, "")

    summaries = grade_summaries(cfg, "iter01")
    diag_prompt = build_diagnosis_prompt(
        fmt_det(summaries["det"].get("aggregate", {})),
        fmt_ai(summaries["ai"].get("aggregate", {})),
        fmt_det(summaries["val"].get("aggregate", {})),
        weak_train_cases_text(cfg, "iter01"),
    )
    diag_out = read(it / "06_diagnosis.md")
    verify = json.loads(read(it / "03_verify.json") or "{}")
    decision = json.loads(read(it / "05_decision.json") or "{}")

    bak = Path("/tmp/recipe-lab-baseline-bak")
    mod = loop.MODULE_DIR
    prompt_diff = diff_summary(bak / "prompt.mjs", mod / "prompt.mjs")
    extract_diff = diff_summary(bak / "extract.mjs", mod / "extract.mjs")

    det_b = base["det"].get("aggregate", {})
    det_i = summaries["det"].get("aggregate", {})
    val_b = base["val"].get("aggregate", {})
    val_i = summaries["val"].get("aggregate", {})
    ai_b = base["ai"].get("aggregate", {})
    ai_i = summaries["ai"].get("aggregate", {})

    def delta_cell(b, i):
        b = b or 0; i = i or 0
        d = i - b
        cls = "up" if d > 0.001 else ("down" if d < -0.001 else "flat")
        sign = "▲" if d > 0.001 else ("▼" if d < -0.001 else "—")
        return f'<td>{b:.3f}</td><td>{i:.3f}</td><td class="{cls}">{sign} {d:+.3f}</td>'

    claude_spec = f"Claude {cfg.claude_model}"
    codex_spec = f"Codex {cfg.codex_model} · effort {cfg.codex_effort}"
    gemini_spec = f"Gemini {cfg.model}"

    # (번호, 이름, 모델주체, 모델·effort, 실행명령, 프롬프트코드위치, 역할, 프롬프트, 산출물, 종류)
    stages = [
        ("1", "계획", "Claude", claude_spec, "claude -p --permission-mode plan --model " + cfg.claude_model,
         "loop.py:146 build_plan_prompt()",
         "기준선 점수와 train 약점 케이스를 보고 이번 ITER에 무엇을 개선할지 1~2개로 좁혀 짧은 계획을 작성. validation/holdout 정답은 모른다고 가정.",
         plan_prompt, plan_out, "md"),
        ("2", "구현", "Codex", codex_spec, f"codex exec --sandbox workspace-write -c model={cfg.codex_model} -c model_reasoning_effort={cfg.codex_effort} --cd {mod.name}/",
         "loop.py:169 build_implement_prompt()",
         f"계획을 받아 추출 모듈(extract.mjs, prompt.mjs)만 실제 수정. 정답 하드코딩 금지. 이번 ITER 변경: prompt.mjs {prompt_diff}, extract.mjs {extract_diff}.",
         impl_prompt, f"(전체 로그 {len(read(it/'02_implementation.log').splitlines())}줄) — 설명란 타임라인 기반 레시피 후보 힌트 추출, 분량/단위 정규화(정성·비율 표현 제거, 한글 수사→숫자), 다중 레시피 결합 제목 분리 로직 추가.", "text"),
        ("3", "확정 검증", "코드 (Node/Python)", "코드 (LLM 없음)", "run-extraction.mjs + 하드코딩 스캔",
         "loop.py:138 check_no_hardcoded_answers()",
         "AI 판단 없이 코드로 확인: 모듈에 validation/holdout 정답 문구가 하드코딩되지 않았는지, train/validation 추출이 정상 실행되는지.",
         "module_source()에서 forbidden golden step 문구 검색 + 추출 러너 종료코드 확인",
         json.dumps(verify, ensure_ascii=False, indent=2), "text"),
        ("4", "채점", "코드 + Gemini", f"코드 + {gemini_spec}", "grade-extraction.mjs (결정적) + grade-semantic.mjs (AI 의미)",
         "추출 프롬프트 prompt.mjs:102 · AI 채점 프롬프트 grade-semantic.mjs:40",
         "결정적 채점: 재료 F1·분량 일치·단계 커버리지·레시피 개수 매칭(코드). AI 의미 채점: Gemini가 정답과 추출을 의미 비교해 0~5점, case_score=min(재료,단계).",
         f"결정적: scripts/recipe-loop/lib/grading.mjs · AI: {gemini_spec}(텍스트, 캐시)",
         "아래 점수 변화 표 참조", "scores"),
        ("5", "판정", "코드 (Python)", "코드 (LLM 없음)", "loop.decide()",
         "loop.py:202 decide()",
         "AI가 합격을 선언하지 않는다. 노트북 Python이 임계값(재료F1≥0.92, 분량≥0.85, 단계≥0.85, 레시피개수≥0.95, AI case≥4.0, AI평균≥4.3)에 대입해 PASS/FAIL 결정.",
         "임계값 대입 (모든 항목 통과 시에만 PASS)",
         json.dumps(decision.get("checks", {}), ensure_ascii=False, indent=2) + f'\n\n→ 최종: {"PASS" if decision.get("passed") else "FAIL"}', "text"),
        ("6", "진단", "Claude", claude_spec, "claude -p --permission-mode plan --model " + cfg.claude_model,
         "loop.py:182 build_diagnosis_prompt()",
         "FAIL 시 실패 원인 분석. train 케이스 상세 + validation 집계만 보고(케이스 내용 비공개) 다음 수정 방향과 구현자 피드백 작성.",
         diag_prompt, diag_out, "md"),
        ("7", "재시도", "코드 (Python)", "코드 (LLM 없음)", "feedback_for_next_iter.md 저장",
         "loop.py:314 (run_iteration 내)",
         "진단 + 집계 점수를 안전 피드백 파일로 만들어 다음 ITER 계획 입력으로 넘긴다. MAX_ITER까지 반복. (이번은 1 ITER 스모크라 여기서 정지.)",
         "다음 ITER의 build_plan_prompt(feedback=...) 입력으로 사용",
         read(it / "feedback_for_next_iter.md")[:600] + " …", "text"),
    ]

    model_color = {"Claude": "#6d5278", "Codex": "#275d8c", "코드 (Node/Python)": "#0f7a55",
                   "코드 + Gemini": "#9a6a00", "코드 (Python)": "#0f7a55"}

    stage_html = []
    for num, name, model, model_spec, cmd, code_ref, role, prompt, output, kind in stages:
        color = model_color.get(model, "#62615d")
        out_block = md_to_html(output) if kind == "md" else (
            score_table(det_b, det_i, val_b, val_i, ai_b, ai_i, delta_cell) if kind == "scores"
            else f"<pre>{esc(output)}</pre>")
        stage_html.append(f"""
        <section class="stage">
          <div class="stage-head">
            <span class="stage-num">STEP {num}</span>
            <h3>{esc(name)}</h3>
            <span class="model-badge" style="background:{color}">{esc(model_spec)}</span>
          </div>
          <div class="cmd"><code>{esc(cmd)}</code></div>
          <p class="role">{esc(role)}</p>
          <p class="coderef">프롬프트 코드: <code>{esc(code_ref)}</code></p>
          <details><summary>이 단계에 들어간 프롬프트 / 입력</summary><pre class="prompt">{esc(prompt)}</pre></details>
          <div class="output"><div class="output-label">산출물</div>{out_block}</div>
        </section>""")

    passed = decision.get("passed")
    doc = f"""<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>레시피 추출 루프 — 1 ITER 검토</title>
<style>
:root {{ --ink:#1a1a1a; --muted:#666; --line:#e0dcd2; --paper:#fbfaf7; --soft:#f3efe6; }}
* {{ box-sizing:border-box; }}
body {{ font-family: ui-sans-serif,-apple-system,"Apple SD Gothic Neo",sans-serif; color:var(--ink); background:var(--paper); margin:0; padding:32px; line-height:1.6; }}
.wrap {{ max-width:980px; margin:0 auto; }}
h1 {{ font-size:30px; margin:0 0 4px; }}
.sub {{ color:var(--muted); margin:0 0 24px; }}
.banner {{ display:flex; gap:10px; flex-wrap:wrap; margin-bottom:24px; }}
.chip {{ border:1px solid var(--line); border-radius:999px; padding:5px 13px; font-size:13px; background:#fff; }}
.chip.fail {{ color:#b33b2e; border-color:#e0b0a8; background:#fdf3f1; }}
.chip.ok {{ color:#0f7a55; border-color:#a8d8c4; background:#f0faf5; }}
.flow {{ display:flex; gap:6px; flex-wrap:wrap; margin-bottom:28px; }}
.flow-item {{ flex:1; min-width:90px; text-align:center; border:1px solid var(--line); border-radius:8px; padding:10px 6px; background:#fff; font-size:12px; }}
.flow-item .n {{ color:var(--muted); font-size:11px; }}
.flow-item .m {{ font-weight:700; margin-top:3px; }}
.stage {{ border:1px solid var(--line); border-radius:12px; padding:20px; margin-bottom:16px; background:#fff; }}
.stage-head {{ display:flex; align-items:center; gap:12px; margin-bottom:8px; }}
.stage-num {{ font-family:ui-monospace,monospace; font-size:12px; color:var(--muted); }}
.stage-head h3 {{ margin:0; font-size:20px; flex:0 0 auto; }}
.model-badge {{ color:#fff; border-radius:6px; padding:3px 10px; font-size:13px; font-weight:600; margin-left:auto; }}
.cmd {{ margin:4px 0; }}
.cmd code, code {{ background:var(--soft); padding:2px 6px; border-radius:4px; font-size:12.5px; font-family:ui-monospace,monospace; }}
.role {{ color:var(--muted); margin:6px 0 4px; font-size:14px; }}
.coderef {{ color:var(--muted); margin:0 0 10px; font-size:12.5px; }}
.models {{ display:flex; gap:10px; flex-wrap:wrap; margin:0 0 20px; }}
.modelcard {{ flex:1; min-width:200px; border:1px solid var(--line); border-radius:10px; padding:12px 14px; background:#fff; }}
.modelcard .label {{ font-size:11px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; }}
.modelcard .val {{ font-size:16px; font-weight:700; margin-top:3px; }}
.modelcard .who {{ font-size:12px; color:var(--muted); margin-top:2px; }}
details {{ margin:8px 0; }}
summary {{ cursor:pointer; color:#275d8c; font-size:13px; }}
pre.prompt {{ background:#f7f4ed; border:1px solid var(--line); border-radius:8px; padding:12px; white-space:pre-wrap; font-size:12px; max-height:320px; overflow:auto; }}
.output {{ margin-top:12px; }}
.output-label {{ font-size:12px; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; margin-bottom:6px; }}
.output pre {{ background:#1e1e1e; color:#e8e8e8; border-radius:8px; padding:12px; white-space:pre-wrap; font-size:12px; max-height:380px; overflow:auto; }}
.output li {{ margin-left:18px; }}
.output h2 {{ font-size:18px; }} .output h3 {{ font-size:16px; }} .output h4 {{ font-size:14px; }}
table {{ width:100%; border-collapse:collapse; font-size:13px; margin-top:6px; }}
th,td {{ border-bottom:1px solid var(--line); padding:7px 9px; text-align:right; }}
th:first-child, td:first-child {{ text-align:left; }}
.up {{ color:#0f7a55; font-weight:700; }} .down {{ color:#b33b2e; font-weight:700; }} .flat {{ color:var(--muted); }}
.note {{ background:var(--soft); border-left:3px solid #9a6a00; padding:12px 16px; border-radius:0 8px 8px 0; margin:8px 0 24px; font-size:14px; }}
</style></head><body><div class="wrap">
<h1>유튜브 레시피 추출 강화 루프 — 1 ITER 검토</h1>
<p class="sub">실행: {esc(run_dir.name)} · 모델 역할 분담과 단계별 프롬프트·산출물·점수 변화</p>
<div class="banner">
  <span class="chip {'ok' if passed else 'fail'}">최종 판정: {'PASS' if passed else 'FAIL'}</span>
  <span class="chip">하드코딩 점검: {'OK' if verify.get('no_hardcoded_answers') else 'FAIL'}</span>
  <span class="chip">train 재료F1 {det_b.get('ingredientF1')}→{det_i.get('ingredientF1')}</span>
  <span class="chip">validation 재료F1 {val_b.get('ingredientF1')}→{val_i.get('ingredientF1')}</span>
  <span class="chip">AI 의미 평균 {ai_b.get('averageScore')}→{ai_i.get('averageScore')}</span>
</div>
<h3>모델 구성 (loop.py LoopConfig에 고정)</h3>
<div class="models">
  <div class="modelcard"><div class="label">계획 · 진단</div><div class="val">{esc(cfg.claude_model)}</div><div class="who">Claude · claude -p --permission-mode plan --model {esc(cfg.claude_model)}</div></div>
  <div class="modelcard"><div class="label">구현</div><div class="val">{esc(cfg.codex_model)} · effort {esc(cfg.codex_effort)}</div><div class="who">Codex · codex exec -c model={esc(cfg.codex_model)} -c model_reasoning_effort={esc(cfg.codex_effort)}</div></div>
  <div class="modelcard"><div class="label">추출 · AI 의미채점</div><div class="val">{esc(cfg.model)}</div><div class="who">Gemini · file_uri 영상분석(추출) / 텍스트(채점)</div></div>
</div>
<div class="note"><strong>모델 주의:</strong> 위 값은 현재 <code>loop.py</code>에 명시 고정된 값입니다. <strong>이 스모크 실행 시점</strong>에는 Claude가 <code>--model</code> 미지정(CLI 기본값)으로 돌았고, 이후 재현성을 위해 <code>{esc(cfg.claude_model)}</code>로 고정했습니다. Codex는 실행 당시에도 <code>~/.codex/config.toml</code>의 {esc(cfg.codex_model)}/{esc(cfg.codex_effort)}를 사용했습니다.</div>
<div class="note"><strong>이번 ITER 한 줄 요약:</strong> validation(일반화 셋)은 전 지표 개선됐지만, train의 다중 레시피 vlog 1건(똘비)이 4/7→0개로 회귀해 train 점수가 하락 → 판정 FAIL. 진단이 이 회귀와 validation 셋의 사각지대를 정확히 짚음. (배선 검증 목적의 1회 스모크 — 변경은 미채택, 본 루프는 별도.)</div>
<h3>한 ITER의 흐름</h3>
<div class="flow">
  {''.join(f'<div class="flow-item"><div class="n">STEP {n}</div><div>{esc(nm)}</div><div class="m">{esc(md.split(" ")[0])}</div></div>' for n,nm,md,*_ in stages)}
</div>
{''.join(stage_html)}
</div></body></html>"""
    out_path.write_text(doc, encoding="utf-8")
    return out_path


def score_table(det_b, det_i, val_b, val_i, ai_b, ai_i, delta_cell) -> str:
    rows = [
        ("train 재료 F1", det_b.get("ingredientF1"), det_i.get("ingredientF1")),
        ("train 분량 일치", det_b.get("amountMatchRate"), det_i.get("amountMatchRate")),
        ("train 단계 커버리지", det_b.get("stepCoverage"), det_i.get("stepCoverage")),
        ("train 레시피개수 일치", det_b.get("recipeCountMatchRate"), det_i.get("recipeCountMatchRate")),
        ("train AI 의미 평균", ai_b.get("averageScore"), ai_i.get("averageScore")),
        ("train AI 의미 최저", ai_b.get("minCaseScore"), ai_i.get("minCaseScore")),
        ("validation 재료 F1", val_b.get("ingredientF1"), val_i.get("ingredientF1")),
        ("validation 분량 일치", val_b.get("amountMatchRate"), val_i.get("amountMatchRate")),
        ("validation 단계 커버리지", val_b.get("stepCoverage"), val_i.get("stepCoverage")),
        ("validation 레시피개수 일치", val_b.get("recipeCountMatchRate"), val_i.get("recipeCountMatchRate")),
    ]
    body = "".join(f"<tr><td>{esc(label)}</td>{delta_cell(b, i)}</tr>" for label, b, i in rows)
    return f"<table><thead><tr><th>지표</th><th>baseline</th><th>iter01</th><th>변화</th></tr></thead><tbody>{body}</tbody></table>"


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    run_dir = Path(args[0]) if args else max((loop.RUN_ROOT.glob("oneiter-*")), key=lambda p: p.stat().st_mtime)
    out = run_dir / "dashboard.html"
    if "--out" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--out") + 1])
    print("작성:", build(run_dir, out))
