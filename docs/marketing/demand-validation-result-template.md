# 무먹 수요검증 v2 결과 템플릿

- 상태: Template
- 분석 원본: `docs/marketing/demand-validation-analysis.sql`
- 원칙: 실제 측정값만 쓰고, 직접 식별자·원문 이메일·쿠키·IP·user-agent·전체 referrer를 복사하지 않는다.
- cohort: `creative_key=mumeok_funnel_prototype_v2`만 포함하며 historical v1 taxonomy와 섞지 않는다.

## 1. 캠페인 정보

| 항목 | 값 |
| --- | --- |
| 기간 / 시각대 | `[작성]` |
| 집행 채널 / 비용 | `[작성]` |
| campaign / creative key | `weekly_nutrition_2026 / mumeok_funnel_prototype_v2` |
| UTM 정의 | `[작성]` |
| 분석 실행 시각 / 실행자 alias | `[작성]` |

## 2. 퍼널

| 단계 | 분자 | 분모 | 비율 | 메모 |
| --- | ---: | ---: | ---: | --- |
| landing_view | `[작성]` | `[작성]` | `[작성]` | v2 session |
| quiz_start | `[작성]` | `[작성]` | `[작성]` |  |
| quiz_complete | `[작성]` | `[작성]` | `[작성]` | exact q1..q4 |
| result_view | `[작성]` | `[작성]` | `[작성]` | Q3-only result |
| experience_start | `[작성]` | `[작성]` | `[작성]` |  |
| experience_complete | `[작성]` | `[작성]` | `[작성]` |  |
| beta_form_view | `[작성]` | `[작성]` | `[작성]` |  |
| accepted_lead | `[작성]` | `[작성]` | `[작성]` | beta form view 기준 |

## 3. Hero `ad_variant` cohort

| ad_variant | sessions | beta form views | accepted leads | beta form → lead |
| --- | ---: | ---: | ---: | ---: |
| a | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| b | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| c | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| d | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| default | `[작성]` | `[작성]` | `[작성]` | `[작성]` |

## 4. Result cohort

| result key | sessions | beta form views | accepted leads | beta form → lead |
| --- | ---: | ---: | ---: | ---: |
| homecook-passer | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| eyeballing-master | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| ingredient-tracker | `[작성]` | `[작성]` | `[작성]` | `[작성]` |
| pro-measurer | `[작성]` | `[작성]` | `[작성]` | `[작성]` |

## 5. Lead와 개인정보

| 유형 | 수 | 처리 |
| --- | ---: | --- |
| accepted | `[작성]` | normalized email 보관, 결과 문서에는 주소 미기재 |
| duplicate | `[작성]` | generic success, duplicate row email null |

- consent version: `marketing-demand-validation-v2`
- 직접 식별자가 분석 결과·로그·URL에 없는지: `[확인자/evidence]`
- retention 종료와 purge evidence: `[작성]`

## 6. 결론

- 관찰한 내용: `[작성]`
- 아직 말할 수 없는 내용: `[작성]`
- 다음 실험에서 바꿀 한 변수: `[광고 훅 / 타깃 / Hero 메시지 중 하나]`
- 그대로 유지할 계약: `q1..q4, Q3-only result, result/experience before email`

## 7. Manual Only readiness

| 항목 | 상태 | evidence |
| --- | --- | --- |
| operator privacy facts / canonical `/privacy` | `[Blocked / Ready]` | `[작성]` |
| Turnstile secret / hostname / action | `[Blocked / Ready]` | `[작성]` |
| production origin / edge rate-limit | `[Blocked / Ready]` | `[작성]` |
| retention / sender domain | `[Blocked / Ready]` | `[작성]` |
| full-local migration apply approval / backup | `[Blocked / Ready]` | `[작성]` |
| image rights / product example label | `[Blocked / Ready]` | `[작성]` |
| iOS Safari / paid ads approval | `[Blocked / Ready]` | `[작성]` |

Manual Only 항목이 남아 있으면 production lead와 paid ads를 열지 않는다.
