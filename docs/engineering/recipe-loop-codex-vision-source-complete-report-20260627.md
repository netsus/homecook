# Recipe Loop Codex Vision Source-Complete Train Report

작성일: 2026-06-27

## 결론

`codex-vision-source-complete-train-20260627` train 12개 추출은 완료했지만, train gate를 통과하지 못했다. 따라서 계획대로 validation과 holdout은 실행하지 않았다.

초보 개발자 관점에서 말하면, `codex-vision`은 영상 프레임까지 보면서 레시피를 만들 수는 있었지만, 현재 설정에서는 일부 영상의 재료를 Gemini 기준선만큼 안정적으로 맞히지 못했다.

## 실행 범위

- provider: `codex-vision`
- split: `train`
- out tag: `codex-vision-source-complete-train-20260627`
- train IDs: 12개
- frame 설정: `--max-frames 48 --batch-size 8`
- timeout 재시도: timeout 케이스 2개만 `--timeout-ms 2400000`으로 단일 재시도

## 중요한 보호 규칙

- 추출 중에는 `golden.json`을 읽지 않았다.
- `golden.json`은 추출이 끝난 뒤 채점 명령에서만 사용했다.
- validation은 train gate 실패 때문에 실행하지 않았다.
- holdout은 실행하지 않았다.

## 실행 결과

첫 P3 실행에서 다음 2개 케이스가 timeout으로 실패했다.

- `fTlTpSJtrEs`
- `vqb3WyZmL_8`

두 케이스 모두 같은 out tag로 재시도했고 최종 성공했다. timeout 당시 cache 로그와 `failure.json`은 `notebooks/recipe_loop_data/cache/codex-vision/` 아래에 남아 있다.

## Train 채점

비교 기준은 기존 Gemini `iter15-ingredient-floor-20260624` train 결과다.

| 지표 | Codex Vision | Gemini 기준선 | 판정 |
| --- | ---: | ---: | --- |
| 레시피 개수 일치율 | 1.000 | 1.000 | 통과 |
| 재료 F1 | 0.916 | 0.965 | 미달 |
| 재료 Precision | 0.937 | 0.978 | 미달 |
| 재료 Recall | 0.903 | 0.953 | 미달 |
| 분량 일치율 | 0.770 | 0.853 | 미달 |
| 분량 커버리지 | 0.911 | 0.944 | 미달 |
| 단계 커버리지 | 0.652 | 0.639 | 통과 |

계획서 기준은 재료 recall이 Gemini 기준선보다 0.02 넘게 떨어지면 validation에 들어가지 않는 것이다. 이번 결과는 `0.953 - 0.903 = 0.050` 차이라서 gate 실패다.

## 주요 실패 케이스

- `fTlTpSJtrEs`: 재료 F1 `0.418`, 재료 recall `0.338`, 단계 커버리지 `0.166`
- `rKfLY_Lg1-Q`: 재료 F1 `0.800`, 재료 recall `0.800`, 단계 커버리지 `0.583`

특히 `fTlTpSJtrEs`가 전체 평균을 크게 끌어내렸다. 다음 반복은 validation을 보지 말고 이 train 케이스의 source/result/cache 로그만 사용해 프롬프트나 후처리 규칙을 개선해야 한다.

## 검증 명령

```bash
pnpm vitest run tests/recipe-loop-codex-vision-client.test.ts
```

```bash
node scripts/recipe-loop/grade-extraction.mjs \
  --split train \
  --ids 5NSTRKouSWs,DnQ09ZZCjCs,J5Rmux3ttaY,LSYEnH5fGfk,PBHWL8_0Kb0,QF0gBfW3od4,YUdJBeOdrMY,eJyoszbyNNQ,fTlTpSJtrEs,rKfLY_Lg1-Q,tqpwhtw54mQ,vqb3WyZmL_8 \
  --out-tag codex-vision-source-complete-train-20260627
```

## 다음 반복 제안

1. `fTlTpSJtrEs`를 먼저 고친다.
2. validation을 보지 않고 train source/result/cache 로그만 본다.
3. 개선 후 같은 train 12개를 다시 돌린다.
4. 재료 recall이 기준선을 만족할 때만 validation을 실행한다.
