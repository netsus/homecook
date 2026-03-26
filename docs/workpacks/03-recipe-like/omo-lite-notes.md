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

### 2. v1 / v2 상태 모델 동기 검증

**언제**: Stage 2 착수 시 (Codex 첫 커밋), Stage 2 PR merge 시.

확인 사항:
- Codex가 `--sync-status` 플래그로 실행할 경우
  `.workflow-v2/status.json`의 `03-recipe-like` 항목이
  `planned → in_progress → ready_for_review → merged` 순으로 전이되는가?
- 같은 시점에 v1 roadmap인 `docs/workpacks/README.md`는
  `planned → docs → in-progress → merged` 규칙을 계속 따르는가?
- `pnpm omo:sync-status`를 수동 실행해도 같은 패치가 적용되는가?

기대 결과: v1 `docs/workpacks/README.md` Status 표와 v2 `status.json`이
각자 정의된 상태 어휘 안에서 동기된 상태.

주의:
- `docs`는 v1 roadmap 전용 상태다.
- `workflow-v2/status.json` lifecycle에는 `docs`가 없으므로 기록하지 않는다.

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

### 4. Required plan loop checkpoint 검증

`03-recipe-like`는 risk는 low지만, preset이 `vertical-slice-strict`다.
따라서 OMO-lite pilot에서는 Stage 2 착수 전에 plan loop checkpoint를 남기는 것이 맞다.

확인 사항:
- `pnpm agent:plan-loop -- --goal "03-recipe-like 구현 계획을 workpack 기준으로 확정해줘" --workpack 03-recipe-like --max-rounds 3`
  실행 후 final summary artifact가 남는가?
- plan loop 결과가 `approved` 또는 동등한 진행 가능 상태로 정리되는가?
- 이 checkpoint가 `.workflow-v2/work-items/03-recipe-like.json`의 `plan_loop: required`와 일치하는가?

기대 결과: Stage 2 시작 전에 required plan loop checkpoint가 한 번 기록된다.

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

현재 OMO-lite helper는 `external_smoke_needed`를 `dispatch.json` 출력 필드로 고정하지 않는다.
이번 파일럿에서는 아래를 확인한다.

- `.workflow-v2/work-items/03-recipe-like.json`의 `workflow.external_smokes[]`가 source of truth로 유지되는가?
- smoke 실행 결과 또는 미실행 근거가 PR notes / 리뷰 notes / 이 파일의 결과 로그 중 하나에 남는가?
- Codex supervisor가 smoke 필요 항목을 누락하지 않고 Stage 3/6 handoff에 같이 전달하는가?

기대 결과: external smoke 요구사항은 dispatch 필드가 아니라 work item + handoff notes 기준으로 추적된다.

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

- manual fallback plan checkpoint는 Stage 2 착수 gate로는 작동했지만, 자동 plan loop 대비 acceptance coverage가 낮았다.
- 이번 slice에서는 Claude sanity review로 `UNIQUE 충돌 처리`와 `like_count floor test`를 추가 보강했다.
- Stage 3 리뷰 후 follow-up으로 `recipe_likes` INSERT/DELETE 시 `recipes.like_count`를 DB 트리거가 갱신하도록 마이그레이션을 추가했다. reviewer note였던 원자 증분 gap은 이 경로로 닫았다.
- 후속 OMO 업데이트에서는 plan checkpoint artifact가 acceptance의 data integrity / race condition 항목을 자동 체크리스트로 끌어오는지 확인이 필요하다.
