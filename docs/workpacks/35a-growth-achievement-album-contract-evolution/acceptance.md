# Acceptance: 35a Growth Achievement Album Contract Evolution

> acceptance는 living closeout 문서다. 체크는 문서 검증, source-of-truth 동기화, reviewer 확인처럼 evidence가 생긴 뒤에만 한다.

## Contract Lock

- [x] 공식 5대 문서가 새 버전으로 갱신되고 `docs/sync/CURRENT_SOURCE_OF_TRUTH.md`가 같은 버전을 가리킨다 <!-- omo:id=accept-official-docs-versioned;stage=1;scope=docs;review=1 -->
- [x] slice35 계획이 35a docs, 35b backend, 35c frontend로 분리되어 있다 <!-- omo:id=accept-slice-split;stage=1;scope=docs;review=1 -->
- [x] 35a에는 구현, migration, route handler, component 변경이 포함되지 않는다 <!-- omo:id=accept-docs-only;stage=1;scope=docs;review=1 -->

## Product Policy

- [x] 퀘스트는 튜토리얼 전용으로 축소되고, 장기 목표는 업적 앨범으로 전환된다 <!-- omo:id=accept-tutorial-only-quest;stage=1;scope=docs;review=1 -->
- [x] 튜토리얼은 업적 앨범의 `tutorial` 카테고리로 정의된다 <!-- omo:id=accept-tutorial-category;stage=1;scope=docs;review=1 -->
- [x] 튜토리얼 각 단계 완료 badge/stamp와 전체 완료 badge가 문서에 명시된다 <!-- omo:id=accept-tutorial-stamps;stage=1;scope=docs;review=1 -->
- [x] 업적 달성은 XP를 추가 지급하지 않는다고 명시된다 <!-- omo:id=accept-no-achievement-xp;stage=1;scope=docs;review=1 -->

## Grade / Asset Contract

- [x] 등급명이 `Clay`, `Wood`, `Steel`, `Silver`, `Gold`, `Diamond`, `Titanium`으로 변경된다 <!-- omo:id=accept-spoon-grade-names;stage=1;scope=docs;review=1 -->
- [x] 기존 7단계 레벨 band가 유지된다 <!-- omo:id=accept-grade-band-preserved;stage=1;scope=docs;review=1 -->
- [x] 사용자가 제공한 spoon 등급 character/icon asset path가 design source로 연결된다 <!-- omo:id=accept-grade-assets-linked;stage=1;scope=docs;review=1 -->

## Achievement Criteria

- [x] 튜토리얼 기준 6단계와 전체 완료 기준이 문서에 고정된다 <!-- omo:id=accept-tutorial-criteria;stage=1;scope=docs;review=1 -->
- [x] 레시피 보관, 플래너, 장보기, 요리, 팬트리, 남은요리, 레시피 등록 threshold가 문서에 고정된다 <!-- omo:id=accept-achievement-thresholds;stage=1;scope=docs;review=1 -->
- [x] 레시피 카테고리 안에서 저장 track과 등록 track이 혼동되지 않는다 <!-- omo:id=accept-recipe-tracks-separated;stage=1;scope=docs;review=1 -->
- [x] 장보기 list 완료 count와 여러 끼니 묶음 count가 분리된다 <!-- omo:id=accept-shopping-count-basis;stage=1;scope=docs;review=1 -->

## Anti-Abuse / Backfill

- [x] duplicate source action retry로 achievement/badge가 중복 생성되지 않는 기준이 있다 <!-- omo:id=accept-achievement-idempotency;stage=1;scope=docs;review=1 -->
- [x] 팬트리 삭제 후 재추가 반복 악용을 막기 위한 distinct 기준이 있다 <!-- omo:id=accept-pantry-distinct;stage=1;scope=docs;review=1 -->
- [x] 자동 다먹음 처리된 남은요리가 achievement count에서 제외된다 <!-- omo:id=accept-leftovers-manual-only;stage=1;scope=docs;review=1 -->
- [x] 기존 유저 backfill은 silent이며 historical toast/archive row를 만들지 않는다 <!-- omo:id=accept-silent-backfill;stage=1;scope=docs;review=1 -->

## API / DB Contract

- [x] `GET /users/me/progress`는 progress-only 계약을 유지한다 <!-- omo:id=accept-progress-api-boundary;stage=1;scope=docs;review=1 -->
- [x] `GET /users/me/gamification`의 additive achievement album fields가 정의된다 <!-- omo:id=accept-gamification-achievement-fields;stage=1;scope=docs;review=1 -->
- [x] 기존 `quests` field는 호환성을 위해 유지하되 standard quest expansion을 중단하는 기준이 있다 <!-- omo:id=accept-quests-compat;stage=1;scope=docs;review=1 -->
- [x] `user_achievement_awards` schema와 unique/idempotency 기준이 정의된다 <!-- omo:id=accept-achievement-awards-schema;stage=1;scope=docs;review=1 -->

## UI Contract

- [x] MYPAGE 성장 정보는 별도 성장 카드가 아니라 profile header 안에 통합된다 <!-- omo:id=accept-profile-header-integration;stage=1;scope=docs;review=1 -->
- [x] 등급/업적/튜토리얼/알림은 각각 버튼으로 열리는 modal 또는 bottom sheet로 정의된다 <!-- omo:id=accept-modal-button-entry;stage=1;scope=docs;review=1 -->
- [x] 업적 앨범은 category tab + stamp grid + locked hint 구조로 정의된다 <!-- omo:id=accept-achievement-album-layout;stage=1;scope=docs;review=1 -->
- [x] concept board를 그대로 복붙하지 않고 실제 반응형 UI로 재해석해야 한다는 기준이 있다 <!-- omo:id=accept-responsive-interpretation;stage=1;scope=docs;review=1 -->

## Verification

- [x] `pnpm validate:source-of-truth-sync` 통과 <!-- omo:id=accept-validate-source-of-truth;stage=1;scope=docs;review=1 -->
- [x] `pnpm validate:workflow-v2` 통과 <!-- omo:id=accept-validate-workflow-v2;stage=1;scope=docs;review=1 -->
- [x] `pnpm validate:workpack -- --slice 35a-growth-achievement-album-contract-evolution` 통과 <!-- omo:id=accept-validate-workpack;stage=1;scope=docs;review=1 -->
- [x] `git diff --check` 통과 <!-- omo:id=accept-diff-check;stage=1;scope=docs;review=1 -->

### Manual Only

- [ ] 사용자가 `Clay → Titanium` spoon 등급 이미지 방향을 최종 승인한다.
- [ ] 35c 구현 전, MYPAGE prototype이 실제 모바일/데스크톱 화면에서 너무 게임 UI처럼 보이지 않는지 최종 톤을 확인한다.
