# 재료 AI 영양 추정 — 2026-10-08

> 최종 운영 상태: DB·웹 배포와 자동 처리를 완료했고 두 재료를 실제 보완했다. [최종 반영 기록](ingredient-ai-nutrition-rollout-20261008.md)을 우선한다. 아래는 당시 구현·초기 검증 기록이다.

상태: 구현·격리 검증 완료, **운영 DB 및 웹 미반영·자동 처리 비활성**. 앞서 완료한 공식/대표 영양 43개 작업과 구분한다. 첫 API 키는 HTTP 402 `RESOURCE_EXHAUSTED`를 반환했지만 보조 키로 생 삼나물·열무김치 국물의 AI 추정 초안을 생성했다. 두 응답은 서버와 실제 DB writer 검증을 통과했고 격리 DB 반영은 롤백했다. 운영에는 넣지 않았다. 402에도 기존 보조 키를 최대 2개 범위 안에서 시도하도록 실행기를 보완했다.

## 적용 기준

| 대상 | 처리 |
| --- | --- |
| 승인한 공식·제품·대표 영양이 있는 재료 | 기존 자료 우선. 공식 일부 결측도 AI로 섞어 채우지 않음 |
| 영양자료가 없는 신규 기본/상세 재료 | 영속 작업 목록에 자동 등록, AI 추정 시도 |
| 모호한 배합·브랜드 제품 | 판단 불가 성분은 null. 핵심 5개 전부 불명이면 저장하지 않음 |
| 음식/제품·검색용 묶음·별칭·제외 항목 | 이번 자동 추정 대상에서 제외 |
| 기존 삼나물·열무김치 국물 | AI 초안 2개 확보·격리 저장 검증. 배포 후 별도 seed 대상으로 지정 |
| 제품/배합 정보가 필요한 기존 16개 | 제품 DB 연결 후 보완. 일괄 추정 대상으로 넣지 않음 |

추정은 가식부 100g이며 생/건조/조리 상태를 식품 설명과 함께 전달한다. 부피 밀도·개수 무게를 추정하지 않는다. 식품 이름·분류·정의만 모델에 전달하며 계정·레시피 내용은 보내지 않는다.

## 저장·표시 계약

기존 nutrition_sources → nutrition_source_items → nutrition_profiles → nutrition_values → ingredient_nutrition_profiles를 재사용한다. 별도 숫자 테이블을 만들지 않는다.

- provider: `HOMECOOK_AI_ESTIMATE`; 숫자 value_status: `estimated`; 모르는 값: null + `missing`.
- 8개 성분: 열량, 탄수화물, 단백질, 지방, 나트륨, 당류, 식이섬유, 포화지방. 단위는 kcal/g/mg를 고정한다.
- 출처에는 정책/프롬프트 버전·모델·생성 시각·100g 기준·가정·주관적 불확실성을 보존한다. 정책 승인자는 자동 처리 정책을 승인한 운영자이며 개별값의 실측·검수 인증을 뜻하지 않는다.
- 공개 출처의 6개 키는 유지한다. source_url `/about/ai-nutrition`은 추정 방식 설명 페이지이며 개별 수치의 증거가 아니다.
- 숫자의 음수·상한·성분 간 모순을 DB와 서버 양쪽에서 검사한다. 검사를 통과해도 실측 정확도가 보증되는 것은 아니다.
- 레시피/계획: 실제 기여한 AI가 있을 때 `AI_NUTRITION_ESTIMATE_USED`, ‘AI 추정값 포함’. 기존 계산버전 v2와 공식값의 hash를 유지한다.
- 식사기록: 선택적 `contains_ai_estimate` Boolean. 옛 JSON에서 누락은 false로 읽되 과거 JSON을 재작성하지 않는다. 항목·끼니·하루 합계에 OR로 전파한다.
- AI+부분 결측: ‘일부 영양정보가 빠진 추정값’. AI 0은 양을 모르는 TO_TASTE를 확정 0으로 만들 수 없다.
- 새 계산/직접 재료 식사 선택은 공식 프로필을 AI보다 우선한다. 고정한 제품값이 없으면 일반 AI로 대체하지 않는다.
- 현재 레시피의 새 영양 snapshot만 추가한다. 이미 고정된 계획·요리·식사 기록은 당시 근거를 보존한다.

## 자동 처리

`private.ingredient_ai_nutrition_settings`(정책)와 `private.ingredient_ai_nutrition_jobs`(영속 작업)를 추가한다. 재료 INSERT trigger가 같은 트랜잭션에서 작업을 넣는다. 기존 재료 전체를 자동 enqueue하지 않는다.

웹 프로세스는 env `AI_NUTRITION_ESTIMATION_ENABLED=1`일 때 최초 5초 뒤, 작업 종료 60초 뒤마다 한 건을 처리한다. 성공한 재료 등록 응답 후에도 빠르게 깨운다. DB 설정도 enabled여야 실제 claim한다. 기본 비활성, 일 50회 claim(재시도 포함), 최대 3회 시도, 기본 임대 180초, 공급자 키 최대 2개·각 요청 20초다. 웹 재시작에도 DB 작업은 남는다. 별도 범용 작업 시스템/서버 의존성을 추가하지 않는다.

처리 순서: claim → 최신 식품 정의/공식값 재확인 → 모델 응답 검증 → DB 잠금 안에서 다시 공식 자료·context hash·lease 확인 → 출처/8개 값/연결을 원자 저장. 중복 enqueue·동일 완료 재전송은 중복 자료를 만들지 않는다. 실패는 정규화한 코드만 보관하며 키/공급자 오류 원문을 로그로 남기지 않는다.

성공한 작업에는 영향받는 현재 레시피 ID를 저장한다. 기존 계산기와 snapshot writer를 재사용해 재계산하며, 성공한 ID만 ACK한다. 실패한 레시피는 보존·순환하고 삭제된 레시피의 대기 참조만 정리하여 다른 작업을 막지 않는다.

모든 자동 RPC는 `ingredient-ai-nutrition` service scope의 허용된 POST 경로만 사용한다. anon/authenticated 접근과 private 테이블 직접 service_role 접근은 차단한다. 기존 계정세대·입력 변경·제품 소유권·snapshot 출처 검증은 유지한다.

## 배포·활성화 순서

1. 운영에 사용할 키와 보조 키를 확인하고, 두 시범 초안의 생나물·김치 국물 배합 가정을 확인한다. 첫 키의 402는 보조 키로 복구됐다. 향후 두 키 모두 실패하면 미연결 상태를 유지한다.
2. full-local 운영 대상/백업을 확인하고 0900 → 0910 → 0920 migration과 웹/UI를 함께 묶음 배포한다. DB와 env는 off로 둔다. 기존 `pnpm deploy:dev` 경로와 DB 변경 절차를 따른다.
3. 격리 검증한 모델과 정책 승인자 users.id를 DB 설정에 기록한다. 기본 모델을 코드에 숨겨 고정하지 않는다. 정책/프롬프트 변경 시 새 policy_version을 사용해 기존 근거를 보존한다.
4. 내부 운영 접근에서 DB enabled 및 서버 env를 켠다. `.env.example`에 기본값 0을 추가했다. 기존 환경 복사 도구가 이 예제 키 목록을 읽으므로 별도 프로세스 도구 변경은 필요 없다.
5. 생 삼나물·열무김치 국물의 정확한 ingredient_id만 `enqueue_ingredient_ai_nutrition(uuid[])`로 넣는다. 새 재료는 trigger로 자동 처리된다. 초안 파일은 검토용이다. 활성화 후 새로 생성하며, 오래된 초안의 생성 시각을 바꿔 재사용하지 않는다.
6. 두 프로필의 AI 표기·NULL·가정과 현재 레시피 재계산, 과거 pin 보존을 확인한다. 공급자 오류가 있으면 실패 목록을 확인하고 공식값을 임의 생성하지 않는다.

중지: DB enabled=false 또는 env=0. 기존 AI 근거를 삭제하거나 과거 기록을 다시 쓰지 않는다. 코드에서 estimated 지원을 제거하는 롤백은 이미 생성된 AI를 읽지 못하므로 금지한다. 공식 자료로 대체할 때 기존 원자료는 남기고 새 승인 연결을 우선 적용한다.

운영 확인은 private jobs의 status/last_error_code/attempt_count/pending_recipe_ids 및 settings의 claims_today를 사용한다. 이 표들은 사용자 API로 노출하지 않는다. 실패한 모델 설정을 그대로 무한 재시도하지 않는다.

## 변경 파일과 검증

- 스키마: `20261008090000_ingredient_ai_nutrition.sql`, `20261008091000_ai_nutrition_snapshot_evidence.sql`, `20261008092000_ai_nutrition_recipe_refresh.sql`.
- 실행: `lib/server/ingredient-ai-nutrition-{model,worker,runtime,refresh}.ts`, `instrumentation.ts`, 등록 route, 제한된 Supabase RPC client.
- 소비자: 기존 영양 계산기·snapshot 검증·레시피/계획/식사 기록 표시·서버 및 클라이언트 계약.
- 보안: additive 함수 권한 manifest와 기존 검증기 목록 등록.
- 시범 호출: `data/ingredient-ai-nutrition-pilot-20261008.json`은 첫 키 실패 기록, `data/ingredient-ai-nutrition-pilot-secondary-20261008.json`은 보조 키로 생성한 실제 AI 초안 2개다. 후자는 실측/공식값이 아니며 운영 미반영이다.

검증 결과는 아래에 기록한다. 현재 운영 재료/영양 통계는 앞선 공식/대표 43개 작업 이후 그대로이며, 이번 기능으로 채운 운영 재료는 0개다.

### 최종 검증

- 관련 21개 파일, 309개 테스트 통과(실제 격리 DB → TypeScript 계산기 → snapshot 저장 통합 포함).
- 전체 타입 검사와 production build 통과. 기존 다른 파일 lint 경고 4개는 이번 범위 밖으로 유지했다.
- 운영 백업에서 새 격리 DB를 복원해 3개 migration 순차 적용, 과거 데이터 체크섬 동일, 권한·queue·영양근거·refresh SQL 4개 검사 통과. 모든 테스트 데이터는 rollback했다.
- 실제 Gemini 초안 2개: 보조 키 생성 성공, 서버 검증 및 실제 DB complete RPC 수용, rollback. 실측 정확도를 검증했다는 뜻은 아니다.
- 모바일390/데스크톱1280, AI 완비/부분/기존 공식값 22개 화면 상태 확인. 가로넘침·page/console/network 오류0. API는 fixture이며 실계정/운영 접속은 하지 않았다. 개별 계획 SSR의 AI 표시와 추가 미리보기는 단위테스트 범위다.
- [검증 결과](data/ingredient-ai-nutrition-verification-20261008.json), [브라우저 범위·한계·로컬 캡처 경로](data/ingredient-ai-nutrition-browser-20261008.json).

남은 운영 작업은 DB·웹 묶음 배포, 승인한 모델/정책/키 설정과 활성화, 두 재료 enqueue 및 실제 사용자 흐름 확인이다. 기존 상세 재료 화면·제품 검색·동의어 통합은 이번 범위에서 확장하지 않았다.
