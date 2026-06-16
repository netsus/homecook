# 누수 가드 오탐 보정 방안 (one-iter 관찰 기반)

작성: 2026-06-15 · 브랜치: `chore/youtube-recipe-loop-one-iter-observe`
근거 실행: `notebooks/recipe_loop_runs/oneiter-20260615-150546/iteration-01/`
역할: **Claude 제안 문서**. 구현(2단계)은 Codex가 TDD로 진행한다. 대상은 추출 품질이 아니라 **루프 하네스(loop.py, grade-semantic.mjs)의 게이트 로직**이다.
검토 반영: 2026-06-17 — FP-1 containment-aware 차감 / holdout-only 정의 엄밀화 / resume 코드상태 검증 / 복구 stale decision 방지 / FP-3 범위 축소.

---

## 0. 한 줄 요약

one-iter는 7단계가 전부 정상 작동했고 **구현자(Codex)의 실제 누수 정황은 없었다**(하드코딩 0, `codex_subtree_hit_count: 0`).
그러나 누수 가드가 **구현자가 아닌 곳**(채점기 자기 출력, 시스템 전체 파일접근, 공용 요리 어휘)에 과민 반응해
`leakage_guard: false` + 진단 단계 abort가 발생했다. 이 문서는 **실제 보호는 유지하면서 오탐만 제거**하는 방안과,
iter1을 폐기하지 않고 **재추출 없이 이어받아 iter2로 진행**하는 방법(§5)을 정의한다 — Gemini 비용은 프롬프트가 바뀐 케이스에만 든다.

---

## 1. 관찰된 오탐 (근거 수치)

| ID | 증상 | 실제 원인 | 영향 |
|---|---|---|---|
| **FP-1** | 6단계 진단이 `diagnosis_leakage_guard`로 abort | train 약점 케이스 제목이 validation/holdout 제목과 **substring 충돌** (예: `제육볶음`은 train·validation 양쪽에 존재) | 🔴 **루프 차단** — 진단이 없으면 다음 ITER 피드백이 안 생김 |
| **FP-2** | `output_redaction_scan` 46건 → `leakage_guard: false` | **채점기(GPT-5.4) 자기 출력 파일**(`grade_semantic.json`, `_semantic_summary.json`)에 정답 제목·재료명이 정상적으로 들어있는데 이를 누수로 카운트 | 🔴 판정 FAIL에 가중 |
| **FP-3** | 접근 감시 `monitoring_unavailable`, 135 unattributable | 시스템 전체 `fs_usage`가 잡은 금지경로 접근이 채점/오케스트레이터 python의 **정상 정답 읽기**인데 codex 서브트리로 귀속 불가 → 보수적으로 "확인 불가" | 🟡 비차단(advisory)이나 Discord 경보·신호 오염 |
| **FP-4** | `subprocess_health: false` | 의미 채점기가 **점수 미달 시 종료코드 1**로 끝나는데(정상 채점 완료에도) 이를 "프로세스 실패"로 읽음 | 🟡 비차단이나 신호 오해 유발 |

근거 수치(iteration-01):
- 구현자: 하드코딩 0, `codex_subtree_hit_count: 0`, `forbidden_paths_present: false` → **깨끗**
- 46 redaction hit: **전부** `*/runs/iter01/grade_semantic.json`·`_semantic_summary.iter01.json` (채점 산출물)
- 의미 채점: train 12 / validation 10 케이스 **전부 정상 채점**, 에러 카운트 0, borderline xhigh 재채점 8/11회 수행
- 점수: train 평균 4.16 / 최저 3.0, validation 평균 3.98 / 최저 2.5 → 게이트 미달은 **1회차로서 정상**

---

## 2. 보정 원칙 (이걸 깨지 말 것)

오탐을 줄이되 아래 **실제 보호막은 그대로 유지**한다.

1. **에이전트-facing 표면**(모듈 소스, plan/implement/diagnosis 프롬프트, 에이전트가 읽는 plan.md·diagnosis.md)에는 validation/holdout 정답이 **절대 들어가면 안 된다** → 강한 스캔 유지.
2. **holdout**은 어떤 비-holdout 산출물에도 새면 안 된다(교차 오염) → 강한 검사 유지.
3. `step_instruction`(길고 거의 고유한 문장)은 **가장 강한 실누수 신호** → 약화 금지.
4. 모듈 하드코딩 스캔(`check_no_hardcoded_answers`)은 그대로.
5. 임계값·추출 로직·calibration은 이 작업에서 **건드리지 않는다**.

핵심 통찰: **train은 공개(public) 데이터다.** 어떤 제목·재료가 train golden에도 존재하면 그것은 "숨긴 정답"이 아니라 **공용 어휘**다. 또한 한 split의 채점 산출물은 그 split 자기 정답만 담으므로 다른 split 비밀을 누설할 수 없다.

---

## 3. 보정안

### 3.0 판정 우선순위 (canary 중심) — 먼저 못박기

구현자가 "validation/holdout fragment 자연어 스캔 = 강한 hard gate"로 오해하지 않도록 우선순위를 고정한다. 자연어 fragment 매칭을 hard gate로 쓰면 FP-1/FP-2 오탐이 반복된다.

| 신호 | 판정 | 근거 |
|---|---|---|
| **canary hit** | **primary hard fail** | 보호 데이터에 심은 합성 sentinel — 자연어 충돌 0, hit이면 raw 보호 콘텐츠 복사 확정 |
| holdout-only **긴 step_instruction** | **secondary hard fail** | 길고 거의 고유 → 의미 전달(field-forward) 누수의 고신뢰 신호 |
| 저고유 fragment(짧은 제목·재료명·alias·짧은 quantity) | **advisory(비차단)** | 공용 어휘 충돌 위험 큼 → 리포트만 |

**canary 메커니즘(신규 sub-task)**: 각 validation/holdout golden 레코드에 고유 sentinel 메타 필드(예: `_canary: "CANARY::<split>::<videoId>::<rand>"`)를 심고, 에이전트-facing 표면(모듈 소스·plan/implement/diagnosis 프롬프트·decision·feedback)에서 canary 문자열을 스캔한다. 합성 문자열이라 **오탐 0**.

**한계(과신 금지)**: canary는 *raw 보호 파일/레코드가 그대로 복사된* 경우만 잡는다. (a) 제목·재료만 추출해 전달하는 field-forward, (b) 정답을 의미적으로 재구성해 모듈에 하드코딩하는 경우는 **canary가 못 잡는다.** 따라서 canary는 기존 레이어를 **대체하지 않고 보강**한다 — 모듈 하드코딩 스캔(§2-4)과 위 secondary/advisory 레이어는 유지. 구현자 자체는 샌드박스로 golden 접근이 차단(`codex_subtree_hit_count`)되므로 실제 주 위험은 오케스트레이터 plumbing 유출이고, canary가 그 벡터를 정확히 덮는다.

> 아래 FP-1(containment)·FP-2(gate scope)는 이 표의 **advisory/secondary 레이어 오탐을 줄이는 보정**이다. primary 게이트는 canary다.

### FP-1 (P1) — 공용 어휘를 보호 fragment에서 제외

**원인 위치**: `protected_answer_fragments` (loop.py:936) 가 validation+holdout golden에서 fragment를 만들고, `scan_texts_for_protected_answers` (loop.py:980) 가 단순 `value in text` substring 매칭. 진단 프롬프트는 `build_diagnosis_prompt`(loop.py:1247)에서 train 약점 케이스 제목(공개)을 정상 포함하는데, 그 제목이 보호 split 제목과 겹쳐 abort(loop.py:1585-1596).

**보정**:
1. **train 공개 어휘 차감 (containment-aware)**: exact set만 빼면 잔여 오탐이 남는다 — 관찰상 validation `고추다대기`는 train `다시마 고추다대기`의 **부분문자열**이라, 진단 텍스트가 train 제목을 담을 때 substring hit가 1건 남는다. 따라서 보호 fragment가 train 공용 어휘와 **동일하거나 부분포함 관계**면 공용으로 보고 제외한다.
   - `train_public_values()` 헬퍼 신설: train golden의 title / ingredient name·alias / step 을 정규화해 수집.
   - `recipe_title` · `ingredient_name` · `ingredient_alias` (저고유 범주): 보호 fragment가 train 공용값과 **동일 OR (어느 한쪽이 다른 쪽의 substring)** 이면 skip.
   - `step_instruction` · `ingredient_quantity`(고유 범주): exact 일치만 제외(긴 문장은 부분포함 우연이 거의 없음).
2. **단어경계 매칭(보강)**: `_add_protected_fragment`·`scan_texts_for_protected_answers`(loop.py:924, 980)의 `value in text`를 한국어/영문 토큰 경계 기준 매칭으로 바꿔 흔한 단어(`마늘`·`대파`)의 우연 매칭을 줄인다.
   - ⚠️ **recipe_title 최소 길이 전역 상향(5→6~7)은 채택하지 않는다**: `잡채`·`두부볶음`처럼 짧지만 고유한 한국어 요리명을 보호에서 빼므로 위험. 공용 여부는 길이가 아니라 **containment**로 판단한다.

**안전성**: train과 동일·부분포함 **모두 아닌**, holdout/validation에만 고유한 제목·분량·단계는 그대로 보호된다.

### FP-2 (P1) — 채점 산출물을 누수 게이트 대상에서 분리

**원인 위치**: 판정 단계 output 스캔 조립부가 `scan_semantic_artifacts_for_protected_answers(train)`·`(validation)` (loop.py:1030, 경로 생성 `semantic_artifact_paths` loop.py:1022) 를 **하드 게이트**(`leakage_guard.success`)에 합산. 이 파일들은 채점기가 정답과 비교해 만든 산출물이라 정답 제목·재료가 들어있는 게 정상이며, **에이전트에게 다시 입력되지 않는다**.

**보정** (구조적 분리):
1. 스캔 항목에 `gate: bool` 태그 도입.
   - `gate: true` (하드 게이트) = 에이전트-facing 표면: 모듈 소스, plan/implement/diagnosis 프롬프트, `01_plan.md`·`06_diagnosis.md`, decision payload.
   - `gate: false` (정보용) = 채점/추출 산출물: `grade_semantic.json`, `_semantic_summary.*.json`, `result.json`, `02_fs_audit*.log`.
2. `leakage_guard.success`는 **`gate: true` 항목의 hit만**으로 판정. `gate: false` hit은 리포트에 `informational_hits`로 남기되 판정에 영향 없음.
3. **holdout 교차검사 — "고유"를 엄밀히 정의**: `gate: false` 산출물에서 holdout 내용이 나오면 위험이지만, "holdout"이 아니라 **holdout-only**(train ∪ validation 공용값을 뺀 뒤에도 holdout에만 남는 값)여야 한다. 관찰상 validation semantic artifact의 holdout `ingredient_alias` 2건은 실제로 **train에도 있는 공용 alias**였다(=오탐).
   - **하드 FAIL**: holdout-only **`step_instruction`(긴 문장)** 만. 길고 거의 고유해 진짜 누수 신호.
   - **advisory(비차단)**: holdout-only라도 `ingredient_name`·`ingredient_alias`·짧은 `quantity` 등 저고유어는 우연일치 위험이 커 리포트만 남긴다.

**안전성**: 채점기 자기 출력의 자기-split 정답은 무시하되, 모듈/프롬프트로의 유입(에이전트-facing)과 holdout-only 긴 문장 유출은 그대로 차단.

### FP-3 (P2) — 접근 감시 귀속 개선 (advisory 노이즈 제거)

**원인 위치**: `classify_implementation_access_guard`(loop.py:521)에서, codex 서브트리 밖이고 known-external 목록(`is_known_external_protected_access_process` loop.py:502)에도 없는 정답 접근을 `unattributable_protected_access` → `monitoring_unavailable`로 분류(loop.py 약 579-583). 실제로는 우리 채점/오케스트레이터 python의 정상 정답 읽기.

**보정** (과설계 회피 — 비차단 advisory 가드이므로 최소 변경):
1. **known-external 분류만 보강**: 채점기(`node scripts/recipe-loop/grade-*.mjs`)·오케스트레이터(`python .../loop.py`)를 `is_known_external_protected_access_process`(loop.py:502)의 정당 reader로 추가 → 이들의 정답 읽기는 `ignored_known_external_protected_line_count`로 분류.
2. **status는 감시 한계가 드러나는 이름 유지**: unattributable을 `ok`처럼 보이게 낮추면 실제 감시 공백을 정상처럼 보이게 한다. `ok_…` 같은 이름 대신 `degraded_advisory`처럼 "감시 제한됨"이 명시되는 이름만 쓴다.
3. **Discord는 severity만 하향**: 비차단 degraded 상태는 알림 severity를 낮추거나 생략.

**비범위(이번엔 제외)**: PID 서브트리 양성 귀속, "정상처럼 보이는" 신규 ok 상태 도입은 과설계라 제외. `codex_subtree_hit_count`는 그대로 핵심 신호로 둔다.
**비고**: 이 가드는 이미 비차단(`continues_iteration: true`)이라 우선순위 P2. 신뢰 신호 정리 목적.

### FP-4 (P2) — 채점기 종료코드를 "실행 성공" 기준으로 분리

**원인 위치**: grade-semantic.mjs:499 `success = failedRowCount===0 && !expectedCountMismatch && thresholdSuccess`, :532 `if (!success) process.exit(1)`. 점수 미달(thresholdSuccess=false)에도 rc=1 → loop.py `subprocess_health`가 "프로세스 실패"로 읽음.

**보정**:
1. grade-semantic.mjs 종료코드는 **실행 성공 여부**만 반영: `providerErrorCount`·`parseErrorCount`·`schemaErrorCount`·`timeoutErrorCount`·`calibrationErrorCount > 0` 또는 `expectedCountMismatch` 또는 `failedRowCount > 0` 일 때만 비정상 종료.
2. **임계값 판정은 Python `decide()`로 일원화**: `semantic_validation`은 이미 summary의 `threshold_success`를 읽으므로, 종료코드에서 thresholdSuccess를 빼도 게이트는 그대로 작동.
3. `subprocess_health`는 "그래더가 정상 실행됐나"만 의미하게 됨(점수 통과는 별도 게이트).

**안전성**: 점수 게이트는 `semantic_validation`가 독립 enforce하므로 통과 기준은 약해지지 않는다.

---

## 4. 우선순위 / 범위

- **C (canary 게이트, P1)**: §3.0 — 보호 golden에 sentinel **메타 필드** 주입 + 에이전트-facing 스캔을 primary hard fail로. (정답·분할은 불변, 메타 필드만 추가)
- **P1 (run_loop 전 필수)**: FP-1, FP-2 — 진단 단계 정상화 + advisory/secondary 레이어 오탐 제거. 이게 없으면 루프가 피드백 없이 공회전.
- **P2 (신호 정리)**: FP-3, FP-4 — 비차단이지만 리포트/경보 신뢰도.
- **비범위**: 임계값, 추출 프롬프트/로직, calibration, 데이터 **분할**(canary는 메타 추가일 뿐 분할·정답 불변).
- **R (이어받기 enabler)**: §5 resume-from-iter — iter1 재추출 없이 이어받기. FP-1/FP-2 적용 후 사용.

---

## 5. iter1 이어받기 (resume-from-iter)

**동기**: iter1의 추출·채점은 전부 디스크에 있고(Gemini 캐시는 `프롬프트+소스` 기준이라 out-tag·실행횟수 무관, loop.py가 쓰는 `lib/llm-client.mjs`), 오탐 보정은 게이트 로직만 바꾼다. 따라서 iter1을 버리고 처음부터 돌릴 이유가 없다. **빠진 것은 진단 피드백 하나뿐**(abort됨)이므로, 그것만 재추출 없이 복구해 iter2로 잇는다.

### 5.1 비용 구분 (무엇이 공짜이고 무엇이 실제 지출인가)

| 작업 | Gemini | gpt-5.4 채점 | Claude | 비고 |
|---|---|---|---|---|
| FP 보정 적용 | $0 | $0 | $0 | 게이트 로직만 |
| iter1 진단 복구(5.2) | $0(캐시) | $0(iter01 캐시) | 1회 | 디스크 summary만 읽음 |
| iter1 판정 재평가(검증용) | $0 | $0 | $0 | 코드 스캔만 |
| **iter2 진행** | **변경된 프롬프트 케이스만** | iter02 out-tag 신규 | 계획+진단 | ← 유일한 실제 지출(=새 프롬프트 시험 비용) |

> 핵심: Gemini 비용은 **프롬프트가 바뀐 케이스 수**에 비례한다. 같은 프롬프트 재실행은 캐시 히트($0). 단, 의미 채점 캐시는 out-tag를 키에 포함하므로(`lib/codex-judge-client.mjs`) 새 out-tag로 돌리면 gpt-5.4를 다시 부른다 → iter1 복구는 반드시 **기존 iter01 out-tag** 위에서 한다.

### 5.2 진단 복구 (재추출 없음)

신규 헬퍼 `recover_iteration_feedback(cfg, run_dir, iteration)`:
1. `grade_summaries(cfg, f"iter{iteration:02d}")` 를 **디스크에서** 읽는다(추출·채점 재실행 금지).
2. **decision 재계산(stale 방지)**: 기존 `05_decision.json`을 그대로 쓰지 않는다 — 그 안의 `leakage_guard:false`·`subprocess_health:false`는 바로 이 문서가 고치는 FP다. 그대로 feedback에 넣으면 옛 오탐이 iter2 계획에 다시 주입된다. 새 게이트 로직으로 decision을 재계산(코드 스캔만, $0)해 `iteration-NN/05_decision.recovered.json`에 저장하고, **feedback에는 deterministic/semantic 점수 미달만** 반영한다(옛 leakage/subprocess false는 제외).
3. `build_diagnosis_prompt(...)`로 진단 프롬프트 구성 → FP-1 적용 스캔 통과 → Claude 진단 1회.
4. `next_feedback` 구성(재계산 decision 기준) → FP-2 적용 피드백 스캔 통과 → `iteration-NN/feedback_for_next_iter.md` 저장.
5. 반환: feedback 문자열. **Gemini/gpt-5.4 호출 0.**

CLI: `python loop.py --recover-diagnosis --run-dir <prior> --iter 1`
→ FP 보정이 제대로 됐는지 **iter2에 돈 쓰기 전에 공짜로** 확인하는 게이트로도 쓴다.

### 5.3 이어받기 실행

신규 진입점 `resume_loop(cfg, run_dir, start_iter)` + CLI `--resume-from-iter N --run-dir <prior>`:
1. `run_dir/iteration-{N-1:02d}` 존재 + 해당 decision 확인. 없으면 명확히 에러.
2. **코드 상태 검증(중요)**: 루프 상태에는 run_dir뿐 아니라 현재 `extract.mjs`/`prompt.mjs` 내용도 포함된다. 워킹트리가 iter{N-1} 종료 시점 코드와 다르면 "이어받기"가 아니다. → 각 iteration 종료 시 두 파일 해시(+가능하면 git commit)를 `iteration-NN/module_state.json`에 기록하고, resume 시작 전 **현재 워킹트리 해시 == 직전 iteration 기록 해시**를 검사. 불일치 시 중단.
   - **legacy run(현재 oneiter 등) 처리**: `module_state.json`이 없는 과거 run은 사후 생성한 해시를 신뢰할 수 없다(현재 워킹트리엔 미커밋 `prompt.mjs` 수정도 있어, 사후 해시는 "현재 상태"를 정당화하는 자기충족이 된다). → **기본은 resume 중단**, `--accept-current-module-state` 명시 시에만 "검증 불가 — 현재 모듈을 기준으로 이어감"을 `module_state.json`에 `verified: false`로 기록하고 진행.
3. 직전 iter의 `feedback_for_next_iter.md` 가 있으면 사용, 없으면(abort 케이스) `recover_iteration_feedback`로 복구.
4. 직전 decision이 `passed: true`면 이미 종료된 것 → 안내 후 종료.
5. **같은 run_dir**에서 iteration N..max_iter 실행(아티팩트 누적, iter01 불변). out-tag는 `iterNN`(신규, 충돌 금지).

리팩토링: `run_loop`의 for-루프 본문(loop.py:1645-1655)을 `run_loop_from(cfg, run_dir, start_iter, feedback)`로 추출해 `run_loop`(start_iter=1, feedback="")과 `resume_loop`가 공유한다.

```bash
# 1) $0 — 피드백 확보 + FP 보정 검증
python scripts/recipe-loop/loop.py --recover-diagnosis \
  --run-dir notebooks/recipe_loop_runs/oneiter-20260615-150546 --iter 1
# 2) iter2부터 이어받기 (실제 지출은 바뀐 프롬프트 추출만)
python scripts/recipe-loop/loop.py --resume-from-iter 2 \
  --run-dir notebooks/recipe_loop_runs/oneiter-20260615-150546
```

### 5.4 가드레일
- 복구 단계는 **절대 run-extraction을 호출하지 않는다**(테스트로 강제).
- **모듈 상태 기록**: 각 iteration 종료 시 `extract.mjs`/`prompt.mjs` 해시(+git commit)를 `iteration-NN/module_state.json`에 저장. resume은 시작 전 현재 해시와 직전 기록을 대조(불일치 시 중단).
- **legacy 안전장치**: module_state 없는 과거 run은 **기본 중단**. `--accept-current-module-state`로만 미검증 진행(audit에 `verified: false` 기록). 사후 해시 자동 신뢰 금지.
- **stale decision 금지**: 복구는 기존 decision의 leakage/subprocess false를 재사용하지 않고 새 게이트로 재계산(§5.2).
- iter1 산출물은 `feedback_for_next_iter.md`·`06_diagnosis.md`·`05_decision.recovered.json`·`module_state.json` 추가 외 불변.
- out-tag 충돌 방지: resume은 N..max_iter에 대해 새 `iterNN`만 쓴다.
- **순서 강제**: FP-1/FP-2 미적용 상태면 복구 진단이 그대로 abort → resume 전에 FP 보정 선행.

---

## 6. 수용 기준 (Codex TDD 대상)

신규/보강 테스트:

1. **FP-1 (containment)**: validation `고추다대기`가 train `다시마 고추다대기`의 **부분문자열**일 때 → containment 규칙으로 보호 fragment에서 제외(진단 텍스트에 train 제목이 있어도 hit 0).
2. **FP-1**: train 약점 케이스 제목만 담은 진단 프롬프트는 abort되지 않는다.
3. **FP-1 (길이 하한 금지)**: `잡채`·`두부볶음`처럼 **짧지만 train에 없는** 고유 제목은 (containment에 안 걸리므로) **여전히 보호**된다 — 전역 min-length 상향으로 빠지지 않는다.
4. **FP-1 (음성 보존)**: holdout **고유** step_instruction이 진단/구현 프롬프트에 들어가면 여전히 차단된다.
5. **FP-2**: validation `grade_semantic.json`(validation 정답 포함)만으로는 `leakage_guard.success == true`.
6. **FP-2 (음성 보존)**: 모듈 소스/프롬프트(에이전트-facing)에 보호 fragment가 들어가면 여전히 FAIL.
7. **FP-2 (holdout-only 정의)**: holdout-only **step_instruction**이 산출물에 있으면 하드 FAIL; train/validation 공용 alias가 holdout에도 있는 경우는 하드 FAIL이 아니라 **advisory**.
8. **FP-3**: 채점기/오케스트레이터의 정답 읽기는 known-external로 분류; 감시 한계는 `ok`가 아니라 **`degraded_advisory`**로 표기되고 Discord severity가 하향된다.
9. **FP-4**: 전 케이스 정상 채점 + 점수 미달 → grade-semantic.mjs 종료코드 0. providerError>0 → 비정상 종료.
10. **resume 복구**: `recover_iteration_feedback`가 디스크 summary만 읽고 **run-extraction을 호출하지 않는다**(추출 subprocess 미호출 검증).
11. **resume 복구 (stale 방지)**: 기존 decision의 leakage/subprocess false를 재사용하지 않고 새 게이트로 재계산하며, feedback에 옛 오탐(leakage/subprocess false)이 들어가지 않는다.
12. **resume 코드상태**: iteration 종료 시 `module_state.json`에 extract/prompt 해시 저장; 현재 워킹트리 해시가 직전 기록과 다르면 resume이 중단된다.
13. **resume 이어받기**: `--resume-from-iter 2`가 iteration-01을 보존하고 iteration-02를 생성하며, 복구된 피드백이 iter2 계획 프롬프트에 주입된다.
14. **resume 가드**: run_dir/직전 iter 누락 시 명확한 에러; 직전 decision이 `passed: true`면 안내 후 종료.
15. **캐시 보장**: 동일 프롬프트 재추출은 Gemini 캐시 히트(신규 호출 0); 복구는 iter01 out-tag 재사용으로 gpt-5.4 재호출 0.
16. **canary primary**: canary 문자열이 모듈/프롬프트에 들어가면 primary hard fail; 자연어 제목·재료만으로는 canary 게이트 미발동(오탐 0).
17. **canary 한계 명시**: canary 없이 holdout-only 긴 step_instruction이 에이전트-facing에 들어가면 secondary hard fail은 그대로 작동한다(레이어 보강 확인).
18. **legacy 기본 중단**: `module_state.json` 없는 run은 `--resume-from-iter` 기본 중단.
19. **legacy 명시 진행**: `--accept-current-module-state` 시 `verified: false`로 기록 후 진행하며, 사후 해시를 검증된 것처럼 다루지 않는다.

회귀 확인:
- one-iter 재실행(또는 고정 fixture)에서 **진단 단계가 완료**되고 `leakage_guard.success == true`이며, 주입한 실제 누수(모듈에 holdout 고유 문장)는 그대로 FAIL되는지 확인.

---

## 7. 후속

- 본 보정(FP-1/FP-2) 적용 → `--recover-diagnosis`로 iter1 피드백 확보 및 FP 검증($0) → `--resume-from-iter 2`로 iter2 진행.
- iter2 비용 절감: 약점 케이스 `--ids` 소수로 프롬프트 먼저 시험 후 validation 전체.
- 관련: `notebooks/recipe_loop_plan.md`(M4/M5), one-iter 산출물 `notebooks/recipe_loop_runs/oneiter-20260615-150546/`.
