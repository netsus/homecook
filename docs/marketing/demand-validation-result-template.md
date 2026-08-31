# 무먹 주간 영양 광고 수요검증 결과 템플릿

- 상태: Template
- 원칙: 실제 측정값만 기입하며 기대치나 희망 수치를 성과처럼 쓰지 않는다.
- 원칙: 이 문서는 제품 또는 시장 규모가 증명됐다고 주장하는 문서가 아니다.
- 분석 원본: `docs/marketing/demand-validation-analysis.sql`

## 1. 캠페인 기본 정보

| 항목 | 값 |
| --- | --- |
| 캠페인 기간 / 시각대 | `[작성]` |
| 총 광고비 | `[작성]` |
| campaign / creative key | `weekly_nutrition_2026 / weekly_nutrition_v2` |
| 소재 설명 | `[작성]` |
| audience key / 타깃 정의 | `[작성]` |
| 집행 채널 | `[작성]` |
| UTM source / medium / campaign / content | `[작성]` |
| 랜딩 URL | `[작성]` |
| 분석 실행 시각 / 실행자 | `[작성]` |

## 2. 한 줄 결과

- 판정: `[Green / Yellow / Red / 판단 보류]`
- 실제로 관찰한 내용: `[작성]`
- 아직 말할 수 없는 내용: `[작성]`

## 3. 1차 판정선

| 지표 | Green | Yellow | Red / 보류 | 실제값 | 판정 |
| --- | ---: | ---: | ---: | ---: | --- |
| unique_ad_landing_session | `200 이상` | `100~199` | `100 미만: 판단 보류` | `[작성]` | `[작성]` |
| session → submitted_lead | `10% 이상` | `5~9.9%` | `5% 미만` | `[작성]` | `[작성]` |
| submitted_lead 수 | `20 이상` | `10~19` | `10 미만` | `[작성]` | `[작성]` |

Green은 세 항목을 모두 만족할 때만 선택한다. 세션이 200 미만이면 전환율이 높아도 시장성 성공으로 선언하지 않는다.

## 4. first-party 퍼널

> 비율마다 분자, 분모, 비율, 95% Wilson interval을 함께 기록한다.

| 단계 | 분자 | 분모 | 비율 | Wilson 95% | 메모 |
| --- | ---: | ---: | ---: | --- | --- |
| landing_view | `[작성]` | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| quiz_start | `[작성]` | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| quiz_complete | `[작성]` | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| solution_view | `[작성]` | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| product_intent | `[작성]` | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| submitted_lead | `[작성]` | `[작성]` | `[작성]` | `[작성]` | accepted만 포함 |
| planner_interest | `[작성]` | `[작성]` | `[작성]` | `[작성]` | definitely 또는 maybe |

## 5. Meta와 first-party 단위 차이

| 항목 | 값 |
| --- | --- |
| Meta outbound click | `[작성]` |
| first-party unique_ad_landing_session | `[작성]` |
| 차이 | `[작성]` |
| 비교 가능한 동일 정의 지표 여부 | `[작성]` |
| 해석 | `두 값은 기본적으로 같은 분모가 아니며 진단용으로만 비교한다.` |

## 6. lead 구분

| 유형 | 수 | 정의 / 처리 |
| --- | ---: | --- |
| submitted_lead | `[작성]` | consent와 보호 검증을 통과한 accepted row |
| duplicate_submission | `[작성]` | generic success지만 1차 lead에서 제외 |
| deliverable_lead | `[작성]` | 실제 발송 결과로 확인한 외부 운영 지표 |

- 연락 export 실행 경로 / 실행자: `[작성]`
- 개별 주소를 이 결과 문서에 복사하지 않았는가: `[예 / 아니오]`
- 실제 발송·반송·삭제 처리 건수: `[작성]`

## 7. 진단 지표

### 7.1 target

| 지표 | 분자 | 분모 | 비율 | Wilson 95% | 해석 |
| --- | ---: | ---: | ---: | --- | --- |
| target_qualified | `[작성]` | `[작성]` | `[작성]` | `[작성]` | quiz complete 중 적합 세션 |
| target_qualified → submitted_lead | `[작성]` | `[작성]` | `[작성]` | `[작성]` | accepted만 포함 |
| non_target_qualified → submitted_lead | `[작성]` | `[작성]` | `[작성]` | `[작성]` | accepted만 포함 |

- target rule mismatch count: `[0이어야 함]`
- 목표 고객과 비목표 고객의 전환 차이: `[작성]`

| Q1 세그먼트 | 분자 | 분모 | 비율 | Wilson 95% | 해석 |
| --- | ---: | ---: | ---: | --- | --- |
| 해보려 했지만 시작하지 못함 | `[작성]` | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| 시작했지만 중단함 | `[작성]` | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| 가끔 기록 중 | `[작성]` | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| 꾸준히 기록 중 | `[작성]` | `[작성]` | `[작성]` | `[작성]` | 지속 사용자 세그먼트 |
| 관심 없음 | `[작성]` | `[작성]` | `[작성]` | `[작성]` | 비관심 대조군 |

### 7.2 result / 대조군

| result key | 분자 | 분모 | 비율 | Wilson 95% | 해석 |
| --- | ---: | ---: | ---: | --- | --- |
| ingredient_reentry | `[작성]` | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| rough_match | `[작성]` | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| split_tracking | `[작성]` | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| weekly_blindspot | `[작성]` | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| satisfied_control | `[작성]` | `[작성]` | `[작성]` | `[작성]` | 대조군을 숨기거나 실패로 표현하지 않음 |

### 7.3 planner follow-up

> accepted submitted_lead만 분모로 사용한다. duplicate는 6절에서 별도로 기록한다.

| 구분 | 값 | 분자 | 분모 | 비율 | Wilson 95% |
| --- | --- | ---: | ---: | ---: | --- |
| planner_intent | definitely | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| planner_intent | maybe | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| planner_intent | not_needed | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| planner_intent | not_answered | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| planner_priority | `[analysis.sql 결과별 작성]` | `[작성]` | `[작성]` | `[작성]` | `[작성]` |

- 제품 우선순위에 반영할 내용: `[작성]`

## 8. 개인정보·보존·파기

| 항목 | 값 |
| --- | --- |
| canonical privacy 반영 / 확인자 | `[작성]` |
| 캠페인 종료일 | `[작성]` |
| retention 종료일(종료 + 180일) | `[작성]` |
| purge dry-run 시각 / matched count | `[작성]` |
| purge dry-run operator alias | `[작성]` |
| purge confirm 시각 / deleted count | `[작성]` |
| purge confirm operator alias / 승인자 | `[작성]` |
| purge evidence JSON | `[작성]` |
| confirm 뒤 remaining_expired_count 0 확인 | `[작성]` |
| 결과·purge 로그에 직접 식별자가 없는지 | `[작성]` |

## 9. 결론과 다음 실험

- 이번 실험 결론: `[작성]`
- 문제 가설에 대해 관찰한 것: `[작성]`
- 제품 수요에 대해 관찰한 것: `[작성]`
- 시장 규모에 대해 아직 말할 수 없는 것: `[작성]`
- 다음 실험에서 바꿀 단 하나의 변수: `[광고 훅 / 타깃 / Hero 메시지 중 하나]`
- 그대로 유지할 퍼널·판정선: `[작성]`
- 재실험 시작 / 중단 기준: `[작성]`

## 10. Manual Only readiness sign-off

| 항목 | 상태 | 확인자 | evidence |
| --- | --- | --- | --- |
| operator privacy facts | `[Blocked / Ready]` | `[작성]` | `[작성]` |
| canonical /privacy 운영 반영 / launch-readiness PR1/2/3 | `[Blocked / Ready]` | `[작성]` | `[작성]` |
| production Turnstile secret / hostname | `[Blocked / Ready]` | `[작성]` | `[작성]` |
| production origin / 광고 UTM / audience | `[Blocked / Ready]` | `[작성]` | `[작성]` |
| edge rate-limit rule | `[Blocked / Ready]` | `[작성]` | `[작성]` |
| `MARKETING_LEAD_PROTECTION_READY=1` 승인 | `[Blocked / Ready]` | `[작성]` | `[작성]` |
| `MARKETING_CAMPAIGN_END_AT` / 종료 + 180일 retention | `[Blocked / Ready]` | `[작성]` | `[작성]` |
| staging/production full-local migration apply | `[Blocked / Ready]` | `[작성]` | `[작성]` |
| 베타 초대 발신 이메일 / 도메인 | `[Blocked / Ready]` | `[작성]` | `[작성]` |
| 실제 iOS Safari smoke | `[Blocked / Ready]` | `[작성]` | `[작성]` |
| paid ads 집행 승인 | `[Blocked / Ready]` | `[작성]` | `[작성]` |

### 최종 확인

- [ ] 실제 성과 수치만 사용했다.
- [ ] 제품 또는 시장 규모가 증명됐다고 과장하지 않았다.
- [ ] accepted / duplicate / deliverable lead를 섞지 않았다.
- [ ] 다음 실험은 한 변수만 바꾼다.
- [ ] Manual Only 미완료 항목이 있으면 lead 저장과 paid ads를 열지 않았다.
