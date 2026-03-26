# OMO-Lite Pilot Notes: 03-recipe-like (Phase 8)

## 이 슬라이스의 파일럿 의미

`03-recipe-like`는 Phase 8 — **첫 번째 제품 슬라이스 OMO-lite 감독 파일럿**이다.

이전 Phase들(4~7)은 OMO-lite 인프라(dispatcher, runner, budget-aware 등)를 도입했다.
Phase 8은 그 인프라를 실제 제품 슬라이스에 처음 적용하고, 감독 흐름이 실제로 작동하는지 검증한다.

work-item: `.workflow-v2/work-items/03-recipe-like.json`

---

## 확인 포인트 (구현 전·중·후)

### 1. Stage 1 → Stage 2 handoff artifact 생성

**언제**: Stage 1 이 README merge 후 Codex가 2단계를 시작하기 전.

확인 사항:
- `pnpm omo:run-stage -- --slice 03-recipe-like --stage 2` 실행 시
  `.artifacts/omo-lite-dispatch/<timestamp>-03-recipe-like-stage-2/` 아래에
  `dispatch.json`, `prompt.md`, `run-metadata.json`이 생성되는가?
- `dispatch.json`의 `actor`가 `codex`로 라우팅되는가?
- `required_reads`에 `docs/workpacks/03-recipe-like/README.md`와 `acceptance.md`가 포함되는가?

기대 결과: artifact 생성 성공, 프롬프트에 Backend First Contract 키 항목 포함.

---

### 2. status.json lifecycle 자동 패치

**언제**: Stage 2 착수 시 (Codex 첫 커밋), Stage 2 PR merge 시.

확인 사항:
- Codex가 `--sync-status` 플래그로 실행할 경우
  `.workflow-v2/status.json`의 `03-recipe-like` 항목이
  `planned → docs → in_progress → ready_for_review → merged` 순으로 전이되는가?
- `pnpm omo:sync-status`를 수동 실행해도 같은 패치가 적용되는가?

기대 결과: v1 `docs/workpacks/README.md` Status 표와 v2 `status.json`이 동기된 상태.

---

### 3. Claude budget-aware 라우팅 (Phase 7 연동)

**전제**: Phase 7 PR (#28)이 merge된 후에 유효.

확인 사항:
- `pnpm omo:claude-budget` 해석 결과가 Stage 1/3/5/6 routing에 반영되는가?
- Claude가 `available` 상태일 때 Stage 3/5/6 reviewer로 정상 배정되는가?
- Claude가 `constrained/unavailable` 상태로 강제 설정 후
  Stage 3 호출 시 `approval_state: awaiting_claude_or_human`으로 fallback되는가?

검증 명령:
```bash
pnpm omo:claude-budget -- --set unavailable --reason "test fallback"
pnpm omo:run-stage -- --slice 03-recipe-like --stage 3
# dispatch.json approval_state 확인
pnpm omo:claude-budget -- --clear
```

기대 결과: fallback 상태가 `.workflow-v2/status.json`에 기록됨.

---

### 4. Plan loop 미트리거 검증

**이 슬라이스는 low-risk**다: 계약이 명확하고, 스키마 변경 없고, 선행 슬라이스 의존성 clean.

확인 사항:
- supervisor가 Stage 2 전 plan loop를 자동 트리거하지 않는가?
- `dispatch.json`의 `plan_loop_required: false` (또는 해당 필드 없음)가 확인되는가?

기대 결과: plan loop skip. 만약 plan loop가 트리거된다면 risk 판정 기준을 재검토.

---

### 5. handoff 비용 측정 (v1 vs OMO-lite 비교)

**목적**: OMO-lite가 실제로 handoff 비용을 줄이는지 측정.

수집 항목:
- Stage 1 완료(this README)부터 Stage 2 첫 커밋까지 경과 시간
- Stage 2 PR ready → Stage 3 리뷰 시작까지 경과 시간
- Stage 3 승인 → Stage 4 첫 커밋까지 경과 시간
- 각 단계에서 수동으로 주고받은 메시지 수

비교 기준: `02-discovery-filter` 슬라이스 (v1 path, OMO-lite 미적용) 소요 데이터.

기록 위치: 이 파일 하단 `## 파일럿 결과 로그` 섹션에 단계 완료 시 기입.

---

### 6. 실제 동작 확인 gate (OMO-lite 적용 시)

Stage 2 (BE) / Stage 4 (FE) 완료 시 외부 smoke가 필요한가?

이 슬라이스의 외부 의존:
- Supabase `recipe_likes` 테이블 + UNIQUE 제약 — 실 DB smoke 필요
- 소셜 OAuth return-to-action — `pnpm test:e2e:oauth` 별도 실행 필요

OMO-lite에서 smoke 결과를 `dispatch.json`의 `external_smoke_needed: true`로 기록하고,
Codex supervisor가 smoke 통과 여부를 확인한 뒤에만 Stage 3/6 reviewer에게 넘기는지 확인.

---

### 7. 수동 롤백 시나리오

**목적**: supervisor 자동화가 실패했을 때 v1 fallback이 작동하는지 확인.

시나리오: `pnpm omo:run-stage` 실행 중 오류 발생 시
- `.workflow-v2/status.json`이 일부만 수정된 채 남는가?
- v1 `slice-workflow.md` 절차로 수동 진행 시 어디서 재개해야 하는지 명확한가?

기대 결과: status.json 롤백 또는 수동 복구 경로가 분명해야 함. 불명확하면 supervisor spec에 gap 기록.

---

## 파일럿 결과 로그

> 각 단계 완료 후 아래에 기입한다.

| Stage | 완료 시각 | 소요 | 주요 관찰 |
| --- | --- | --- | --- |
| Stage 1 (README + acceptance) | — | — | — |
| Stage 2 (BE 구현 PR merge) | — | — | — |
| Stage 3 (BE 리뷰) | — | — | — |
| Stage 4 (FE 구현 PR merge) | — | — | — |
| Stage 5 (디자인 리뷰) | — | — | — |
| Stage 6 (FE 리뷰 + slice 종료) | — | — | — |

---

## 발견된 Gap / 개선 후보

> 파일럿 중 발견되면 여기에 추가한다.

- (기입 전)
