# 무먹 광고 퍼널 v2 퀴즈 콘텐츠 명세

- 상태: 2026-09-03 사용자 승인 contract-evolution
- source prototype: `feature/demand-validation-funnel-integration@63f8ef2a019c6d260a96a42fab9d67f727d93557`
- Stage 1 author task: `01a0630e-81f1-7f42-8b1b-cb259d1d5997`

이 문서는 `/beta` v2의 exact `q1..q4` 질문, 선택지, 결과 key와 Q3-only 결과 규칙의 단일 authority다. 기존 5문항과 결과 `ingredient_reentry | rough_match | split_tracking | weekly_blindspot | satisfied_control`은 historical v1 계약이며 v2에 사용하지 않는다. `q5`는 허용하지 않는다.

## 1. Exact 질문과 선택지

모든 문항은 단일 선택이다. Q1/Q2의 비핵심 답변도 조기 종료하지 않고 네 문항을 모두 완료한다. value는 API/DB에 저장되는 exact enum이고 label은 사용자 표시 문구다.

### `q1`

질문: `평소 칼로리나 탄단지를 얼마나 자주 기록하나요?`

| value | label |
| --- | --- |
| `daily` | 거의 매일 |
| `3_5` | 주 3~5일 |
| `1_2` | 주 1~2일 |
| `none` | 거의 안 함 / 안 함 |

### `q2`

질문: `일주일에 집밥을 몇 끼 정도 먹나요?`

보조 설명: `직접 만들거나 가족이 만든 음식 모두 포함`

| value | label |
| --- | --- |
| `none` | 거의 안 먹음 |
| `1_2` | 1~2끼 |
| `3_5` | 3~5끼 |
| `6_plus` | 6끼 이상 |

### `q3`

질문: `집밥은 주로 어떻게 기록하나요?`

| value | label | result key | 결과명 |
| --- | --- | --- | --- |
| `pass` | 집밥은 기록하지 않음 | `homecook-passer` | 집밥 패스형 |
| `eyeball` | 먹은 양을 눈대중으로 기록 | `eyeballing-master` | 눈대중 장인 |
| `track` | 딱 맞는 음식이 없어 비슷한 음식이나 1인분으로 기록 | `ingredient-tracker` | 성분 추적러 |
| `measure` | 재료와 음식 무게까지 재서 기록 | `pro-measurer` | 프로 계량러 |

### `q4`

질문: `집밥을 기록할 때 가장 불편한 것은?`

| value | label |
| --- | --- |
| `ingredients` | 재료와 양을 하나씩 입력하는 것 |
| `weight` | 완성된 음식과 먹은 양을 재는 것 |
| `search` | 딱 맞는 음식이 없어 비슷한 걸 찾아야 하는 것 |
| `none` | 별로 불편하지 않음 |

## 2. Exact 결과 규칙

결과는 Q3 하나로만 결정한다. Q1/Q2/Q4는 결과 점수, tie-break, hidden qualification에 영향을 주지 않는다. 같은 Q3라면 다른 세 답변이 달라도 같은 result key가 나와야 한다.

허용 결과는 아래 네 개뿐이다.

- `homecook-passer`
- `eyeballing-master`
- `ingredient-tracker`
- `pro-measurer`

client-supplied result는 받지 않는다. 서버가 Q3 value에서 결과를 다시 계산한다. old result key, unknown result, `q5`, unknown answer key는 `422 VALIDATION_ERROR`다.

## 3. Result copy authority

결과 title·quote·description·캐릭터는 source prototype `docs/product-decisions.md`와 `src/Prototype.tsx`의 사용자 확정 값을 포팅한다. result key와 한국어 title의 1:1 매핑은 바꾸지 않는다.

결과 공유는 지원 환경에서 Web Share API, 그 외 링크 복사를 사용한다. 취소, 미지원, 복사 실패가 결과를 지우거나 email 단계로 강제 이동시키지 않는다.

## 4. `target_qualified` 처리

v2에는 승인된 `target_qualified` truth table이 없다. 따라서 Q1/Q2/Q4 또는 result key에서 적합도 boolean을 추론하지 않는다.

- v2 row: `target_qualified=null`
- v2 quiz response: `target_qualified: null`
- historical v1 row: 기존 boolean 보존
- v2 분석: `ad_variant`/result cohort의 `beta_form_viewed → accepted lead` 전환을 사용

## 5. 금지 사항

- `q5` 또는 5문항 progress
- old result enum과 새 result enum 혼용
- Q1/Q2/Q4 기반 implicit result/qualification mapping
- email, consent, Turnstile token을 quiz answer/event에 포함
- 답변/result/email을 URL이나 로그에 기록
- unknown answer를 `none`이나 default result로 조용히 치환
