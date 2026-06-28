# 유튜브 레시피 추출 강화 루프 — 계획 (M0)

작성: 2026-06-11 · 브랜치: `chore/jupyter-recipe-loop`
참고 데모: `notebooks/agent_loop_demo.ipynb` (계획→구현→확정검증→AI채점→판정→진단→재시도 7단계 루프)

## 목표

1. 다양한 유튜브 레시피 영상에서 재료·만들기를 범용적으로 추출하는 구현 코드 확보
2. train 12 / validation 10 / blind holdout 5 골든셋을 만들고, train으로 `계획→구현→검증→채점` 루프를 돌리며
   validation은 코드 채점 집계로 일반화 성능을 추적해 구현을 강화. holdout은 최종 1회만 채점하는 진짜 시험지.

## 확정된 설계 결정 (2026-06-11 사용자 승인)

| 항목 | 결정 |
|---|---|
| 구현 대상 | **별도 추출 모듈 신설**. Codex는 이 모듈 디렉터리만 수정. `lib/server/youtube-import.ts` 본체와 기존 테스트는 건드리지 않고, 루프 합격 후 본체 통합은 별도 작업으로 진행 |
| LLM 호출 | **GPT 5.4 keyframes 실제 호출 + 응답 디스크 캐시**. 캐시 키 = source 해시 + prompt 해시 + keyframe/모델 해시. 프롬프트나 증거 묶음이 바뀐 ITER만 재호출 |
| 데이터셋 선정 | **Claude가 다양성 축 기준 후보 제안 → 사용자 승인**. 정답지는 AI 초안 → 사용자 검수로 확정 |
| 데이터 분할 | **train 12 / validation 10 / blind holdout 5** (사용자 제안으로 3계층 채택). spare 2개는 교체용 보관 |
| validation 노출 | **매 ITER 코드로 채점하되 집계 점수(평균·최저·분포)만 공개**. 케이스별 입력·정답·출력은 구현자/진단자에게 비공개 |
| holdout 정책 | **루프 중 절대 채점하지 않음**. train+validation 기준 통과 후 최종 1회만 채점. 결과가 나쁘면 루프 재개가 아니라 원인 분석 후 새 holdout 구성 검토 |

## 현재 파이프라인 요약 (참조용)

recipe-loop 실험 체인: 유튜브 링크 스냅샷(source.json) → 설명란/작성자 댓글/자막 정리 →
EvidencePacket 생성 → keyframe 선택 → GPT 5.4 구조화 추출 → 후처리/재료 사전 매칭.
runner는 `golden.json`을 읽지 않으며, 채점기는 별도 프로세스에서만 정답을 읽는다.

## 디렉터리 레이아웃 (안)

```
notebooks/
  recipe_extract_loop.ipynb          # 메인 루프 노트북 (데모 구조 이식)
  recipe_loop_plan.md                # 이 문서
  recipe_loop_runs/                  # 실행 아티팩트 (gitignore, 데모와 동일 구조)
  recipe_loop_data/
    manifest.json                    # 분할·축 태그·노출 정책 (기계가 읽는 단일 소스)
    train/<video_id>/source.json     # 스냅샷: 메타 + 설명 + 자막 + 작성자 댓글
    train/<video_id>/golden.json     # 정답지 (사용자 검수 완료본)
    validation/<video_id>/...        # hidden — 집계 점수만 루프에 공개
    holdout/<video_id>/...           # blind — 루프 중 채점 금지, 최종 1회만
    candidates/<video_id>/...        # spare (교체용)
    cache/codex-vision-keyframes/    # GPT 5.4 keyframe 추출 캐시
lib/server/recipe-extraction-lab/    # (가칭) Codex 구현 대상 모듈
scripts/recipe-loop/
  snapshot-video.mjs                 # 1회 수집: 영상 메타·설명·자막·댓글 → source.json (Apify 자막 폴백 --apify)
  discover-candidates.mjs            # Data API 검색 기반 후보 탐색 유틸
  run-extraction.ts                  # tsx 러너: source.json → 추출 결과 JSON (subprocess 격리)
  grade-extraction.ts                # 결정적 채점기: 결과 vs golden → 점수 JSON
```

## 추출 모듈 인터페이스 (안)

```ts
extractRecipeFromSources(input: {
  video: { videoId, title, description, tags },
  transcript: { segments, language } | null,
  authorComments: string[] | null,
}, deps: { llm: LlmClient /* 캐시 래핑된 GPT 5.4 keyframes */ }): Promise<{
  recipes: Array<{
    title: string,
    ingredients: Array<{ name, amount, unit, rawText }>,
    steps: Array<{ instruction, rawText }>,
  }>,
}>
```

## 채점 설계

두 종류 채점을 병행하고, 최종 판정은 항상 노트북 Python 코드가 내린다.

1. **결정적 채점 (코드)**
   - 재료: 이름 정규화(공백·조사 제거, 동의어 매핑) 후 set 매칭 → precision / recall / F1.
     매칭된 재료에 한해 양·단위 일치율 별도 산출
   - 만들기: 정답 단계별 핵심 동작(동사+대상)이 추출 단계 어딘가에 존재하는지 커버리지 측정
2. **AI 의미 채점 (Codex Spark, read-only)**
   - 재료 의미 점수 0~5, 만들기 의미 점수 0~5, `case_score = min(재료, 만들기)`
   - `average_score` = train 12 case_score 평균
3. **판정 (코드)**
   - train: 모든 `case_score ≥ CASE_MIN` 그리고 `average ≥ AVG_MIN` (초기값 3.5 / 4.0, 운영하며 상향)
   - 결정적 게이트 병행: 재료 F1 평균 하한, 스키마 valid, 러너 timeout 없음
   - validation 10: 동일 채점 후 집계만 기록 — 판정 기준이 아니라 일반화 추적 지표
   - holdout 5: 루프 종료 후 최종 1회만 채점하는 blind 최종 게이트

## 루프 단계 (데모 7단계 이식)

| 단계 | 담당 | 내용 |
|---|---|---|
| 1 계획 | Claude (`claude -p --permission-mode plan`) | train 케이스 + 직전 피드백 기반. 첫 회차만 전체 계획 |
| 2 구현 | Codex (`codex exec --sandbox workspace-write`) | `lib/server/recipe-extraction-lab/`만 수정 허용 |
| 3 확정 검증 | 노트북 Python | tsx 러너 subprocess 실행(train 12), 스키마 검증, `pnpm tsc`·lint, **validation/holdout 문자열 하드코딩 탐지** |
| 4 채점 | 코드 + Codex Spark | 결정적 점수 + AI 의미 점수 (train 케이스별) |
| 5 판정 | 노트북 Python | 임계값 적용 PASS/FAIL. validation 10 집계 동시 기록. holdout은 건드리지 않음 |
| 6 진단 | Claude | train 케이스별 상세 + validation **집계만** 보고 수정 방향 작성 |
| 7 재시도 | 노트북 Python | 안전 피드백 파일 → 다음 ITER, `MAX_ITER` 상한 |

hidden 누수 차단 원칙(데모 그대로): validation/holdout의 입력·정답·실제 출력은 구현/진단 프롬프트에 포함하지 않으며,
모듈 코드에 해당 문구가 하드코딩되면 확정 검증에서 즉시 FAIL. holdout은 집계조차 루프에 노출하지 않는다.

## 마일스톤

- **M0** 계획 확정 — 이 문서 (완료)
- **M1** 데이터셋 (완료 · 2026-06-11): 다양성 축 10개 쿼리로 후보 풀 탐색 → 29개 스냅샷 수집 →
  train 12 / validation 10 / holdout 5 / spare 2 분할 (`recipe_loop_data/manifest.json`이 단일 소스).
  공개 timedtext가 빈 200 응답을 반환하는 문제(poToken 정책)가 있어 프로덕션과 동일한
  Apify actor(`tubelens~youtube-video-scraper`) 폴백을 `--apify`로 추가해 수집.
- **M2** 정답지 (완료 · 2026-06-13): 27개 전부 golden.json 확정(`reviewStatus: approved`).
  2단계 방식(텍스트 초안 → 과거 시각 보강) + 사용자 3회 검수. 레시피 55개, 재료 611개(분량 미상 5), 단계 489개.
  현재 recipe-loop provider 정리는 GPT 5.4 keyframes 경로로 통합됐고, 과거 provider 전용 보강 스크립트는 제거됐다.
  유지 스크립트: `check-unused-ingredients.mjs`(시각추정 재료 중 단계 미사용분 필터 — 검수+파이프라인 공용), `build-review-doc.mjs`(검수 문서).
  교훈: 시각 추출 첫 패스가 재료를 누락(라따뚜이 마늘)하거나 오검출(김밥 소고기/맛살, 된장찌개 소고기)할 수 있어
  타임스탬프 지정 재질의·미사용 재료 필터·텍스트 소스 교차검증이 필요. 이 점검들은 M5 파이프라인 후처리로 이식.
- **M3** 하네스 (완료 · 2026-06-13): `.mjs` 모듈(tsx 미설치라 Node 네이티브) + 러너 + 결정적 채점기 + GPT 5.4 keyframes 클라이언트.
  추출 모듈 `lib/server/recipe-extraction-lab/`(extract.mjs + prompt.mjs), 러너 `run-extraction.mjs`(golden 미접근 격리),
  채점기 `grade-extraction.mjs` + `lib/grading.mjs`(재료 F1·분량 일치·단계 커버리지·레시피 개수 매칭).
  **과거 기준선(baseline-0)**: train(n=12) 재료F1 0.899 / 분량 0.787 / 단계 0.813 / 레시피개수 0.917,
  validation(n=8, 2건 쿼터 보류) 재료F1 0.899 / 분량 0.864 / 단계 0.932. 상세 `recipe_loop_data/BASELINE.md`.
  최대 헤드룸: 다중 레시피 vlog 누락(밥통민 4/7), 시각추정 분량 정확도. 쿼터(429)는 분당 한도라 백오프 재시도로 우회하나 일일 한도는 별도.
- **M4** 노트북 루프 (진행 중 · 2026-06-13): 오케스트레이터 `scripts/recipe-loop/loop.py`(계획→구현→검증→채점→판정→진단→재시도) +
  얇은 노트북 `notebooks/recipe_extract_loop.ipynb`(loop.py 호출) + AI 의미 채점기 `grade-semantic.mjs`(텍스트 기반, 캐시).
  데모와 달리 오케스트레이션을 .py에 두고 노트북이 호출(대용량 .ipynb 수기 작성 위험 회피). **배선 스모크 통과**:
  하드코딩 점검·baseline 채점 집계·판정 로직·약점 케이스 추출까지 동작 확인(노트북 nbconvert 실행 성공).
  남은 것: GPT 5.4 keyframes 기본 경로로 실제 ITER(Codex 구현 포함) 스모크. 격리: 모듈에 validation/holdout 정답 문구 하드코딩 시 확정검증 FAIL, validation은 집계만·holdout은 미채점.
- **M5** 본 루프 운영: 임계값 도달까지 반복 → train+validation 통과 시 holdout 최종 채점 → 합격 시 본체 통합 계획 수립

## 제품 방향 (사용자 확정)

- **시각 추출 적극 활용** (2026-06-12 train 검수 총평): 시각 추출의 만들기 정확도가 검증됨.
  고객에게 주는 정보의 정확성·직관성이 API 비용보다 우선이므로, 골든 작성뿐 아니라
  루프가 강화할 추출 파이프라인 자체도 자막·설명란이 빈약하면 시각 추출을 적극 사용하는 방향으로 설계한다.

## 미결 사항 (진행하며 결정)

- 시각 의존 케이스 비중 — GPT 5.4 keyframes 방식으로 포함 가능하나, frame 선택과 캐시 미스 시 변동성이 큼
- 모듈 정식 이름 (가칭 `recipe-extraction-lab`)
- 임계값 초기값 보정 — M3 기준선 측정 후 확정
- `recipe_loop_runs/`, `recipe_loop_data/cache/` gitignore 추가 여부와 data/golden의 git 추적 여부
- holdout 채점 결과가 나쁠 때의 절차 — 루프 단순 재개는 holdout 오염이므로, 원인 분석 후 새 holdout 재구성을 기본으로
