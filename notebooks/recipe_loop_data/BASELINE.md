# M3 기준선(baseline / iteration 0) 측정 결과

측정일: 2026-06-13 · 모델: gemini-2.5-flash · 프롬프트: baseline-0 · 추출 모듈: lib/server/recipe-extraction-lab

결정적 채점기(scripts/recipe-loop/lib/grading.mjs) 기준. AI 의미 채점은 M4 루프에서 추가.

## 집계

| 분할 | n | 재료 F1 | 분량 일치 | 단계 커버리지 | 레시피개수 일치 |
|---|---|---|---|---|---|
| train | 12 | 0.899 | 0.787 | 0.813 | 0.917 |
| validation | 8 | 0.899 | 0.864 | 0.932 | 0.875 |

validation 2건(nE7ANT3uGMQ, oe_WhcK2X4Q)은 Gemini 일일 쿼터로 미측정 — 쿼터 회복 후 보강.
holdout 5건은 정책상 미측정(최종 1회용).

## Local integrity gate threshold rationale (2026-06-14)

`youtube-recipe-extraction-loop-local-integrity-ralplan-20260614.md`의 첫 PR gate는 기존 M3 기준에서 온 deterministic threshold를 validation split에 그대로 적용한다.

현재 validation baseline 재채점 결과는 `n=10`, `ingredientF1=0.915`, `amountMatchRate=0.825`, `stepCoverage=0.905`, `recipeCountMatchRate=0.9`다. 따라서 `det_f1_min=0.92`, `det_amount_min=0.85`, `det_recipe_count_min=0.95`에는 미달하고, baseline decision에서 `deterministic_validation=false`가 정상이다.

이 임계값은 baseline을 그대로 통과시키기 위한 기준이 아니라, loop가 다중 레시피 누락과 분량 추정 약점을 실제로 개선했는지 확인하기 위한 fail-closed gate로 유지한다. 특히 `vw73AKRDxI8`의 4/7 multi-recipe 추출과 `nE7ANT3uGMQ`/`jenDETSgvz4`의 낮은 분량 일치율이 개선 목표다. 후속 PR에서 scorer 의미가 바뀌면 old/new 직접 비교 대신 migration note와 loophole fixture 결과를 함께 남긴다.

## 케이스별 약점 (루프 1차 개선 후보)

- **다중 레시피 vlog 누락**: 똘비(train, 7개 중 일부 누락), 밥통민(validation, 4/7 추출, F1 0.47) — 가장 큰 헤드룸.
- **분량 추정**: 영어 원팟파스타·제육·김치찌개 등에서 시각추정 분량의 단위/수치 정확도가 낮음.

## 다음 (M4)
노트북 루프 작성 → 1 ITER 스모크. 계획(Claude)→구현(Codex, recipe-extraction-lab 수정)→확정검증→AI의미채점→판정→진단→재시도.
